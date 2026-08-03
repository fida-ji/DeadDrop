# DeadDrop

**Trustless adjudication of anonymous whistleblower evidence, settled on [GenLayer](https://genlayer.com).**

A poster escrows a bounty against a plain-language rubric describing the evidence
they want. An anonymous source submits a structured evidence package — summaries,
redacted excerpts, metadata, and a content hash that commits to the full
documents without ever revealing the raw files. GenLayer validators each read the
rubric and the package, run an LLM independently, and reach consensus on a single
boolean verdict. If the evidence meets the rubric, the escrow is released to the
source minus a protocol fee. If not, the poster is refunded. Settlement happens
only after an appeal window closes.

## Live on GenLayer Bradbury testnet

| | |
|---|---|
| **Contract** | [`0x79F6C2E942DE68a3e24Cf70e42D8A8F2b3813D20`](https://explorer-bradbury.genlayer.com/contracts/0x79F6C2E942DE68a3e24Cf70e42D8A8F2b3813D20) |
| **Deploy transaction** | [`0x945b28cf…f9e0bfd`](https://explorer-bradbury.genlayer.com/tx/0x945b28cf590df0f6fdf0d060916c789a435dcdbe1afb827ada61b7d12f9e0bfd) |
| **Network** | GenLayer Bradbury · chain id 4221 · currency GEN |
| **Source code** | [github.com/fida-ji/DeadDrop](https://github.com/fida-ji/DeadDrop) |

Deployment was verified on-chain by reading `get_protocol_config` and by fetching
the full method schema with the GenLayer CLI.

## Why GenLayer

A regular smart contract cannot reason over unstructured evidence. A token vote
is gameable by the party being exposed. A single AI endpoint is censorable and
has no consensus. DeadDrop needs a verdict produced by independent evaluators
who must agree, with deterministic on-chain settlement — exactly what GenLayer's
Optimistic Democracy consensus provides: many validators run the same evaluation
and the network compares their results.

The equivalence rule is deliberately narrow: validators must agree on one
boolean, *met* or *not met*. A vague rubric produces disagreement and fails to
settle, which pushes posters to write precise criteria. Validators judge whether
the submitted package satisfies the rubric — not whether the underlying claims
are true in the world. That keeps the judgment bounded and reproducible.

## Lifecycle

```
open ──submit_evidence──▶ submitted ──adjudicate──▶ adjudicated ──settle──▶ settled
  │                                                                            (released | refunded)
  └── expire_drop (past deadline, no submission) ────────────────▶ expired   (refunded)
```

| Method | Caller | Effect |
|--------|--------|--------|
| `create_drop_request(category, rubric, expiration_secs)` *(payable)* | poster | Escrows the sent value and opens a drop |
| `submit_evidence(drop_id, evidence_package, content_hash)` | source | Attaches a structured package to an open drop |
| `adjudicate(drop_id)` | anyone | Runs validator consensus on a boolean verdict |
| `settle(drop_id)` | anyone | After the appeal window, pays the source (minus fee) or refunds the poster |
| `expire_drop(drop_id)` | anyone | Refunds the poster of an open drop past its deadline |
| `set_fee_bps`, `set_fee_recipient`, `set_appeal_window` | owner | Protocol configuration (fee capped at 10%) |
| `get_drop`, `list_drops`, `get_protocol_config`, `get_drop_count` | view | Read state |

Escrow is held for the entire lifecycle and can only move to the source or back
to the poster. The protocol fee (default 1%) is taken from a released payout only.

## Case files on-chain

Five real drops were seeded on Bradbury to demonstrate every state. The two
settled drops ran the full lifecycle and were adjudicated by real GenLayer
validators; the verdict reasoning shown in the app is the model output consensus
agreed on.

| Drop | Category | Final state | Settlement tx |
|------|----------|-------------|---------------|
| 0 | corporate-misconduct | open | — |
| 1 | corporate-misconduct | settled · released | [`0x6f864a03…f18a34cb`](https://explorer-bradbury.genlayer.com/tx/0x6f864a03fa2515f5a7669f9a218aa6ebd444813cab7ae2f32b13292bf18a34cb) |
| 2 | environmental | settled · refunded | [`0x73a687f6…162eab51`](https://explorer-bradbury.genlayer.com/tx/0x73a687f64075f80f78d70cb043a17a3bc44b435e0212189a320b09cf162eab51) |
| 3 | product-safety | submitted | — |
| 4 | governance | open | — |

Every transaction hash is recorded in [`deploy/seed-record.json`](deploy/seed-record.json).

## Tech stack

- **Intelligent Contract** — Python 3.12, GenLayer SDK (`genlayer-py`). LLM
  adjudication via `gl.vm.run_nondet_unsafe` with a boolean equivalence rule;
  native value transfers through the EVM contract interface; money in wei-scale
  `u256`.
- **Contract tooling** — `genvm-lint` (lint + validation), `genlayer-test`
  (18 direct-mode tests covering the full lifecycle and access control).
- **Deployment scripts** — TypeScript + `genlayer-js`, targeting the Bradbury
  chain. Deploy, verify, and seed from `deploy/`.
- **Frontend** — React + Vite + TypeScript + `genlayer-js`. Documentation-first
  page plus an interactive console that reads and writes the contract: full
  wallet lifecycle (connect, disconnect, account/chain change), direct Bradbury
  add/switch without MetaMask Snaps, live transaction status with explorer
  links, and reads throttled behind a global queue with backoff for the RPC
  rate limit.
- **Hosting** — Netlify or Firebase Hosting (static SPA). On Netlify the RPC is
  proxied through a same-origin `/api/rpc` path so wallet and privacy extensions
  do not block requests to the RPC host.

## Repository layout

```
contracts/deaddrop.py     the Intelligent Contract
tests/direct/             direct-mode tests (pytest + genlayer-test)
deploy/                   deploy, verify, and seed scripts (genlayer-js)
frontend/                 React + Vite app (site + console)
brand/                    logo and brand assets (SVG)
netlify.toml              Netlify build + RPC proxy configuration
firebase.json             Firebase Hosting configuration
```

## Develop

### Contract: lint and test

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install "genlayer-test==0.29.2" genvm-linter
genvm-lint check contracts/deaddrop.py
pytest tests/direct/ -v
```

### Frontend

```bash
cd frontend && npm install
npm run dev       # dev server; /api/rpc is proxied to Bradbury
npm run build     # type-check + production build to dist/
```

To point the app at a different contract deployment, set `VITE_CONTRACT_ADDRESS`.
To use a custom RPC endpoint instead of the `/api/rpc` proxy, set
`VITE_RPC_ENDPOINT`.

## Deploy

### Frontend on Netlify

Connect the repository. `netlify.toml` builds the frontend (`base = "frontend"`,
`npm run build`, publish `dist`), proxies `/api/rpc` to the Bradbury RPC, and
serves the SPA. Configuration values are set as Site environment variables in
the Netlify dashboard — never in the repo.

### Frontend on Firebase Hosting

```bash
cd frontend
VITE_RPC_ENDPOINT=https://rpc-bradbury.genlayer.com npm run build
cd ..
firebase login
firebase use --add          # select your Firebase project (writes .firebaserc)
firebase deploy --only hosting
```

`firebase.json` serves `frontend/dist` with an SPA fallback. Firebase Hosting
cannot proxy API paths, so the build points the app directly at the public
Bradbury RPC via `VITE_RPC_ENDPOINT`. `.firebaserc` is gitignored because it
holds your project id.

### Your own contract instance (optional)

The app already points at the deployed contract above; this is only needed for a
fresh deployment.

```bash
cp .env.example .env       # add a funded Bradbury key as ACCOUNT_PRIVATE_KEY
cd deploy && npm install
npm run deploy             # deploys, configures, and verifies live
npm run seed               # seeds full-lifecycle case files
```

Fund the deployer from the [faucet](https://testnet-faucet.genlayer.foundation)
first. The private key is read from the environment only and is never logged.

## Notes and limitations

- This runs on the Bradbury testnet. GEN balances are test tokens with no
  monetary value.
- The appeal window on the deployed instance is short (60s) so a full lifecycle
  can be demonstrated quickly. A production deployment would use hours to days.
- The seeded case files were executed from a single maintainer account across
  roles. In normal use the poster and the source are different wallets.
- The chain records the source address and whatever the source writes into the
  evidence package. Use a fresh address and keep the package free of identifying
  detail. DeadDrop protects the raw evidence during adjudication; it cannot
  protect a source from what they choose to publish on-chain.
- DeadDrop is infrastructure. It does not endorse the content of any drop and
  provides no legal advice.

## License

MIT. See [LICENSE](./LICENSE).
