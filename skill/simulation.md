# simulation.md — Simulate Before (and After) You Send

Simulation runs a transaction against the current bank **without** committing it — no fee, no state change. It's the cheapest way to catch a failure, measure compute, and preview results. Simulate before every non-trivial send, and simulate again to verify a fix.

## Why simulate

- **Catch failures for free** — see the exact error and logs before paying.
- **Measure compute** — `unitsConsumed` drives your CU limit. → [compute-budget.md](compute-budget.md)
- **Preview results** — `returnData` and account deltas show what *would* happen.
- **Decode safely** — you get the same logs an on-chain failure would, on demand and reproducibly.

## The call

### @solana/web3.js v1

```ts
const sim = await connection.simulateTransaction(tx, {
  sigVerify: false,            // don't require valid signatures while debugging
  replaceRecentBlockhash: true,// avoid "Blockhash not found" during simulation
  commitment: "confirmed",
});

const { err, logs, unitsConsumed, returnData } = sim.value;
```

### @solana/kit (web3.js v2)

```ts
import { getSimulateTransactionApi } from "@solana/kit";
// via the RPC: rpc.simulateTransaction(base64Tx, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true })
const sim = await rpc.simulateTransaction(base64Tx, {
  encoding: "base64",
  sigVerify: false,
  replaceRecentBlockhash: true,
}).send();
```

### CLI

```bash
# Simulate without sending (great for a pasted/serialized tx)
solana confirm -v <SIGNATURE>          # inspect an already-submitted tx
# Anchor: `anchor test` runs against a local validator with full logs
```

## Read the result

| Field | What it tells you |
|-------|-------------------|
| `err` | `null` = would succeed. Otherwise the same `InstructionError` you'd get on-chain → [diagnose.md](diagnose.md). |
| `logs` | Full `logMessages`. Read top-down to the first `failed`. → [diagnose.md](diagnose.md) |
| `unitsConsumed` | CUs the tx used — size your `setComputeUnitLimit` from this. → [compute-budget.md](compute-budget.md) |
| `returnData` | Base64 return value from the last program that set one (e.g., a quote, a computed PDA). |
| `accounts` | If you request `accounts: {...}`, the post-sim state of named accounts — preview balance/owner changes. |

## Why preflight ≠ on-chain (and simulation can lie)

Simulation runs against a **recent** bank, not the exact slot your tx will land in. Mismatches happen:

| Difference | Why | Mitigation |
|------------|-----|------------|
| Sim passes, on-chain fails | State changed between sim and execution (another tx moved funds, an account got initialized/closed, an oracle/price updated, slippage moved). | Re-simulate close to send; widen slippage/tolerances; add CU margin. |
| Sim fails, on-chain would pass | `replaceRecentBlockhash`/`sigVerify` differences, or sim used stale state. | Set `replaceRecentBlockhash: true`; ensure correct commitment. |
| `Blockhash not found` only in sim | Sim required a valid recent blockhash. | Pass `replaceRecentBlockhash: true`. |
| Different CU usage sim vs chain | `init_if_needed` initialized in reality but not in sim (or vice versa), branch taken differently. | Add 15–20% CU headroom. |

> **Takeaway:** simulation is the best pre-flight check you have, but it's a *forecast*, not a guarantee. Treat a clean simulation as "no logic bug," then handle the time-gap risks (slippage, races, CU margin) explicitly.

## The recommended send shape

1. Build the tx with ComputeBudget instructions (limit + price). → [landing.md](landing.md)
2. **Simulate** with `sigVerify:false, replaceRecentBlockhash:true`.
3. If `err` → diagnose and fix; loop (two-strike rule).
4. If clean → set CU limit from `unitsConsumed` + margin, sign, and send with `skipPreflight: true` (you already simulated) + manual retry. → [landing.md](landing.md)
5. **Re-simulate after a fix** to verify before resending.

This gives you the safety of preflight *and* the landing speed of `skipPreflight`, without paying to land a doomed transaction.
