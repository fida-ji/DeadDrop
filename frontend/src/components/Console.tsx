import { useState, type ReactNode } from "react";
import type { Hash } from "genlayer-js/types";
import { useWallet } from "../lib/useWallet";
import { writeContract, waitAccepted } from "../lib/genlayer";
import { genToWei } from "../lib/format";
import type { ProtocolConfig } from "../lib/types";
import TxStatus, { type TxState } from "./TxStatus";
import WalletButton from "./WalletButton";

type Tab = "create" | "submit" | "adjudicate" | "settle" | "expire";

const TABS: { key: Tab; label: string }[] = [
  { key: "create", label: "Create drop" },
  { key: "submit", label: "Submit evidence" },
  { key: "adjudicate", label: "Adjudicate" },
  { key: "settle", label: "Settle" },
  { key: "expire", label: "Expire" },
];

function parseError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/user rejected|4001|denied/i.test(raw)) return "Signature rejected in the wallet.";
  const m = raw.match(/\[(?:EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\]\s*([A-Za-z0-9 ._%>=/():,-]+)/);
  if (m) return m[1].trim();
  if (/nonce is not consistent/i.test(raw)) return "Wallet nonce out of sync. Reload the page and retry.";
  if (/rate limit|-32429|\b429\b/i.test(raw)) return "The network is rate limiting requests. Try again shortly.";
  if (/insufficient/i.test(raw)) return "Insufficient balance for escrow plus gas. Fund the account from the faucet.";
  return raw.length > 200 ? raw.slice(0, 200) + "\u2026" : raw;
}

export default function Console({
  config,
  onDone,
}: {
  config: ProtocolConfig | null;
  onDone: () => void;
}) {
  const { account, onBradbury } = useWallet();
  const [tab, setTab] = useState<Tab>("create");
  const [tx, setTx] = useState<TxState>({ phase: "idle" });
  const [busy, setBusy] = useState(false);

  async function run(fn: (account: `0x${string}`) => Promise<Hash>) {
    if (!account) return;
    setBusy(true);
    setTx({ phase: "signing" });
    try {
      const hash = await fn(account);
      setTx({ phase: "pending", hash });
      await waitAccepted(hash);
      setTx({ phase: "accepted", hash });
      onDone();
    } catch (e) {
      setTx({ phase: "error", message: parseError(e) });
    } finally {
      setBusy(false);
    }
  }

  const ready = !!account && onBradbury;

  return (
    <section id="console" className="section">
      <div className="wrap">
        <span className="eyebrow">Interactive console</span>
        <h2>Drive the protocol yourself.</h2>
        <p className="lede">
          Connect a wallet on {config ? "Bradbury" : "Bradbury"} and run any step of the lifecycle
          against the live contract. Each action is a single transaction; you will see its status
          and an explorer link here.
        </p>

        <div className="console" style={{ marginTop: 28 }}>
          <div className="console__tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`console__tab ${tab === t.key ? "active" : ""}`}
                onClick={() => {
                  setTab(t.key);
                  setTx({ phase: "idle" });
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="console__body">
            {!ready && (
              <div className="notice" style={{ marginBottom: 22, display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <span>
                  {account
                    ? "Your wallet is connected but not on Bradbury. Switch network to continue."
                    : "Connect a wallet to run transactions. Reading the protocol needs no wallet."}
                </span>
                <WalletButton />
              </div>
            )}

            {tab === "create" && <CreateForm disabled={!ready || busy} run={run} config={config} />}
            {tab === "submit" && <SubmitForm disabled={!ready || busy} run={run} />}
            {tab === "adjudicate" && <AdjudicateForm disabled={!ready || busy} run={run} />}
            {tab === "settle" && <SettleForm disabled={!ready || busy} run={run} config={config} />}
            {tab === "expire" && <ExpireForm disabled={!ready || busy} run={run} />}

            <TxStatus tx={tx} />
          </div>
        </div>
      </div>
    </section>
  );
}

// --- shared field helpers ---------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function Submit({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <button type="submit" className="btn" disabled={disabled}>
      {label}
    </button>
  );
}

type RunFn = (fn: (account: `0x${string}`) => Promise<Hash>) => Promise<void>;

// --- forms ------------------------------------------------------------------

const CATEGORIES = [
  "corporate-misconduct",
  "environmental",
  "product-safety",
  "financial-fraud",
  "governance",
  "academic-integrity",
  "supply-chain",
];

function CreateForm({
  disabled,
  run,
  config,
}: {
  disabled: boolean;
  run: RunFn;
  config: ProtocolConfig | null;
}) {
  const [category, setCategory] = useState("corporate-misconduct");
  const [rubric, setRubric] = useState("");
  const [escrow, setEscrow] = useState("0.25");
  const [amount, setAmount] = useState("7");
  const [unit, setUnit] = useState("86400");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const secs = Math.max(1, Math.round(Number(amount) * Number(unit)));
        void run((acct) =>
          writeContract(acct, "create_drop_request", [category, rubric, secs], genToWei(escrow)),
        );
      }}
    >
      <p className="console__intro">
        Escrow a bounty against a rubric. The value you send funds the escrow. Write the rubric so
        an independent reader can decide, from the evidence alone, whether it is met.
      </p>
      <Field label="Category" hint="Pick a suggestion or type your own.">
        <input
          type="text"
          list="cat-list"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
        />
        <datalist id="cat-list">
          {CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field
        label="Rubric"
        hint="Be specific. Name required elements, counts, dates, and what disqualifies a submission. Minimum 16 characters."
      >
        <textarea
          value={rubric}
          onChange={(e) => setRubric(e.target.value)}
          placeholder="Evidence must include at least two internal communications showing awareness of the defect before the recall date, with consistent dates and named roles."
          required
        />
      </Field>
      <div className="form-row">
        <Field label={`Escrow (GEN)`} hint="Sent with the transaction as the bounty.">
          <input
            type="number"
            min="0"
            step="0.01"
            value={escrow}
            onChange={(e) => setEscrow(e.target.value)}
            required
          />
        </Field>
        <Field label="Open for" hint="How long submissions are accepted.">
          <div className="form-row" style={{ gap: 8 }}>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="3600">hours</option>
              <option value="86400">days</option>
            </select>
          </div>
        </Field>
      </div>
      <Submit disabled={disabled} label="Escrow bounty and open drop" />
      {config && (
        <p className="hint" style={{ marginTop: 12 }}>
          Protocol fee on a successful payout: {config.fee_bps / 100}% . Appeal window before
          settlement: {config.appeal_window_secs}s.
        </p>
      )}
    </form>
  );
}

function DropIdField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Drop id" hint="The case number, shown on each card in Case files.">
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </Field>
  );
}

function SubmitForm({ disabled, run }: { disabled: boolean; run: RunFn }) {
  const [id, setId] = useState("");
  const [pkg, setPkg] = useState("");
  const [hash, setHash] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run((acct) =>
          writeContract(acct, "submit_evidence", [Number(id), pkg, hash]),
        );
      }}
    >
      <p className="console__intro">
        Attach a structured evidence package to an open drop. Submit redacted summaries and
        metadata, never raw files. The content hash commits to the full documents, which are handed
        over out of band after settlement.
      </p>
      <DropIdField value={id} onChange={setId} />
      <Field
        label="Evidence package"
        hint="Summaries, redacted excerpts, dates, roles, and measurable details. Minimum 32 characters."
      >
        <textarea value={pkg} onChange={(e) => setPkg(e.target.value)} required />
      </Field>
      <Field label="Content hash" hint="A commitment to the full evidence, e.g. a SHA-256 digest.">
        <input
          type="text"
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder={"sha256:\u2026"}
          required
        />
      </Field>
      <Submit disabled={disabled} label="Submit evidence package" />
    </form>
  );
}

function AdjudicateForm({ disabled, run }: { disabled: boolean; run: RunFn }) {
  const [id, setId] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run((acct) => writeContract(acct, "adjudicate", [Number(id)]));
      }}
    >
      <p className="console__intro">
        Trigger adjudication of a submitted drop. GenLayer validators each read the rubric and the
        evidence, run an LLM independently, and must agree on a single boolean verdict. This can
        take longer than a normal transaction while consensus runs.
      </p>
      <DropIdField value={id} onChange={setId} />
      <Submit disabled={disabled} label="Run validator adjudication" />
    </form>
  );
}

function SettleForm({
  disabled,
  run,
  config,
}: {
  disabled: boolean;
  run: RunFn;
  config: ProtocolConfig | null;
}) {
  const [id, setId] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run((acct) => writeContract(acct, "settle", [Number(id)]));
      }}
    >
      <p className="console__intro">
        Settle an adjudicated drop after the appeal window closes
        {config ? ` (${config.appeal_window_secs}s on this instance)` : ""}. A verdict of met pays
        the source the escrow minus the protocol fee; not met refunds the poster in full.
      </p>
      <DropIdField value={id} onChange={setId} />
      <Submit disabled={disabled} label="Settle drop" />
    </form>
  );
}

function ExpireForm({ disabled, run }: { disabled: boolean; run: RunFn }) {
  const [id, setId] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run((acct) => writeContract(acct, "expire_drop", [Number(id)]));
      }}
    >
      <p className="console__intro">
        Refund the poster of an open drop that received no submission before its expiration.
      </p>
      <DropIdField value={id} onChange={setId} />
      <Submit disabled={disabled} label="Expire and refund" />
    </form>
  );
}
