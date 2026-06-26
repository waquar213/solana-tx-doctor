# diagnose.md — The Master Decision Tree

Classify any Solana transaction failure from its logs/error, then route to the fix. Work top-to-bottom; the **first** match is almost always the cause (Solana fails on the first erroring instruction and stops).

## Step 0 — Anatomy of a failure

Every failed transaction gives you up to three signals. Get all three before deciding anything.

1. **The error / status** — `err` field from `getTransaction`, or the thrown `SendTransactionError`. Shapes you'll see:
   - `{"InstructionError":[1,{"Custom":6001}]}` → instruction **index 1** failed with **custom code 6001**.
   - `{"InstructionError":[0,"ComputeBudgetExceeded"]}` → instruction 0 ran out of compute.
   - `"BlockhashNotFound"` / `"AlreadyProcessed"` → transaction-level, not an instruction error.
2. **The logs** — the `logMessages` array. This is the richest signal. Read it **top-down** and stop at the first `failed`. Key lines:
   - `Program <id> invoke [n]` — entered a program at CPI depth `n`.
   - `Program log: ...` — `msg!()` / `console.log` output, often the human-readable cause.
   - `Program log: AnchorError ...` — Anchor's decoded error (gives you the name for free).
   - `Program <id> consumed X of Y compute units` — CU accounting.
   - `Program <id> failed: <reason>` — the verdict.
3. **The simulation** (if pre-send or reproducible) — `simulateTransaction` returns `err`, `logs`, `unitsConsumed`, `returnData`. → [simulation.md](simulation.md)

> **The single most important habit:** find the line `Program <id> failed: ...` and the `Program log:` line(s) immediately above it. That pair is the cause 90% of the time.

## Step 1 — Is it an instruction error or a transaction error?

- **`InstructionError` present** → a program rejected an instruction. Continue to Step 2.
- **No `InstructionError`; message is `BlockhashNotFound`, `block height exceeded`, `AlreadyProcessed`, or the tx isn't on-chain at all** → it's a **landing/lifecycle** problem, not program logic. → [landing.md](landing.md).
- **`SignatureFailure` / `missing required signature`** → signer problem. → "Signers & CPI authority" below.

## Step 2 — Classify the instruction error

Match the error/log signature to a family:

| If you see… | Family | Go to |
|-------------|--------|-------|
| `{"Custom": N}` with `Program log: AnchorError` | Anchor named error | [error-codes.md](error-codes.md) |
| `{"Custom": N}` (N ≥ 6000), no AnchorError line | Custom user error from `#[error_code]` | [error-codes.md](error-codes.md) → "Custom (6000+)" |
| `{"Custom": N}` (N small, e.g. 1) under Token program | SPL Token error | [token-errors.md](token-errors.md) |
| `{"Custom": N}` under System program (`11111...`) | System error (usually funds) | "Funds & rent" below |
| `ComputeBudgetExceeded`, `exceeded CUs`, `exceeded maximum number of instructions` | Compute | [compute-budget.md](compute-budget.md) |
| `ConstraintHasOne / Seeds / Signer / Address`, `AccountNotInitialized`, `owned by wrong program` | Anchor account/constraint | [error-codes.md](error-codes.md) → constraints |
| `insufficient lamports`, `insufficient funds for rent` | Funds & rent | "Funds & rent" below |
| `unauthorized signer or writable account` | CPI authority | "Signers & CPI authority" below |
| `Account frozen`, transfer-hook / extension failure | Token-2022 | [token-errors.md](token-errors.md) |
| `loads an address table account that doesn't exist`, `invalid account index` | ALT | "Versioned tx & ALTs" below |
| `ProgramFailedToComplete`, `Program failed to complete` with no clear log | Panic / unwrap | "Program panics" below |

### Reading a `Custom` code fast

The `Custom` number is in **decimal**. The logs usually show **hex** (`custom program error: 0x1771`). Convert: `0x1771 = 6001`. Then:

- **≥ 6000** → custom Anchor user error. Offset from 6000 = the index in the program's `#[error_code]` enum (6000 = first error, 6001 = second…). Decode with the IDL → [error-codes.md](error-codes.md).
- **2000–4100** → Anchor framework error (constraint/account/require). → [error-codes.md](error-codes.md).
- **Small (0–25) under SPL Token / System** → that program's native error enum. → [error-codes.md](error-codes.md) / [token-errors.md](token-errors.md).

> Conversion one-liner (Node): `parseInt("0x1771", 16)` → `6001`. Or `(6001).toString(16)` → `"1771"`.

---

## Funds & rent

**Signatures:** `insufficient lamports`, `Transfer: insufficient lamports A < B`, `insufficient funds for rent`, `custom program error: 0x1` under System or Token program.

| Cause | How to confirm | Fix |
|-------|----------------|-----|
| Payer can't cover transfer + fees | Compare payer balance to amount + ~5000 lamports/sig + priority fee | Fund the payer; reduce amount; lower priority fee. |
| New account not rent-exempt | Log says `insufficient funds for rent` | Fund the new account to the rent-exempt minimum (`getMinimumBalanceForRentExemption(space)`). |
| `0x1` under SPL Token = `InsufficientFunds` | Error is from the Token program id, not System | Source token account lacks balance; check decimals (amount is in base units). → [token-errors.md](token-errors.md) |
| Account being created already exists | `already in use` | Account exists; don't re-create, or derive a fresh address. |

**Gotcha:** SPL Token amounts are in **base units**, not UI amounts. Sending "1 USDC" means `1_000_000` (6 decimals). An off-by-decimals bug looks like `InsufficientFunds`.

---

## Signers & CPI authority

**Signatures:** `missing required signature for instruction`, `Cross-program invocation with unauthorized signer or writable account`, `{"InstructionError":[i,"MissingRequiredSignature"]}`.

| Cause | Fix |
|-------|-----|
| A required signer wasn't added to the tx | Add the missing `Signer`/keypair; in `@solana/kit` ensure the account is in `signers`. |
| Wallet signed, but the instruction expects a different authority | Match the `authority`/`owner` account to the actual signer (common with token transfers and PDA-owned accounts). |
| **CPI with PDA signer missing `invoke_signed`** | In the program, sign the CPI with the PDA's seeds via `invoke_signed` / `CpiContext::new_with_signer`. A PDA can't sign from the client — only the owning program can. |
| Writable account not marked writable | Mark the account `mut` (Anchor) / `isWritable: true` (raw). |
| Fee payer not a signer | The fee payer must always sign. |

> `unauthorized signer or writable account` at **CPI depth ≥ 1** almost always means a program tried to sign for a PDA without the right seeds, or passed an account as writable that the caller didn't mark writable. Check the **inner** instruction's account metas.

---

## Versioned tx & ALTs

**Signatures:** `Transaction loads an address table account that doesn't exist`, `invalid account index`, `Transaction version 0 is not supported` (when *fetching*), `failed to load address lookup table`.

| Cause | Fix |
|-------|-----|
| Fetching a v0 tx without version support | Pass `maxSupportedTransactionVersion: 0` to `getTransaction`/`getParsedTransaction`. |
| ALT was closed/deactivated | The lookup table account no longer exists — rebuild the tx without it or recreate the table. |
| ALT not yet "warm" | A newly created ALT needs one slot to activate before use; wait a slot. |
| Index out of range | The tx references more accounts than the table holds — table/extension got out of sync; rebuild. |
| Too many accounts even with ALT | v0 + ALTs raise the limit but a single tx is still capped at 1232 bytes serialized; split into multiple txs. |

---

## Program panics

**Signatures:** `Program failed to complete`, `ProgramFailedToComplete`, log shows `panicked at ...` or an arithmetic/`unwrap` line with no custom error.

This is a bug **inside** the program (not your client). Common causes: integer overflow (`a + b` overflowed), `.unwrap()` on `None`/`Err`, out-of-bounds slice, division by zero.

- If it's **your** program: reproduce in a `LiteSVM`/`Mollusk` test, add checked math (`checked_add`), guard `unwrap`s, and return a named error instead. → route program work to [solana-dev-skill](../solana-dev/SKILL.md).
- If it's a **third-party** program: read its source/IDL for the failing instruction; you're likely passing inputs it doesn't guard against (e.g., zero amount, wrong account order).

---

## Step 3 — Prescribe and verify

Once classified:

1. State the **root cause** in one sentence, citing the exact log line / error code.
2. Give the **minimal fix** — the smallest change that addresses the cause (not a rewrite).
3. **Verify**: re-simulate (→ [simulation.md](simulation.md)) or resend and confirm the new status. Apply the **two-strike rule** — if the fix fails twice, stop and report observations rather than looping.

> **Decode, don't guess.** If you cannot point at a specific log line or error code, you have not finished Step 0 — get more evidence (fetch the tx, pull logs, simulate) before prescribing anything. See [../rules/diagnostics.md](../rules/diagnostics.md).
