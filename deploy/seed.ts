/**
 * Seed DeadDrop with real, end-to-end case files on Bradbury.
 *
 * Every transaction here is real and on-chain. The maintainer account acts as
 * poster and source across all roles (a single funded testnet key), which is why
 * the seeded case files share an address. Live users interacting through the app
 * console use their own wallet, so poster and source differ there.
 *
 * The four seeds are designed to demonstrate every lifecycle state at once:
 *   0. released  - evidence meets the rubric, escrow paid to the source
 *   1. refunded  - evidence does not meet the rubric, escrow returned to poster
 *   2. submitted - evidence attached, awaiting adjudication
 *   3. open      - accepting submissions
 *
 * Verdicts are decided by real validator adjudication; this script reports the
 * actual outcome rather than assuming one.
 */
import { readFileSync } from "node:fs";
import { DEPLOYMENT_PATH, makeClient, read, write, sleep } from "./lib";

const WEI = 10n ** 18n;
const gen = (s: string): bigint => {
  const [w, f = ""] = s.split(".");
  return BigInt(w || "0") * WEI + BigInt((f + "0".repeat(18)).slice(0, 18) || "0");
};

type Seed = {
  category: string;
  rubric: string;
  escrow: bigint;
  expirationSecs: number;
  evidence?: string;
  contentHash?: string;
  adjudicate?: boolean;
  settle?: boolean;
};

const SEEDS: Seed[] = [
  {
    // 0 -> released
    category: "corporate-misconduct",
    rubric:
      "Evidence must include at least two internal communications indicating the company was aware of the defect before the public recall date. Dates must be consistent, roles must be named, and the messages must reference a specific measured failure rate.",
    escrow: gen("0.5"),
    expirationSecs: 7 * 24 * 3600,
    evidence:
      "Two internal emails (redacted) between the QA lead and the VP of Engineering at a mid-size auto-parts maker, dated 2023-01-14 and 2023-02-02, four months before the public recall on 2023-06-05. Both reference brake-sensor failure at a measured rate of 3.2 percent in field returns and discuss delaying disclosure. Message IDs and header metadata preserved. Full thread committed via the content hash below and released to the poster after settlement.",
    contentHash: "sha256:9f2c1a7b4e6d8c05f31a2b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f901",
    adjudicate: true,
    settle: true,
  },
  {
    // 1 -> refunded (evidence too thin to meet the rubric)
    category: "environmental",
    rubric:
      "Evidence must include at least three independent corroborating documents with verifiable metadata that establish deliberate discharge above permitted limits, including lab measurements and dates. Anonymous assertions without documents do not qualify.",
    escrow: gen("0.4"),
    expirationSecs: 7 * 24 * 3600,
    evidence:
      "A single anonymous account claims a chemical plant discharges wastewater at night. No documents, no lab measurements, no dates, and no metadata are provided. The submitter states only that they heard about it from a former colleague.",
    contentHash: "sha256:1122334455667788990011223344556677889900aabbccddeeff001122334455",
    adjudicate: true,
    settle: true,
  },
  {
    // 2 -> submitted (awaiting adjudication)
    category: "product-safety",
    rubric:
      "Evidence must show that a documented safety test failure was omitted from a regulatory filing. Provide the failing test identifier, the filing reference, and the date the filing was submitted.",
    escrow: gen("0.3"),
    expirationSecs: 7 * 24 * 3600,
    evidence:
      "Redacted excerpt of an internal test log showing test SAFE-4471 (thermal cutoff) marked FAIL on 2024-03-09, alongside the regulatory filing reference FN-2024-118 submitted 2024-03-22 that lists all safety tests as passing. The full log and filing PDF are committed via the content hash and handed over after settlement.",
    contentHash: "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    adjudicate: false,
    settle: false,
  },
  {
    // 3 -> open (accepting submissions)
    category: "governance",
    rubric:
      "Evidence must demonstrate that a protocol core contributor traded a governance token using non-public information about an upcoming treasury decision. Provide on-chain transaction references and the internal communication that established the information asymmetry.",
    escrow: gen("0.25"),
    expirationSecs: 30 * 24 * 3600,
    adjudicate: false,
    settle: false,
  },
];

async function waitForDrop(
  client: ReturnType<typeof makeClient>["client"],
  address: `0x${string}`,
  id: number,
  tries = 40,
): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      await read(client, address, "get_drop", [id]);
      return;
    } catch {
      await sleep(3000);
    }
  }
  throw new Error(`drop ${id} not visible after create`);
}

async function main() {
  const { client } = makeClient();
  const record = JSON.parse(readFileSync(DEPLOYMENT_PATH, "utf-8"));
  const address = record.contractAddress as `0x${string}`;
  const appealWindow = Number(record.appealWindowSecs ?? 60);
  console.log("Contract     :", address);
  console.log("Appeal window:", appealWindow, "secs\n");

  const startCount = await read<number>(client, address, "get_drop_count");
  console.log("Existing drops:", startCount, "\n");

  const results: { id: number; status: string; outcome: string }[] = [];

  for (let i = 0; i < SEEDS.length; i++) {
    const s = SEEDS[i];
    // Drops are created sequentially, one per iteration, so the id is deterministic.
    const dropId = startCount + i;
    console.log(`--- Seed ${i} -> drop ${dropId}: ${s.category} ---`);

    console.log("  create_drop_request (escrow", (Number(s.escrow) / 1e18).toFixed(2), "GEN)");
    const createTx = await write(
      client,
      address,
      "create_drop_request",
      [s.category, s.rubric, s.expirationSecs],
      s.escrow,
    );
    console.log("  drop id      :", dropId, "tx", createTx);
    await waitForDrop(client, address, dropId);

    if (s.evidence && s.contentHash) {
      console.log("  submit_evidence");
      await write(client, address, "submit_evidence", [dropId, s.evidence, s.contentHash]);
    }

    if (s.adjudicate) {
      console.log("  adjudicate (real validator LLM consensus, may take a while)");
      const adjTx = await write(client, address, "adjudicate", [dropId]);
      console.log("  adjudicate tx:", adjTx);
    }

    if (s.settle) {
      console.log(`  waiting ${appealWindow + 8}s for the appeal window to close...`);
      await sleep((appealWindow + 8) * 1000);
      console.log("  settle");
      const settleTx = await write(client, address, "settle", [dropId]);
      console.log("  settle tx    :", settleTx);
    }

    const d = await read<Record<string, unknown>>(client, address, "get_drop", [dropId]);
    console.log("  final status :", d.status, "| outcome:", d.outcome, "| verdict:", d.verdict);
    if (s.adjudicate) console.log("  reasoning    :", d.reasoning);
    results.push({ id: dropId, status: String(d.status), outcome: String(d.outcome) });
    console.log("");
  }

  const total = await read<number>(client, address, "get_drop_count");
  console.log("=== Seeding complete ===");
  console.log("Total drops on-chain:", total);
  for (const r of results) {
    console.log(`  drop ${r.id}: ${r.status} / ${r.outcome}`);
  }
}

main().catch((err) => {
  console.error("\nSeeding error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
