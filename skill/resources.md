# resources.md — Curated References

Current, authoritative sources behind this skill (June 2026 stack). Prefer these over blog posts when verifying a claim.

## Core docs

- **Solana Docs — Transactions & Instructions**: https://solana.com/docs/core/transactions
- **Solana Docs — Retrying / sending transactions**: https://solana.com/docs/advanced/retry
- **Solana Docs — Confirmation & expiration**: https://solana.com/docs/advanced/confirmation
- **Compute budget & priority fees**: https://solana.com/docs/core/fees
- **Versioned transactions & Address Lookup Tables**: https://solana.com/docs/advanced/lookup-tables
- **Durable nonces**: https://solana.com/docs/advanced/durable-nonces

## Clients

- **@solana/kit (web3.js v2)**: https://github.com/anza-xyz/kit — the default client for the 2026 stack.
- **@solana/web3.js v1**: https://solana-labs.github.io/solana-web3.js/ — still widely deployed; `Connection`/`Transaction` APIs.
- **@solana/spl-token**: https://github.com/solana-program/token — SPL Token & Token-2022 helpers (ATAs, transfer hooks).

## Error code sources (authoritative)

- **Anchor `ErrorCode` (framework codes 100–4100)**: https://github.com/solana-foundation/anchor — `lang/src/error.rs`.
- **Anchor errors guide**: https://www.anchor-lang.com/docs/errors
- **SPL Token `TokenError`**: https://github.com/solana-program/token — `program/src/error.rs`.
- **System program errors**: `SystemError` in the Agave/Anza monorepo.
- **Decode a custom (6000+) code**: fetch the program's IDL (`anchor idl fetch <program-id>`) and read `errors[]`.

## Landing & infrastructure

- **Helius — priority fee API & sending guide**: https://docs.helius.dev/ (`getPriorityFeeEstimate`, staked connections).
- **Jito — bundles & Block Engine**: https://docs.jito.wtf/ — atomic bundles, tip accounts.
- **Triton / RPC providers** — staked connections / SWQoS for congestion resilience.

## Explorers

- **Solana Explorer**: https://explorer.solana.com
- **Solscan**: https://solscan.io
- **SolanaFM**: https://solana.fm

## Companion skills

- **solana-dev-skill** — core program/frontend/testing development. This skill is its runtime/diagnostic counterpart.
- **solana-ai-kit** — the kit this skill plugs into: https://github.com/solanabr/solana-ai-kit

> When a detail might be version-sensitive (CU caps, fee mechanics, extension behaviour), verify against the docs above rather than relying on memory — the Solana runtime evolves quickly.
