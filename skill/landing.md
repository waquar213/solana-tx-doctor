# landing.md — Dropped, Expired & Unreliable Transactions

When a transaction has **no program error** but still doesn't confirm — it was dropped, expired, or lost a fee race. This is a lifecycle problem, not a logic problem. Fixing it is mostly about blockhash freshness, priority fees, tight compute limits, and a correct retry loop.

## First: confirm it's actually a landing problem

| Symptom | It's a landing problem if… |
|---------|----------------------------|
| `getTransaction` returns `null` | The tx never made it on-chain → dropped/expired. |
| `TransactionExpiredBlockheightExceededError` | Blockhash expired before it landed → expiry. |
| `BlockhashNotFound` in preflight | Blockhash too old/from wrong cluster → stale blockhash. |
| Confirms sometimes, fails under load | Fee too low / no priority fee → fee race. |
| `This transaction has already been processed` | Duplicate send of an already-landed tx → see "Duplicate sends". |

If instead you have an `InstructionError`, it's a program failure — go to [diagnose.md](diagnose.md).

## The blockhash lifecycle (why txs expire)

Every non-nonce transaction embeds a **recent blockhash** and is only valid for **150 slots (~60–90 seconds)**. After that the network rejects it as expired. The whole game is: fetch a fresh blockhash, send fast, and stop retrying once it's expired.

```ts
// @solana/web3.js v1 — the correct confirmation pattern
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
tx.recentBlockhash = blockhash;
tx.lastValidBlockHeight = lastValidBlockHeight;

const sig = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: false,        // keep preflight unless you simulate separately
  maxRetries: 0,               // disable RPC auto-retry; we drive retries ourselves
});

// Confirm against the SAME blockhash's validity window:
await connection.confirmTransaction(
  { signature: sig, blockhash, lastValidBlockHeight },
  "confirmed"
);
```

> **Never** confirm with just a signature and a fixed timeout — confirm against `lastValidBlockHeight` so you know *definitively* when the tx can no longer land.

## Priority fees — the #1 reason txs don't land in 2026

Solana orders transactions by **priority fee** (micro-lamports per compute unit). Under any load, a tx with no priority fee loses to those that have one and gets dropped. **Always set one.**

A reliable send sets **two** ComputeBudget instructions at the front of the tx:

```ts
import { ComputeBudgetProgram } from "@solana/web3.js";

const ixs = [
  ComputeBudgetProgram.setComputeUnitLimit({ units: 220_000 }),      // tight CU cap (see compute-budget.md)
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), // the priority fee
  ...yourInstructions,
];
```

**Total priority fee** = `computeUnitLimit × microLamports ÷ 1_000_000` lamports. So `220_000 × 50_000 / 1e6 = 11_000` lamports (~0.000011 SOL). Tightening the CU limit both lowers cost *and* improves scheduling.

### Get the right price (don't hardcode under load)

| Source | Call | Notes |
|--------|------|-------|
| Helius (recommended) | `getPriorityFeeEstimate` | Returns a recommended micro-lamport price per CU based on recent landed txs touching your accounts. Best signal. |
| Vanilla RPC | `getRecentPrioritizationFees([...writableAccounts])` | Returns recent fees for the accounts you're writing; take a high percentile (e.g., p75) and add headroom. |

```ts
// Helius priority fee estimate
const res = await fetch(HELIUS_RPC, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "getPriorityFeeEstimate",
    params: [{ transaction: base64Tx, options: { recommended: true } }],
  }),
}).then(r => r.json());
const microLamports = res.result.priorityFeeEstimate;
```

> **Rule of thumb:** estimate the fee, then **cap** it so a fee spike can't drain a wallet. Re-estimate on each retry — congestion changes fast.

## Compute-unit limit (do this too)

Always set `setComputeUnitLimit` to your **measured** usage + ~10–20% margin. Benefits: lower fee, better scheduling, and you avoid a surprise `exceeded CUs`. Measure via simulation (`unitsConsumed`). → [compute-budget.md](compute-budget.md).

## The robust send-and-confirm loop

Combine everything into one pattern that survives congestion:

```ts
async function sendReliably(connection, buildTx, signers) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = await buildTx({ blockhash, lastValidBlockHeight }); // fresh CU price each attempt
    tx.sign(...signers);
    const raw = tx.serialize();

    const sig = await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });

    // Re-broadcast while the blockhash is still valid; confirm against its window.
    const start = Date.now();
    while (Date.now() - start < 60_000) {
      const status = await connection.getSignatureStatuses([sig]);
      const s = status.value[0];
      if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") {
        if (s.err) throw new Error("Landed but failed: " + JSON.stringify(s.err)); // program error, not landing
        return sig;
      }
      const height = await connection.getBlockHeight("confirmed");
      if (height > lastValidBlockHeight) break; // expired — rebuild with a new blockhash
      await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }); // keep re-broadcasting
      await sleep(2_000);
    }
  }
  throw new Error("Transaction failed to land after retries");
}
```

Key points:
- **`skipPreflight: true` + re-broadcast** is how you maximize landing — but only do this **after** you've simulated the tx separately ([simulation.md](simulation.md)). Skipping preflight blindly means you pay to land a tx that was always going to fail.
- **`maxRetries: 0`** disables the RPC's own retry so *you* control re-broadcast against the blockhash window.
- **Re-broadcast the same signed bytes** every couple seconds until confirmed or expired. Same signature → idempotent, no double-spend.
- On expiry, **rebuild** with a fresh blockhash and (ideally) a fresh fee estimate.

## Jito bundles (atomic, MEV-protected landing)

When you need **atomicity** (all-or-nothing across multiple txs) or you're competing in an MEV-sensitive flow (sniping, liquidations, arbitrage), use **Jito bundles** instead of a plain send:

- Build up to 5 transactions; add a **tip** transfer to a Jito tip account in the last (or a dedicated) tx.
- Submit via `sendBundle` to a Jito Block Engine endpoint.
- The bundle lands **atomically and in order**, or not at all — no partial execution.
- Tip sizing matters like priority fees: too low and the bundle won't be selected. Query Jito's tip floor and bid above it.

Use Jito when: atomic multi-tx, front-running protection, or guaranteed ordering. Use plain priority fees for ordinary single-tx sends.

## Durable nonces (for txs that must survive > 90s)

When a transaction can't be signed-and-sent within the blockhash window — offline signing, multisig collection, scheduled execution — use a **durable nonce** instead of a recent blockhash:

- Create a nonce account; use its stored nonce as the tx's "blockhash."
- The first instruction **must** be `nonceAdvance` (`SystemProgram.nonceAdvance`).
- The tx stays valid until the nonce is advanced — no 90-second expiry.
- After it lands, the nonce auto-advances so the same tx can't replay.

This is the right tool for multisig, hardware-wallet, and treasury workflows — not for everyday sends (it adds an account and an instruction).

## Duplicate sends ("already been processed")

`This transaction has already been processed` / `AlreadyProcessed` means an **identical** transaction (same signature) already landed. Causes & fixes:

| Cause | Fix |
|-------|-----|
| Your retry loop resent after it confirmed | Check `getSignatureStatuses` first; treat "already processed" as **success**, not failure. |
| Reusing a blockhash across two logically-different txs | Add a fresh blockhash (or a no-op nonce/memo) so the second tx has a distinct signature. |
| Double-clicked send in a UI | Debounce; track in-flight signatures. |

> "Already processed" usually means **it worked** — fetch the signature and confirm the on-chain result before retrying anything.

## Staked connections / SWQoS

Under heavy congestion, RPC providers (Helius, Triton, etc.) offer **staked connections / Stake-Weighted QoS** that give your sends prioritized access to the current leader. If you've tuned fees and CU limits and still see drops at peak times, route sends through a staked endpoint. This is an infra change, not a code change — point your sender at the provider's staked send endpoint.

## Landing checklist (apply with `/fix-landing`)

- [ ] Fresh blockhash from `getLatestBlockhash("confirmed")`, with `lastValidBlockHeight` tracked.
- [ ] `setComputeUnitLimit` set to measured usage + margin.
- [ ] `setComputeUnitPrice` from a live estimate (`getPriorityFeeEstimate` / `getRecentPrioritizationFees`), capped.
- [ ] Transaction **simulated** before send ([simulation.md](simulation.md)); then `skipPreflight: true`.
- [ ] `maxRetries: 0` + manual re-broadcast until confirmed or `lastValidBlockHeight` exceeded.
- [ ] Confirm against `{ signature, blockhash, lastValidBlockHeight }`, not a bare timeout.
- [ ] "Already processed" treated as success.
- [ ] Jito bundle if atomicity/ordering/MEV protection is required.
- [ ] Durable nonce if the tx must outlive the ~90s window.
- [ ] Staked connection if drops persist at peak congestion.
