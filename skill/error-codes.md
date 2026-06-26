# error-codes.md — The Decode Reference

The lookup table for turning a raw code into a named, documented error. This is the most-used file in the skill.

## How to read any code

Logs print errors in **hex**; the `err` field carries **decimal**. Always convert first.

```
custom program error: 0x1771   ->   parseInt("0x1771", 16) = 6001
{"Custom": 6001}               ->   (6001).toString(16) = "1771"
```

Then bucket by the number:

| Decimal range | Meaning | Section |
|---------------|---------|---------|
| `≥ 6000` | **Custom** user error from the program's `#[error_code]` enum | [Custom (6000+)](#custom-6000-user-errors) |
| `100–103` | Anchor instruction errors | [Anchor instruction](#anchor-instruction-errors-100s) |
| `1000–1002` | Anchor IDL instruction errors | rare; IDL/codegen mismatch |
| `2000–2020` | Anchor **constraint** errors | [Anchor constraints](#anchor-constraint-errors-2000s) |
| `2500–2510` | Anchor **require!** errors | [Anchor require](#anchor-require-errors-2500s) |
| `3000–3017` | Anchor **account** errors | [Anchor account](#anchor-account-errors-3000s) |
| `4100–4102` | Anchor program-id / fallback | [Anchor misc](#anchor-misc-4100) |
| `0–25` under **Token** program | SPL Token native error | → [token-errors.md](token-errors.md) |
| `0–N` under **System** program | System native error | [System](#system-program-errors) |

> **Which program raised it?** The same small code (`0x1`) means different things under different programs. Find the nearest `Program <id> failed` line and identify the program id (System = `11111111111111111111111111111111`, Token = `Tokenkeg...`, Token-2022 = `TokenzQd...`, Associated Token = `ATokenGP...`).

---

## Custom (6000+) user errors

Codes ≥ 6000 come from the program's own `#[error_code]` enum. The offset is the enum index:

```
6000 = first  variant   6001 = second   6002 = third  ...
```

**Decode it with the IDL** — you cannot know the meaning without the program's error list:

- Anchor log already decoded it? Look for `Program log: AnchorError occurred. Error Code: <Name>. Error Number: <N>. Error Message: <msg>.` — that's the answer, no IDL needed.
- No AnchorError line (older program, or `require!` without message)? Fetch the IDL and read its `errors` array; index `N-6000` is the variant. IDL sources:
  - On-chain (Anchor ≥ 0.30 publishes IDL): `anchor idl fetch <program-id> --provider.cluster mainnet`
  - From the repo: `target/idl/<program>.json` → `errors[]`.
  - Explorers (Solscan/SolanaFM) often show the decoded name for known programs.

**Example:** `custom program error: 0x1771` → 6001 → second entry in the program's error enum. If the IDL's `errors[1]` is `{ "code": 6001, "name": "SlippageExceeded", "msg": "Slippage tolerance exceeded" }`, that's your cause: the swap moved past the user's slippage limit. Fix = raise slippage or refresh the quote, not a code change.

---

## Anchor instruction errors (100s)

| Code | Name | Meaning & fix |
|------|------|---------------|
| 100 | `InstructionMissing` | 8-byte discriminator didn't match any instruction. Client/IDL out of sync with deployed program — regenerate the client. |
| 101 | `InstructionFallbackNotFound` | No fallback handler. Wrong program id or stale IDL. |
| 102 | `InstructionDidNotDeserialize` | Instruction args don't match the schema — wrong arg types/order, or client built for a different program version. Regenerate client from current IDL. |
| 103 | `InstructionDidNotSerialize` | Program failed to serialize the instruction. |

---

## Anchor constraint errors (2000s)

Raised when an account fails a `#[account(...)]` constraint. The fix is almost always **client-side** (you passed the wrong account) or a **PDA-derivation** mismatch.

| Code | Name | What violated | Fix |
|------|------|---------------|-----|
| 2000 | `ConstraintMut` | Account needed `mut` but wasn't writable | Mark writable / pass the right account. |
| 2001 | `ConstraintHasOne` | `has_one = x` — the account's stored `x` ≠ the `x` you passed | Pass the account whose pubkey matches the stored field (e.g., the real `authority`/`owner`). |
| 2002 | `ConstraintSigner` | Account had to sign and didn't | Add it as a signer. |
| 2003 | `ConstraintRaw` | A custom `constraint = expr` returned false | Read the program's constraint expression; the inputs don't satisfy it. |
| 2004 | `ConstraintOwner` | Account owner ≠ expected program | Pass an account owned by the right program. |
| 2005 | `ConstraintRentExempt` | Account not rent-exempt | Fund to rent-exempt minimum. |
| 2006 | `ConstraintSeeds` | PDA seeds/bump don't derive the passed address | **Most common.** Re-derive the PDA with the exact seeds + program id the program uses. Order and byte-encoding of seeds must match precisely. |
| 2009 | `ConstraintAssociated` | Not the expected associated token account | Derive the ATA correctly (owner, mint, token program). |
| 2011 | `ConstraintClose` | `close = x` target mismatch | Pass the correct rent-recipient. |
| 2012 | `ConstraintAddress` | `address = K` — passed account ≠ hardcoded `K` | Pass exactly the expected pubkey. |
| 2014 | `ConstraintTokenMint` | Token account's mint ≠ expected | Pass a token account for the right mint. |
| 2015 | `ConstraintTokenOwner` | Token account's owner ≠ expected | Pass a token account owned by the right wallet/PDA. |
| 2016–2018 | `ConstraintMint{MintAuthority,FreezeAuthority,Decimals}` | Mint property mismatch | Use the mint with the expected authority/decimals. |
| 2019 | `ConstraintSpace` | `space` mismatch on init | Fix the declared account size. |

> **`ConstraintSeeds` (2006) playbook:** print both the address you passed and the address the program derives (`findProgramAddressSync(seeds, programId)`). They differ → a seed is wrong (often a pubkey vs its bytes, a `u64` little-endian encoding, or a missing constant seed string). Fix the seed list, not the program.

---

## Anchor require errors (2500s)

Raised by `require!`, `require_eq!`, `require_keys_eq!`, etc.

| Code | Name |
|------|------|
| 2500 | `RequireViolated` (`require!(expr)` failed) |
| 2501 | `RequireEqViolated` (`require_eq!(a, b)`) |
| 2502 | `RequireKeysEqViolated` (`require_keys_eq!`) |
| 2503 | `RequireNeqViolated` |
| 2504 | `RequireKeysNeqViolated` |
| 2505 | `RequireGtViolated` |
| 2506 | `RequireGteViolated` |

These are intentional business-logic guards. The `Program log:` line above usually names the condition. Fix = satisfy the precondition (correct amount, state, or account), not the program.

---

## Anchor account errors (3000s)

| Code | Name | Meaning & fix |
|------|------|---------------|
| 3001 | `AccountDiscriminatorNotFound` | Account is empty/uninitialized where an initialized account was expected. Initialize it first. |
| 3002 | `AccountDiscriminatorMismatch` | Account exists but is the **wrong type** (different struct/program). You passed the wrong account. |
| 3003 | `AccountDidNotDeserialize` | Account data doesn't fit the expected struct — wrong account, or schema changed after a program upgrade without migration. |
| 3005 | `AccountNotEnoughKeys` | Fewer accounts than the instruction needs — you omitted one. Check account order/count vs IDL. |
| 3006 | `AccountNotMutable` | Account needs to be writable. |
| 3007 | `AccountOwnedByWrongProgram` | Account is owned by a different program than expected. Classic when passing a System-owned account where a program-owned one is required, or wrong token program (Token vs Token-2022). |
| 3010 | `AccountNotSigner` | Account must sign. |
| 3011 | `AccountNotSystemOwned` | Expected a System-owned (uninitialized) account, got an owned one. |
| 3012 | `AccountNotInitialized` | **Very common.** The account hasn't been created yet (e.g., an ATA you assumed exists). Create it first (e.g., `createAssociatedTokenAccountIdempotent`). |
| 3014 | `AccountNotAssociatedTokenAccount` | Passed a non-ATA where an ATA was required. |

> **`AccountNotInitialized` (3012) vs `AccountDiscriminatorMismatch` (3002):** 3012 = account doesn't exist yet → create it. 3002 = account exists but is the wrong kind → you passed the wrong address.

---

## Anchor misc (4100)

| Code | Name | Meaning |
|------|------|---------|
| 4100 | `DeclaredProgramIdMismatch` | The program's `declare_id!` ≠ the address it's deployed at. Redeploy or fix `declare_id!` and rebuild. |
| 4101 | `TryingToInitPayerAsProgramAccount` | Payer can't be initialized as the program account. |
| 4102 | `InvalidNumericConversion` | A numeric cast (e.g., `u64`→`u32`) overflowed. |

---

## System Program errors

Program id `11111111111111111111111111111111`. Appears as `custom program error: 0x...` **under the System program**.

| Code | Name | Meaning & fix |
|------|------|---------------|
| 0 | `AccountAlreadyInUse` | Trying to create an account that already exists. Don't re-create; or derive a new address. |
| 1 | `ResultWithNegativeLamports` | Transfer would overdraw the source. Insufficient balance. |
| 2 | `InvalidProgramId` | Bad program id in a `create_account`/assign. |
| 3 | `InvalidAccountDataLength` | Wrong `space` for the account being created. |
| 4 | `MaxSeedLengthExceeded` | A seed > 32 bytes. |
| 5 | `AddressWithSeedMismatch` | `createWithSeed` address doesn't match seed/base/owner. |

> Most System failures during account creation reduce to: **not enough lamports for rent**, **already exists**, or **wrong space**. → [diagnose.md](diagnose.md) → "Funds & rent".

---

## SPL Token / Token-2022 errors

These have their own enum and their own gotchas (ATAs, frozen accounts, transfer hooks, decimals). They get a dedicated file: → **[token-errors.md](token-errors.md)**.

Quick map of the codes you'll see most:

| Hex | Dec | Name | Cause |
|-----|-----|------|-------|
| 0x1 | 1 | `InsufficientFunds` | Token balance too low (check decimals!). |
| 0x3 | 3 | `MintMismatch` | Token account's mint ≠ instruction's mint. |
| 0x4 | 4 | `OwnerMismatch` | Wrong owner/authority for the token account. |
| 0xc | 12 | `InvalidInstruction` | Sent a Token instruction to the wrong token program (Token vs Token-2022). |
| 0x11 | 17 | `AccountFrozen` | The token account is frozen by the freeze authority. |
| 0x12 | 18 | `MintDecimalsMismatch` | `transfer_checked` decimals arg ≠ the mint's decimals. |

Full table and fixes → [token-errors.md](token-errors.md).

---

## When the code isn't in any table

It's a **custom (6000+)** error — go decode it with the IDL ([Custom section](#custom-6000-user-errors)). If you genuinely cannot find a meaning, say so explicitly and show the user how to fetch the IDL — **never invent a meaning for a code** (see [../rules/diagnostics.md](../rules/diagnostics.md)).
