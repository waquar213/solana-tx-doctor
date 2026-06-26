# compute-budget.md — `exceeded CUs` and Compute Tuning

When a transaction fails with a compute error, it ran out of its compute-unit (CU) budget mid-execution. Fix = measure real usage and request the right limit (and don't waste CUs).

## The signatures

| Log / error | Meaning |
|-------------|---------|
| `Program <id> consumed 200000 of 200000 compute units` followed by `failed: exceeded CUs meter` | Hit the per-instruction default (200k) — no explicit limit was set. |
| `Computational budget exceeded` | Transaction-level CU budget exhausted. |
| `Program failed to complete: exceeded maximum number of instructions allowed` | Too many executed instructions (often an unbounded loop). |
| `{"InstructionError":[i,"ComputeBudgetExceeded"]}` | Instruction `i` ran out of CUs. |
| `exceeded CUs meter at BPF instruction` | Same — out of compute. |

## The limits (June 2026)

| Budget | Default | Max |
|--------|---------|-----|
| Per **instruction** | 200,000 CU | — (raise via request) |
| Per **transaction** | 200,000 CU × … capped | **1,400,000 CU** (hard cap) |
| Heap | 32 KB | 256 KB (via `requestHeapFrame`) |
| CPI depth | 4 | 4 (cannot raise) |
| Stack frame | 4 KB per frame | fixed |

If you don't send a `setComputeUnitLimit` instruction, you get the **default 200k per instruction** — a non-trivial program often blows past this. The fix is rarely "the program is too heavy"; it's "you didn't ask for enough CUs."

## Fix in three steps

### 1. Measure actual usage

Simulate the transaction and read `unitsConsumed`:

```ts
const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
console.log("CUs used:", sim.value.unitsConsumed); // e.g. 187432
```

Or in logs, sum the `consumed X of Y compute units` lines, or use Helius `simulateTransaction` / the bundled [`decode-tx.mjs`](../scripts/decode-tx.mjs) which prints `unitsConsumed`.

### 2. Request a tight limit (measured + margin)

```ts
import { ComputeBudgetProgram } from "@solana/web3.js";
const units = Math.ceil(187_432 * 1.15); // measured + 15% headroom
const ix = ComputeBudgetProgram.setComputeUnitLimit({ units });
```

Set it as tight as you safely can: it **lowers the priority fee** (fee = limit × price ÷ 1e6) and **improves scheduling**. Don't just slam `1_400_000` — that overpays and schedules worse. But do leave margin: account state can shift between simulation and execution (e.g., an `init_if_needed` that now must initialize), nudging usage up.

### 3. Pair with a priority-fee price

```ts
const price = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 });
const ixs = [ix, price, ...yourInstructions]; // ComputeBudget ixs go first
```

→ Priority-fee sizing and live estimates are in [landing.md](landing.md).

## When raising the limit isn't enough

If you genuinely need > 1.4M CU, the limit won't save you — the program is doing too much in one tx. Options:

| Situation | Fix |
|-----------|-----|
| Unbounded loop over accounts/items | Paginate: process N per tx across multiple txs. |
| Many independent operations batched | Split into separate transactions. |
| Heavy CPI chains | Reduce CPI depth (max 4) or flatten the call graph. |
| Large on-chain computation (hashing, crypto) | Move off-chain where possible; store only the result/proof. |
| Big heap allocations failing | `ComputeBudgetProgram.requestHeapFrame({ bytes })` up to 256 KB (costs extra CUs). |
| Account data too large to touch | Use zero-copy (`AccountLoader`) / `realloc` in steps. |

> If it's **your** program eating CUs, profile with `sol_log_compute_units()` around hot sections, prefer zero-copy deserialization, avoid heap allocs in loops, and use checked math without redundant work. Route program-level optimization to [solana-dev-skill](../solana-dev/SKILL.md).

## Quick diagnosis table

| You observe | Cause | Action |
|-------------|-------|--------|
| Fails at exactly 200,000 CU | No `setComputeUnitLimit` set | Add one sized to measured usage. |
| Simulated usage ≈ requested limit, fails on-chain | No margin | Add 15–20% headroom. |
| Usage > 1,400,000 | Doing too much per tx | Split / paginate. |
| `exceeded maximum number of instructions` | Loop runs too long | Bound the loop; paginate. |
| Works alone, fails when batched with other ixs | Shared tx CU budget exhausted | Raise limit or split the tx. |
