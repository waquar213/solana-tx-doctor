---
name: fix-landing
description: Audit a Solana transaction sender for landing reliability and apply priority-fee, compute-unit, retry, and blockhash fixes so transactions stop getting dropped or expiring.
argument-hint: [path to the file/function that builds & sends the tx]
---

Audit and harden the transaction sender for landing reliability: **$ARGUMENTS**

If no path is given, ask which file/function builds and sends transactions, then proceed. Use `skill/landing.md` (and `skill/compute-budget.md`, `skill/simulation.md`) as the reference.

## Audit checklist — verify each, then fix what's missing

1. **Fresh blockhash** — uses `getLatestBlockhash("confirmed")` and tracks `lastValidBlockHeight`. Flag any reused/stale blockhash.
2. **Compute unit limit** — sends `setComputeUnitLimit` sized to **measured** usage (from simulation `unitsConsumed`) + ~15% margin. Flag missing limit (defaults to 200k → likely `exceeded CUs`) or a wasteful `1_400_000`.
3. **Priority fee** — sends `setComputeUnitPrice` from a **live** estimate (`getPriorityFeeEstimate` or `getRecentPrioritizationFees`), with a cap. Flag hardcoded-zero or no priority fee.
4. **Simulate-then-skip-preflight** — simulates before sending, then sends with `skipPreflight: true`. Flag blind `skipPreflight` with no prior simulation.
5. **Retry control** — `maxRetries: 0` with a manual re-broadcast loop that stops at `lastValidBlockHeight`. Flag reliance on RPC auto-retry or fixed-timeout confirmation.
6. **Confirmation** — confirms against `{ signature, blockhash, lastValidBlockHeight }`, not a bare timeout.
7. **Idempotency** — treats `This transaction has already been processed` as success.
8. **Escalation paths** — recommend **Jito bundles** if atomicity/ordering/MEV protection is needed, **durable nonces** if a tx must outlive the ~90s window, and a **staked connection** if drops persist at peak congestion.

## Deliverables

- A short audit table: each checklist item → ✅ present / ❌ missing / ⚠️ weak, with the line reference.
- The concrete code changes (diffs) to fix every ❌/⚠️, matching the surrounding code style.
- A one-line summary of the expected reliability improvement.

Do not change program logic or move funds. This command only hardens the **sending** path. Verify by simulating the rebuilt transaction before recommending it for production.
