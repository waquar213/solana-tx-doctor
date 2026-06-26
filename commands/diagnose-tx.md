---
name: diagnose-tx
description: Diagnose a failed Solana transaction end-to-end from a signature, raw logs, or an error. Fetches evidence, classifies the failure, decodes the exact error code, and prescribes the minimal fix.
argument-hint: <signature | pasted logs | error message>
---

Diagnose the failed Solana transaction described by: **$ARGUMENTS**

Follow the `solana-tx-doctor` skill's decode → explain → fix loop. Do not guess — cite the exact log line or error code behind every conclusion.

## Steps

1. **Gather evidence** (`skill/tooling.md`):
   - If `$ARGUMENTS` is a **signature** (base58, ~88 chars): fetch it. Prefer running the bundled decoder:
     ```bash
     node scripts/decode-tx.mjs $ARGUMENTS
     ```
     or `solana confirm -v $ARGUMENTS`, or `getTransaction` with `maxSupportedTransactionVersion: 0`. Add `--url <rpc>` for devnet/custom clusters if the mainnet fetch returns null.
   - If `$ARGUMENTS` is **logs or an error**: use them directly.
   - If reproducible and pre-send: **simulate** (`skill/simulation.md`).

2. **Classify** the failure family using `skill/diagnose.md`. Find the first `Program ... failed` line and the `Program log:` line above it.

3. **Decode** the error with `skill/error-codes.md`. Convert hex→decimal first. For custom (≥6000) codes, decode via the program's IDL (`anchor idl fetch <program-id>`) — never invent a meaning. For token failures use `skill/token-errors.md`; for compute use `skill/compute-budget.md`; for dropped/expired use `skill/landing.md`.

4. **Prescribe** the single minimal fix. Mark it clearly as **client-side** (wrong account, decimals, missing ATA, fees, blockhash) or **program-side** (route program edits to solana-dev-skill).

5. **Verify**: re-simulate or resend and confirm the new status. Two-strike rule applies.

## Output

- **Root cause** (one sentence + the cited code/log line)
- **Why** (the mechanism)
- **Fix** (concrete, minimal, copy-pasteable)
- **Verify** (how to confirm)

If you cannot fetch the transaction (e.g., wrong cluster, pruned, or not found), say so and ask for the cluster/RPC or the raw logs — do not speculate about the cause.
