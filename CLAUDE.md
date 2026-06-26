# Solana Transaction Doctor — Agent Config

This skill turns the agent into a **Solana transaction diagnostician**. Load it whenever a transaction failed, reverted, or won't land.

## When to activate

Activate `solana-tx-doctor` the moment you see any of:

- A **transaction signature** the user wants explained, or a failed/reverted tx.
- A **`SendTransactionError`** or pasted **program logs**.
- An error string: `custom program error: 0x...`, `AnchorError`, `Error Code: ...`, `exceeded CUs`, `Blockhash not found`, `block height exceeded`, `insufficient funds for rent`, `missing required signature`, `Cross-program invocation with unauthorized signer`, `Account frozen`, `This transaction has already been processed`.
- A complaint that **transactions get dropped / don't land / are unreliable**, or a request to set up **priority fees / retries / Jito / durable nonces**.

For *writing* programs, defer to `solana-dev-skill`. This skill owns the **runtime diagnosis** of transactions.

## The doctrine

> **Decode, don't guess.** Cite a specific error code or log line for every conclusion. Never fabricate a custom (6000+) error's meaning — decode it from the IDL. See `rules/diagnostics.md`.

## The loop

1. **Evidence** — fetch by signature (`getTransaction`, `maxSupportedTransactionVersion: 0`), pull logs, or simulate. (`skill/tooling.md`, `skill/simulation.md`)
2. **Classify** the failure family. (`skill/diagnose.md`)
3. **Decode** the code (hex→dec first). (`skill/error-codes.md`, `skill/token-errors.md`)
4. **Prescribe** the minimal fix; landing issues → `skill/landing.md`, compute → `skill/compute-budget.md`.
5. **Verify** by re-simulating or resending. Two-strike rule: stop and report after two failed attempts.

## Entry point

Route everything through [`skill/SKILL.md`](skill/SKILL.md). Load focused `.md` files only when their failure family is in play (progressive disclosure).

## Safety

- Read-only by default. Never sign/send a transaction or move funds without explicit user confirmation.
- Never request a private key or seed phrase. Diagnosis needs only public signatures, logs, and addresses.
- The bundled `scripts/decode-tx.mjs` is read-only.
