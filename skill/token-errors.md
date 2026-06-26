# token-errors.md — SPL Token & Token-2022 Failures

Token transfers fail in a handful of predictable ways: a missing associated token account (ATA), a frozen account, wrong decimals, the wrong token program, or a Token-2022 extension (transfer hook/fee) doing something the client didn't account for. Identify the program first, then the code.

## Which token program?

| Program | Id prefix | Notes |
|---------|-----------|-------|
| **SPL Token** | `Tokenkeg...` | The classic token program. |
| **Token-2022** | `TokenzQd...` | Token Extensions program. Different id — instructions are **not** interchangeable. |
| **Associated Token** | `ATokenGP...` | Derives/creates ATAs; takes the token program as an input. |

> **A huge share of token bugs are "wrong token program."** A mint created with Token-2022 must be used with Token-2022 instructions and its ATA derived with the Token-2022 program id. Mixing them yields `InvalidInstruction (0xc)`, `AccountOwnedByWrongProgram (3007)`, or `IncorrectProgramId`.

## SPL Token error codes

`custom program error: 0x...` under a token program id maps to `TokenError`:

| Hex | Dec | Name | Cause & fix |
|-----|-----|------|-------------|
| 0x0 | 0 | `NotRentExempt` | Token account underfunded. Fund to rent-exempt minimum. |
| 0x1 | 1 | `InsufficientFunds` | Token balance too low. **Check decimals** — amounts are base units, not UI amounts. |
| 0x2 | 2 | `InvalidMint` | Mint account isn't a valid mint. Wrong address. |
| 0x3 | 3 | `MintMismatch` | Token account's mint ≠ the mint in the instruction. Pass the matching token account. |
| 0x4 | 4 | `OwnerMismatch` | Authority signing ≠ the token account's owner/delegate. Sign with the right owner, or set a delegate. |
| 0x5 | 5 | `FixedSupply` | Tried to mint past a fixed supply. |
| 0x6 | 6 | `AlreadyInUse` | Account already initialized. Use idempotent create, or a different address. |
| 0xb | 11 | `NonNativeHasBalance` | Closing a token account with non-zero balance. Empty it first. |
| 0xc | 12 | `InvalidInstruction` | Instruction sent to the wrong token program (Token vs Token-2022). |
| 0xd | 13 | `InvalidState` | Account in an invalid state for the op. |
| 0xe | 14 | `Overflow` | Arithmetic overflow on amount. |
| 0x11 | 17 | `AccountFrozen` | Freeze authority froze the account. Only the freeze authority can `thaw`. |
| 0x12 | 18 | `MintDecimalsMismatch` | `transfer_checked`/`*_checked` decimals arg ≠ the mint's decimals. Pass the mint's real decimals. |

## The single most common token failure: missing ATA

`AccountNotInitialized (3012)` in Anchor, or a transfer that fails because the **recipient has no token account** for that mint. ATAs are **not** auto-created.

```ts
// Always create the destination ATA idempotently before transferring
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";

const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID); // or TOKEN_2022_PROGRAM_ID
const createIx = createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint, TOKEN_PROGRAM_ID);
// ...then the transfer instruction, in the same tx
```

- Use the **idempotent** create — it's a no-op if the ATA already exists, so you never race on "already in use."
- Pass the **correct token program** to both the ATA derivation and the create instruction. A Token-2022 mint needs `TOKEN_2022_PROGRAM_ID` everywhere.
- The fee payer funds the new ATA's rent (~0.002 SOL); ensure they have it.

## Decimals: the silent corruptor

Token amounts are integers in **base units**. "Send 1.5 USDC" (6 decimals) = `1_500_000`. Symptoms of a decimals bug:

- `InsufficientFunds (0x1)` when the balance is "obviously" enough → you sent 10^6× too much.
- A transfer that "works" but moves a microscopic/huge amount → off by `10^decimals`.
- `MintDecimalsMismatch (0x12)` → you passed the wrong `decimals` to a `*_checked` instruction.

Always fetch the mint's `decimals` and compute `amount * 10 ** decimals` with **BigInt**, never floats. Prefer the `_checked` instructions (`transferChecked`, `mintToChecked`) so the program enforces decimals for you.

## Token-2022 extensions — the new failure surface

Token-2022 mints can carry **extensions** that change transfer behaviour. A client written for plain SPL Token will fail against them. Identify the extensions on the mint (parse the mint account, or check an explorer) and handle each:

| Extension | Failure it causes | Fix |
|-----------|-------------------|-----|
| **Transfer Hook** | Transfer fails because the hook program's extra accounts weren't supplied. | Resolve the hook's extra account metas (via `getExtraAccountMetas` / the resolve helper) and append them to the transfer instruction. Use `createTransferCheckedWithTransferHookInstruction`. |
| **Transfer Fee** | Recipient receives less than sent; "amount mismatch" logic breaks. | Account for the fee: compute net amount; use `transferCheckedWithFee` when withdrawing fees. |
| **Confidential Transfer** | Plain transfer rejected; account needs configuration. | Requires the confidential-transfer flow (configure account, deposit/apply). Out of scope for a normal transfer — route to the program's SDK. |
| **Non-Transferable** | Any transfer fails by design (soulbound). | The token cannot be moved — this is intended; don't try to transfer. |
| **Permanent Delegate** | A third party can move tokens unexpectedly. | Not an error per se; be aware the mint authority can seize. |
| **Default Account State = Frozen** | Newly created ATAs are frozen → `AccountFrozen (0x11)`. | The mint freezes new accounts by default; the freeze authority must `thaw` before use. |
| **Mint Close Authority** | Mint can be closed; downstream assumptions break. | Handle the mint possibly disappearing. |

> **Diagnosing a Token-2022 transfer failure:** (1) confirm the mint is owned by `TokenzQd...`; (2) list its extensions; (3) for a **transfer hook**, the usual cause is missing extra accounts — that's the first thing to add. Use `@solana/spl-token`'s transfer-hook-aware helpers rather than the plain `createTransferCheckedInstruction`.

## Quick routing

| You see… | Cause | Fix |
|----------|-------|-----|
| `AccountNotInitialized` on a token account | Missing ATA | Create idempotently first. |
| `0x1 InsufficientFunds` with "enough" balance | Decimals bug | Use base units / BigInt. |
| `0xc InvalidInstruction` | Wrong token program | Use Token-2022 instructions for Token-2022 mints. |
| `0x11 AccountFrozen` | Frozen (freeze authority or default-frozen extension) | Freeze authority must `thaw`. |
| `0x12 MintDecimalsMismatch` | Wrong `decimals` to a checked ix | Pass the mint's real decimals. |
| `3007 AccountOwnedByWrongProgram` on a token account | Token vs Token-2022 mixup | Match the token program everywhere. |
| Transfer fails only for one specific mint | Token-2022 extension (likely transfer hook) | Add the hook's extra accounts. |
