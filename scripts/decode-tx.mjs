#!/usr/bin/env node
// decode-tx.mjs — read-only Solana transaction diagnoser.
//
// Fetches a transaction by signature over public RPC and prints a structured
// diagnosis: status, error, decoded custom code (hex<->dec with an Anchor-range
// hint), compute units consumed, and the tail of the program logs.
//
// It NEVER signs, sends, or mutates anything. Zero dependencies (Node 18+ built-in fetch).
//
// Usage:
//   node decode-tx.mjs <SIGNATURE>
//   node decode-tx.mjs <SIGNATURE> --url https://api.devnet.solana.com
//   node decode-tx.mjs <SIGNATURE> --url $HELIUS_RPC

const args = process.argv.slice(2);
let signature = null;
let url = "https://api.mainnet-beta.solana.com";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url" || args[i] === "-u") {
    url = args[++i];
  } else if (args[i] === "--help" || args[i] === "-h") {
    printHelp();
    process.exit(0);
  } else if (!signature) {
    signature = args[i];
  }
}

if (!signature) {
  printHelp();
  process.exit(1);
}

function printHelp() {
  console.log(`decode-tx.mjs — read-only Solana transaction diagnoser

Usage:
  node decode-tx.mjs <SIGNATURE> [--url <RPC_URL>]

Options:
  -u, --url   RPC endpoint (default: mainnet-beta). Use devnet/custom for non-mainnet txs.
  -h, --help  Show this help.

Read-only: fetches via getTransaction and decodes. Never signs or sends.`);
}

// --- Decode helpers -------------------------------------------------------

function anchorRangeHint(code) {
  if (code >= 6000) {
    const idx = code - 6000;
    return `Custom user error from the program's #[error_code] enum (variant index ${idx}). Decode with the IDL: anchor idl fetch <program-id>  ->  errors[${idx}].`;
  }
  if (code >= 4100 && code <= 4110) return "Anchor program-id/fallback error (4100 = DeclaredProgramIdMismatch).";
  if (code >= 3000 && code <= 3017) return "Anchor account error (e.g. 3012 AccountNotInitialized, 3007 AccountOwnedByWrongProgram).";
  if (code >= 2500 && code <= 2510) return "Anchor require! error (require!/require_eq! etc.).";
  if (code >= 2000 && code <= 2020) return "Anchor constraint error (e.g. 2006 ConstraintSeeds, 2001 ConstraintHasOne).";
  if (code >= 1000 && code <= 1002) return "Anchor IDL instruction error (client/IDL out of sync).";
  if (code >= 100 && code <= 103) return "Anchor instruction error (e.g. 100 InstructionMissing, 102 InstructionDidNotDeserialize).";
  return "Small code: likely an SPL Token / System native error — check the program id that raised it (see token-errors.md / error-codes.md).";
}

function describeErr(err) {
  if (err == null) return { kind: "success", text: "No error — transaction succeeded." };
  if (typeof err === "string") {
    return { kind: "transaction", text: `Transaction-level error: ${err} (not an instruction error — likely a lifecycle/landing issue; see landing.md).` };
  }
  if (err.InstructionError) {
    const [index, detail] = err.InstructionError;
    if (typeof detail === "string") {
      return { kind: "instruction", text: `Instruction #${index} failed: ${detail}` };
    }
    if (detail && typeof detail === "object" && "Custom" in detail) {
      const code = detail.Custom;
      const hex = "0x" + code.toString(16);
      return {
        kind: "custom",
        text: `Instruction #${index} failed with Custom error ${code} (${hex}).`,
        hint: anchorRangeHint(code),
      };
    }
    return { kind: "instruction", text: `Instruction #${index} failed: ${JSON.stringify(detail)}` };
  }
  return { kind: "other", text: `Error: ${JSON.stringify(err)}` };
}

// --- RPC ------------------------------------------------------------------

async function rpc(method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
  return json.result;
}

// --- Main -----------------------------------------------------------------

const line = "─".repeat(64);

(async () => {
  console.log(line);
  console.log(`  solana-tx-doctor · decode-tx`);
  console.log(`  signature: ${signature}`);
  console.log(`  cluster:   ${url}`);
  console.log(line);

  let tx;
  try {
    tx = await rpc("getTransaction", [
      signature,
      { maxSupportedTransactionVersion: 0, commitment: "confirmed", encoding: "json" },
    ]);
  } catch (e) {
    console.error(`\n✗ Failed to fetch: ${e.message}`);
    console.error(`  Tips: wrong cluster? try --url https://api.devnet.solana.com`);
    console.error(`        very old tx may be pruned by this RPC; try an archival/Helius endpoint.`);
    process.exit(2);
  }

  if (!tx) {
    console.error(`\n✗ Transaction not found on this cluster.`);
    console.error(`  - It may be on a different cluster (try --url devnet/custom).`);
    console.error(`  - It may have been dropped/expired and never landed (a LANDING problem — see landing.md).`);
    console.error(`  - The RPC may have pruned it (try an archival endpoint).`);
    process.exit(3);
  }

  const meta = tx.meta || {};
  const diag = describeErr(meta.err);

  console.log(`\nSTATUS`);
  console.log(`  ${meta.err == null ? "✓ SUCCESS" : "✗ FAILED"}`);
  console.log(`  slot: ${tx.slot ?? "?"}${tx.blockTime ? `   blockTime: ${new Date(tx.blockTime * 1000).toISOString()}` : ""}`);
  console.log(`  fee:  ${meta.fee ?? "?"} lamports   computeUnitsConsumed: ${meta.computeUnitsConsumed ?? "n/a"}`);

  console.log(`\nDIAGNOSIS`);
  console.log(`  ${diag.text}`);
  if (diag.hint) console.log(`  → ${diag.hint}`);
  if (diag.kind === "custom") {
    const code = meta.err.InstructionError[1].Custom;
    console.log(`  hex<->dec: 0x${code.toString(16)} = ${code}`);
  }

  const logs = meta.logMessages || [];
  if (logs.length) {
    // Show the tail — the failure and the lines just above it are the cause.
    const tail = logs.slice(-18);
    console.log(`\nPROGRAM LOGS (last ${tail.length} of ${logs.length})`);
    for (const l of tail) {
      const mark = /failed|insufficient|error|panicked|exceeded/i.test(l) ? "✗ " : "  ";
      console.log(`  ${mark}${l}`);
    }
  } else {
    console.log(`\nPROGRAM LOGS\n  (none returned)`);
  }

  console.log(`\nNEXT`);
  if (meta.err == null) {
    console.log(`  Transaction succeeded — nothing to fix.`);
  } else {
    console.log(`  Classify with skill/diagnose.md, then decode with skill/error-codes.md.`);
    if (diag.kind === "transaction") console.log(`  This looks lifecycle-level → skill/landing.md.`);
  }
  console.log(line);
})();
