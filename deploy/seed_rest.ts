/**
 * Seed the remaining two case files (a submitted drop and an open drop) using a
 * fresh client per write to avoid genlayer-js nonce drift over long runs.
 * Idempotent-ish: reads the current count and appends.
 */
import { readFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import type { GenLayerClient, GenLayerChain, TransactionHash } from "genlayer-js/types";
import { DEPLOYMENT_PATH, requireKey, read, pollAccepted, sleep } from "./lib";

const WEI = 10n ** 18n;
const gen = (s: string): bigint => {
  const [w, f = ""] = s.split(".");
  return BigInt(w || "0") * WEI + BigInt((f + "0".repeat(18)).slice(0, 18) || "0");
};

function freshClient() {
  const account = createAccount(requireKey());
  return createClient({ chain: testnetBradbury, account }) as GenLayerClient<GenLayerChain>;
}

async function writeFresh(
  address: `0x${string}`,
  functionName: string,
  args: unknown[],
  value = 0n,
): Promise<TransactionHash> {
  const client = freshClient();
  const hash = (await client.writeContract({
    address,
    functionName,
    args: args as never,
    value,
    ...(value > 0n ? { gas: 12_000_000n } : {}),
  })) as TransactionHash;
  await pollAccepted(client, hash);
  return hash;
}

async function waitForDrop(address: `0x${string}`, id: number, tries = 40) {
  const client = freshClient();
  for (let i = 0; i < tries; i++) {
    try {
      await read(client, address, "get_drop", [id]);
      return;
    } catch {
      await sleep(3000);
    }
  }
  throw new Error(`drop ${id} not visible`);
}

async function main() {
  const record = JSON.parse(readFileSync(DEPLOYMENT_PATH, "utf-8"));
  const address = record.contractAddress as `0x${string}`;
  const count = await read<number>(freshClient(), address, "get_drop_count");
  console.log("Contract:", address, "| current count:", count);

  // --- submitted (product-safety) ---
  const submittedId = count;
  const psRubric =
    "Evidence must show that a documented safety test failure was omitted from a regulatory filing. Provide the failing test identifier, the filing reference, and the date the filing was submitted.";
  const psEvidence =
    "Redacted excerpt of an internal test log showing test SAFE-4471 (thermal cutoff) marked FAIL on 2024-03-09, alongside the regulatory filing reference FN-2024-118 submitted 2024-03-22 that lists all safety tests as passing. The full log and filing PDF are committed via the content hash and handed over after settlement.";
  console.log(`\ncreate product-safety drop ${submittedId}`);
  console.log("  tx", await writeFresh(address, "create_drop_request", ["product-safety", psRubric, 7 * 24 * 3600], gen("0.3")));
  await waitForDrop(address, submittedId);
  console.log("  submit_evidence");
  console.log("  tx", await writeFresh(address, "submit_evidence", [submittedId, psEvidence, "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"]));

  // --- open (governance) ---
  const openId = submittedId + 1;
  const govRubric =
    "Evidence must demonstrate that a protocol core contributor traded a governance token using non-public information about an upcoming treasury decision. Provide on-chain transaction references and the internal communication that established the information asymmetry.";
  console.log(`\ncreate governance drop ${openId} (left open)`);
  console.log("  tx", await writeFresh(address, "create_drop_request", ["governance", govRubric, 30 * 24 * 3600], gen("0.25")));
  await waitForDrop(address, openId);

  const total = await read<number>(freshClient(), address, "get_drop_count");
  console.log("\n=== done. total drops:", total);
  for (let i = 0; i < total; i++) {
    const d = await read<Record<string, unknown>>(freshClient(), address, "get_drop", [i]);
    console.log(`  drop ${i}: ${d.status} / ${d.outcome} (${d.category})`);
  }
}

main().catch((err) => {
  console.error("\nError:", err instanceof Error ? err.message : err);
  process.exit(1);
});
