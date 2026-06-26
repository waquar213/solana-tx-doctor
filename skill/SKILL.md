---
name: solana-tx-doctor
description: Diagnose and fix failed, reverted, or dropped Solana transactions. Decodes transaction logs, Anchor/SPL/system custom program error codes, account-constraint violations, compute-budget overruns, and signature/blockhash problems — then explains the root cause and the exact fix. Also fixes transactions that never land (priority fees, compute-unit tuning, retries, Jito bundles, durable nonces). Use whenever a transaction failed in simulation or on-chain, a signature shows "custom program error: 0x...", a tx was dropped/expired, or sends are unreliable. Pairs with solana-dev-skill for program development.
user-invocable: true
---

## Solana Transaction Doctor

**Companion to**: [solana-dev-skill](../solana-dev/SKILL.md) — core Solana development (programs, frontend, testing). This skill is the *runtime* counterpart: it diagnoses what went wrong when a transaction misbehaves and tells you how to fix it.

### What This Skill Is For

Reach for this skill the moment a transaction does anything other than confirm cleanly:

- **A transaction failed** — in preflight/simulation or on-chain. You have a signature, a `SendTransactionError`, or a wall of program logs and need the root cause.
- **You see a cryptic error** — `custom program error: 0x1771`, `AnchorError ... Error Code: ConstraintHasOne`, `exceeded CUs`, `Blockhash not found`, `Cross-program invocation with unauthorized signer`.
- **Transactions don't land** — they get dropped, expire (`block height exceeded`), or confirm only sometimes under load.
- **You're hardening a sender** — you want correct priority fees, tight compute-unit limits, a robust retry loop, Jito bundles, or durable nonces before shipping.

If the user is *writing* a program, route program-authoring questions to [solana-dev-skill](../solana-dev/SKILL.md). This skill owns the **diagnose → explain → fix** loop for transactions.

### The Core Doctrine

> **Never guess. Decode.** A Solana failure always carries its cause in the logs, the error code, and the simulation. The job is to extract the signal mechanically, map the code to a named error, and prescribe the minimal fix — not to speculate.

The diagnostic loop is always the same:

1. **Get the evidence** — pull the transaction (logs, error, status) by signature, or re-run a simulation. → [tooling.md](tooling.md)
2. **Classify the failure** — which of the failure families is this? → [diagnose.md](diagnose.md)
3. **Decode the code** — map `0x...` / Anchor code / log string to a named, documented error. → [error-codes.md](error-codes.md)
4. **Prescribe the fix** — the specific, minimal change. → the relevant fix file below.
5. **Verify** — re-simulate or resend and confirm the fix landed.

### Operating Procedure

#### 1. Establish what you have

| You have… | Do this first |
|-----------|---------------|
| A transaction signature | Fetch it with `getTransaction` (set `maxSupportedTransactionVersion: 0`) or `solana confirm -v <sig>`. → [tooling.md](tooling.md) |
| A `SendTransactionError` / thrown error in app code | Extract `.logs` (call `.getLogs()` if needed) and the error message. → [diagnose.md](diagnose.md) |
| A tx that "did nothing" / never confirmed | It was dropped or expired — this is a *landing* problem, not a program error. → [landing.md](landing.md) |
| Only the program logs (pasted) | Go straight to classification. → [diagnose.md](diagnose.md) |
| Nothing yet (pre-send) | Simulate first to catch the failure before paying for it. → [simulation.md](simulation.md) |

#### 2. Classify into a failure family

Every failure is one of these. Match on the log/error signature, then open the linked file.

| Family | Signature in logs/error | Where to go |
|--------|-------------------------|-------------|
| **Custom program error** | `custom program error: 0x...`, `AnchorError`, `Error Code: ...` | [error-codes.md](error-codes.md) |
| **Account constraint** | `ConstraintHasOne`, `ConstraintSeeds`, `AccountNotInitialized`, `owned by wrong program` | [error-codes.md](error-codes.md) → "Anchor account/constraint" |
| **Compute budget** | `exceeded CUs`, `Computational budget exceeded`, `exceeded maximum number of instructions` | [compute-budget.md](compute-budget.md) |
| **Insufficient funds / rent** | `insufficient lamports`, `insufficient funds for rent`, `0x1` under SPL Token / System | [diagnose.md](diagnose.md) → "Funds & rent" |
| **Blockhash / expiry** | `Blockhash not found`, `block height exceeded`, `BlockhashNotFound` | [landing.md](landing.md) → "Blockhash lifecycle" |
| **Signature / signer** | `missing required signature`, `unauthorized signer`, `Cross-program invocation with unauthorized signer` | [diagnose.md](diagnose.md) → "Signers & CPI authority" |
| **SPL Token / Token-2022** | `0x...` under Token program, `Account frozen`, transfer-hook failures | [token-errors.md](token-errors.md) |
| **Dropped / not landing** | No record on-chain, `TransactionExpiredBlockheightExceededError`, intermittent confirms | [landing.md](landing.md) |
| **Address Lookup Table** | `loads an address table account that doesn't exist`, `invalid account index` | [diagnose.md](diagnose.md) → "Versioned tx & ALTs" |
| **Already processed** | `This transaction has already been processed`, `AlreadyProcessed` | [landing.md](landing.md) → "Duplicate sends" |

#### 3. Decode, prescribe, verify

Open the linked file, follow its decode table and fix recipe, then **verify**: re-simulate (preferred) or resend, and confirm the new behaviour. Use the **two-strike rule** — if the same fix fails twice, STOP and report what you observed instead of looping.

### Default Stack Assumptions (June 2026)

- **`@solana/kit`** (formerly web3.js v2) is the default client; `@solana/web3.js` v1 (`Connection`, `Transaction`) still common — both covered. → [tooling.md](tooling.md)
- **Anchor 0.31+** error format (`AnchorError` with `Error Code`, `Error Number`, `Error Message`, and `Program log: AnchorError ...`).
- **Versioned transactions (v0)** are the default; legacy still supported. Always pass `maxSupportedTransactionVersion: 0` when fetching.
- **Priority fees are mandatory** for reliable landing — `getPriorityFeeEstimate` (Helius) or `getRecentPrioritizationFees` (vanilla RPC). → [landing.md](landing.md)
- **Compute limit**: 200k CU default per instruction, **1.4M CU hard cap per transaction**. Always set an explicit limit for non-trivial txs. → [compute-budget.md](compute-budget.md)

---

## Progressive Disclosure (Read When Needed)

Load only the file you need — each is self-contained and token-light.

#### Diagnosis
- [diagnose.md](diagnose.md) — the master decision tree: classify any failure from its logs/error, with funds, signer, CPI, and ALT sub-flows.
- [error-codes.md](error-codes.md) — the decode reference: Anchor (instruction/constraint/account/require), SPL Token, System, and how to read `0x...` hex codes. **The most-used file.**
- [simulation.md](simulation.md) — simulate before (and after) sending; read `unitsConsumed`, `err`, `returnData`, and logs; why preflight differs from on-chain.

#### Fixes
- [landing.md](landing.md) — dropped/expired txs: blockhash lifecycle, priority fees, retry loops, Jito bundles, durable nonces, staked connections.
- [compute-budget.md](compute-budget.md) — `exceeded CUs`: measure real usage, set tight CU limits, price priority fees, heap & CPI-depth limits.
- [token-errors.md](token-errors.md) — SPL Token & Token-2022: missing ATAs, frozen accounts, transfer hooks, mismatched mints/decimals, extension pitfalls.

#### Reference
- [tooling.md](tooling.md) — the toolbox: `getTransaction`/`simulateTransaction`/`getSignatureStatuses`, `solana confirm`, Explorers (Solana Explorer, Solscan, SolanaFM), Helius enhanced/parsed APIs, and the bundled `decode-tx.mjs` helper.
- [resources.md](resources.md) — curated, current links to docs, error sources, and dashboards.

---

## Task Routing Guide

| User says / shows… | Open |
|--------------------|------|
| "Why did this transaction fail?" + a signature | [tooling.md](tooling.md) → [diagnose.md](diagnose.md) |
| `custom program error: 0x1771` | [error-codes.md](error-codes.md) (0x1771 = 6001 = custom Anchor error #1) |
| `AnchorError ... Error Code: ConstraintSeeds` | [error-codes.md](error-codes.md) → constraints |
| `Error Code: ConstraintHasOne` | [error-codes.md](error-codes.md) → constraints |
| `exceeded CUs` / `Computational budget exceeded` | [compute-budget.md](compute-budget.md) |
| `Blockhash not found` | [landing.md](landing.md) → blockhash lifecycle |
| `block height exceeded` / tx expired | [landing.md](landing.md) → expiry & retries |
| "My transactions keep getting dropped" | [landing.md](landing.md) |
| "Set up priority fees / make sends reliable" | [landing.md](landing.md) |
| `insufficient funds for rent` | [diagnose.md](diagnose.md) → funds & rent |
| `missing required signature` | [diagnose.md](diagnose.md) → signers |
| `Cross-program invocation with unauthorized signer` | [diagnose.md](diagnose.md) → CPI authority |
| `Account frozen` / SPL token transfer fails | [token-errors.md](token-errors.md) |
| Token-2022 transfer hook / extension failure | [token-errors.md](token-errors.md) |
| `This transaction has already been processed` | [landing.md](landing.md) → duplicate sends |
| ALT / lookup table error | [diagnose.md](diagnose.md) → versioned tx & ALTs |
| "Simulate this before I send it" | [simulation.md](simulation.md) |
| "What tools/explorers should I use?" | [tooling.md](tooling.md) |

---

## Commands

| Command | Description |
|---------|-------------|
| `/diagnose-tx <signature\|logs>` | End-to-end diagnosis: fetch, classify, decode, and prescribe a fix for a failed transaction. |
| `/fix-landing` | Audit a sender for landing reliability and apply priority-fee, CU-limit, retry, and blockhash fixes. |

## Agents

| Agent | Purpose |
|-------|---------|
| **tx-doctor** | Transaction diagnostician. Given a signature, logs, or error, runs the full decode → explain → fix loop and verifies the fix. |

## Rules

| Rule file | Enforces |
|-----------|----------|
| [diagnostics.md](../rules/diagnostics.md) | Decode-don't-guess discipline, two-strike rule, read-only-by-default safety, and never fabricating an error code. |
