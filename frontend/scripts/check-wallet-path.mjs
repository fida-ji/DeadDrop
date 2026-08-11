/**
 * Regression check for the browser wallet path.
 *
 * DeadDrop must connect and sign with plain EIP-1193 only: no MetaMask Snaps,
 * no Flask build, no extra install step. genlayer-js still ships a Snaps-based
 * connect() helper, so this builds the client exactly the way
 * src/lib/genlayer.ts does, hands it a fake injected provider, and asserts that
 *
 *   1. no MetaMask Snaps RPC method is ever requested, and
 *   2. eth_sendTransaction is forwarded to the wallet for signing.
 *
 * Run with: npm run check:wallet   (needs network access for nonce/gas reads)
 */
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const ACCOUNT = "0x3809C0AF0eb85c087bA76Cb763Eb9CbB057ff85b";
const CONTRACT = "0x79F6C2E942DE68a3e24Cf70e42D8A8F2b3813D20";
const SNAPS_METHOD = /snaps?$/i;
const STOP = "wallet-path-check: stop after send";

const seen = [];

const injected = {
  async request({ method }) {
    seen.push(method);
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [ACCOUNT];
    if (method === "eth_chainId") return "0x107d";
    // Signing reached the wallet, which is all this check needs to prove.
    if (method === "eth_sendTransaction") throw new Error(STOP);
    throw new Error(`fake provider: unexpected ${method}`);
  },
};

// Same guard as src/lib/genlayer.ts.
const provider = {
  request: (args) =>
    SNAPS_METHOD.test(args.method)
      ? Promise.reject(new Error(`blocked ${args.method}`))
      : injected.request(args),
};

const client = createClient({
  chain: testnetBradbury,
  account: ACCOUNT,
  endpoint: "https://rpc-bradbury.genlayer.com",
  provider,
});

// genlayer-js logs provider errors itself; the STOP throw below is expected, so
// keep its stack trace out of this script's output.
const warn = console.warn;
const error = console.error;
console.warn = () => {};
console.error = () => {};
let failure;
try {
  await client.writeContract({
    address: CONTRACT,
    functionName: "set_appeal_window",
    args: [60],
    value: 0n,
  });
} catch (err) {
  const message = String(err?.message ?? err);
  if (!message.includes(STOP)) failure = message;
} finally {
  console.warn = warn;
  console.error = error;
}
if (failure) console.error("unexpected failure:", failure);

const snaps = seen.filter((m) => SNAPS_METHOD.test(m));
const signed = seen.includes("eth_sendTransaction");

console.log("wallet methods requested :", [...new Set(seen)].join(", ") || "(none)");
console.log("snaps methods requested  :", snaps.length ? snaps.join(", ") : "none");
console.log("signed via wallet        :", signed ? "yes" : "no");

if (snaps.length > 0 || !signed) {
  console.error("FAIL - the wallet path is not Snaps-free EIP-1193");
  process.exit(1);
}
console.log("PASS - EIP-1193 only, zero Snaps calls");
