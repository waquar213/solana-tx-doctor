# tooling.md — The Diagnostic Toolbox

How to pull the evidence: RPC methods, the Solana CLI, block explorers, enhanced APIs, and the bundled decoder script.

## Fetch a transaction by signature (RPC)

### @solana/web3.js v1

```ts
const tx = await connection.getTransaction(signature, {
  maxSupportedTransactionVersion: 0,   // REQUIRED or v0 txs throw
  commitment: "confirmed",
});
const { err } = tx.meta;                  // the failure (null if success)
const logs = tx.meta.logMessages;         // the gold — read top-down
const cu = tx.meta.computeUnitsConsumed;  // CUs used
```

> **`maxSupportedTransactionVersion: 0` is mandatory.** Omit it and fetching any versioned (v0) transaction throws `Transaction version (0) is not supported`. This is the #1 "my fetch crashes" gotcha.

### Raw JSON-RPC (any language)

```bash
curl https://api.mainnet-beta.solana.com -s -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc":"2.0","id":1,"method":"getTransaction",
  "params":["<SIGNATURE>",{"maxSupportedTransactionVersion":0,"encoding":"json"}]
}'
```

### Key RPC methods for diagnosis

| Method | Use |
|--------|-----|
| `getTransaction` | Full record: `meta.err`, `meta.logMessages`, `meta.computeUnitsConsumed`, accounts. |
| `simulateTransaction` | Dry-run a tx; get `err`, `logs`, `unitsConsumed`, `returnData`. → [simulation.md](simulation.md) |
| `getSignatureStatuses` | Is it confirmed/finalized? Did it error? Lightweight polling in retry loops. |
| `getRecentPrioritizationFees` | Recent priority fees for given writable accounts. → [landing.md](landing.md) |
| `getLatestBlockhash` | Fresh blockhash + `lastValidBlockHeight` for sending. |
| `getSignaturesForAddress` | All recent signatures touching an account — find the failing tx if you only have the address. |

## Solana CLI

```bash
# Verbose decode of a submitted transaction — logs, status, fee, CUs
solana confirm -v <SIGNATURE>

# Point at a cluster
solana confirm -v <SIGNATURE> --url mainnet-beta   # or devnet, or a custom RPC URL

# Fetch an account's owner/data (check "owned by wrong program")
solana account <PUBKEY> --output json

# Anchor: decode an IDL error / fetch the on-chain IDL
anchor idl fetch <PROGRAM_ID> --provider.cluster mainnet
```

`solana confirm -v` is the fastest way to get human-readable logs for a signature without writing code.

## Block explorers (paste a signature)

| Explorer | Strengths |
|----------|-----------|
| **Solana Explorer** (`explorer.solana.com`) | Official; raw logs, instruction breakdown, account list. Switch clusters (mainnet/devnet/custom). |
| **Solscan** (`solscan.io`) | Decodes known programs/instructions, token transfers, and many custom errors by name. |
| **SolanaFM** (`solana.fm`) | Strong human-readable instruction decoding and account labels. |
| **Helius dashboard / `xray`** | Enhanced, human-readable transaction view with parsed actions. |

> When you only have a signature and want a fast human-readable cause, paste it into Solscan or SolanaFM first — they often name the custom error and decode the instructions for you. For *programmatic* diagnosis, use RPC + the decoder below.

## Enhanced APIs (Helius)

| API | Use |
|-----|-----|
| `getPriorityFeeEstimate` | Recommended micro-lamport CU price for reliable landing. → [landing.md](landing.md) |
| Enhanced Transactions / parsed history | Human-readable, typed description of what a tx did (transfers, swaps, NFT events). |
| Webhooks | Stream txs for an address — catch failures in production as they happen. |

## The bundled decoder: `decode-tx.mjs`

A zero-dependency Node script (uses built-in `fetch`) that fetches a transaction by signature over public RPC and prints a structured diagnosis: status, error, decoded custom code (hex→dec, with the Anchor-range hint), CUs consumed, and the log tail. **Read-only** — it never signs or sends anything.

```bash
# Mainnet (default)
node scripts/decode-tx.mjs <SIGNATURE>

# Other clusters / custom RPC
node scripts/decode-tx.mjs <SIGNATURE> --url https://api.devnet.solana.com
node scripts/decode-tx.mjs <SIGNATURE> --url $HELIUS_RPC
```

It's intentionally small and transparent — open it and read it. It does not replace the decision tree in [diagnose.md](diagnose.md); it just gathers and pre-decodes the evidence so you can classify faster.

## Picking a commitment

| Commitment | When |
|------------|------|
| `processed` | Fastest, least safe; fine for quick polling, can be rolled back. |
| `confirmed` | Default for most diagnosis and sending — good speed/safety balance. |
| `finalized` | Strongest guarantee; use when you must be certain a tx is permanent. |

Diagnose with `confirmed` unless you specifically need finality.
