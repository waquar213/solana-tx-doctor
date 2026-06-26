# rules/diagnostics.md — Diagnostic Discipline

Non-negotiable rules for the `solana-tx-doctor` skill. These keep diagnoses accurate and safe.

## 1. Decode, don't guess

Every conclusion must cite a specific **error code** or **log line**. If you cannot point at one, you have not gathered enough evidence — fetch the transaction, pull the logs, or simulate before saying anything about the cause. "It's probably a fee issue" without evidence is a violation.

## 2. Never fabricate an error-code meaning

- Framework codes (Anchor 100–4100, SPL Token, System) are decoded from the tables in `error-codes.md` / `token-errors.md`.
- **Custom codes (≥ 6000) cannot be known without the program's IDL.** If you don't have it, say so and show the user how to fetch it (`anchor idl fetch <program-id>` or read `target/idl/<program>.json` → `errors[]`). Do **not** invent a plausible-sounding name.

## 3. Convert hex→decimal before decoding

Logs show hex (`0x1771`); the `err` field shows decimal (`6001`). Always convert and state both so the user can verify. `parseInt("0x1771",16) === 6001`.

## 4. First failure wins

Solana stops at the **first** erroring instruction. Read logs top-down and diagnose the first `Program ... failed`, not a later cascade. Identify the failing instruction **index** and the **program id** that raised it.

## 5. Distinguish landing problems from logic problems

No `InstructionError` (dropped, expired, `BlockhashNotFound`, `AlreadyProcessed`) ⇒ a **lifecycle** problem (`landing.md`), not a program bug. Don't prescribe code changes for what is a fee/blockhash issue, or vice versa.

## 6. Read-only by default; never move funds

- Default to investigation: fetch, simulate, decode. The bundled `decode-tx.mjs` is read-only.
- **Never** sign or submit a transaction, transfer funds, or run a live (non-simulation) send without explicit user confirmation.
- Prefer **simulation** to reproduce a failure over a real send.
- Never ask for or handle a user's private key/seed phrase. Diagnosis needs only public signatures, logs, and addresses.

## 7. Prescribe the minimal fix

The smallest change that addresses the cited cause — not a rewrite. Mark each fix **client-side** or **program-side**; route program edits to `solana-dev-skill`.

## 8. Two-strike rule

If the same fix fails twice, **STOP**. Report exactly what you observed (codes, logs, sim results) and ask for guidance instead of looping on variations.

## 9. Verify before declaring done

A diagnosis isn't complete until the fix is verified by re-simulation or a successful resend (or, when neither is possible, until you've clearly stated the expected outcome and how the user can confirm it).

## 10. Version-aware

The Solana runtime evolves (CU caps, fee mechanics, Token-2022 extensions). When a detail is version-sensitive, verify against the sources in `resources.md` rather than relying on memory, and note any uncertainty explicitly.
