import { useMemo } from "react";
import Header from "./components/Header";
import CaseFiles from "./components/CaseFiles";
import Console from "./components/Console";
import CountUp from "./components/CountUp";
import Logo from "./components/Logo";
import { Balance, Dossier, Mask, Nodes, Arrow, External } from "./components/Icons";
import { useContractData } from "./lib/useContractData";
import { CONTRACT_ADDRESS, NETWORK, REPO_URL, contractUrl } from "./lib/config";
import { shortAddr, weiToGen } from "./lib/format";

export default function App() {
  const { config, drops, loading, error, refresh } = useContractData();

  const stats = useMemo(() => {
    const open = drops.filter((d) => d.status === "open").length;
    const settled = drops.filter((d) => d.status === "settled").length;
    const released = drops.filter((d) => d.outcome === "released").length;
    const totalWei = drops.reduce((acc, d) => acc + BigInt(d.escrow_amount || "0"), 0n);
    return {
      count: config?.drop_count ?? drops.length,
      open,
      settled,
      released,
      escrowed: weiToGen(totalWei, 3),
    };
  }, [drops, config]);

  return (
    <>
      <a id="top" />
      <Header />

      {/* --- HERO --- */}
      <section className="hero scanlines">
        <div className="wrap hero__grid">
          <div>
            <span className="eyebrow">GenLayer protocol / Bradbury testnet</span>
            <h1>
              Pay a stranger for evidence
              <br />
              you have <span className="accent">not seen</span>
              <span className="cursor" />
            </h1>
            <p className="hero__thesis">
              DeadDrop escrows a bounty against a rubric. An anonymous source submits an evidence
              package. Independent GenLayer validators judge whether it meets the rubric and reach
              consensus on the verdict. Meets it, the source is paid. Does not, the poster is
              refunded. No editor, no committee, no single point of trust.
            </p>
            <div className="hero__cta">
              <a className="btn" href="#console">
                Open the console <Arrow size={15} />
              </a>
              <a className="btn btn--ghost" href="#how">
                Read the protocol
              </a>
            </div>
          </div>

          <div className="terminal panel--tick">
            <div className="terminal__bar">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span style={{ marginLeft: 6 }}>PROTOCOL STATUS // LIVE FROM CHAIN</span>
            </div>
            <div className="terminal__body">
              <div className="statline">
                <span className="k">Drops opened</span>
                <span className="v amber">
                  <CountUp value={stats.count} />
                </span>
              </div>
              <div className="statline">
                <span className="k">Total escrowed</span>
                <span className="v">
                  <CountUp value={Number(stats.escrowed)} decimals={2} /> GEN
                </span>
              </div>
              <div className="statline">
                <span className="k">Open now</span>
                <span className="v">
                  <CountUp value={stats.open} />
                </span>
              </div>
              <div className="statline">
                <span className="k">Settled</span>
                <span className="v">
                  <CountUp value={stats.settled} />
                </span>
              </div>
              <div style={{ marginTop: 14, fontSize: 11, color: "var(--faint)", letterSpacing: "0.06em" }}>
                {loading ? "reading contract\u2026" : `contract ${shortAddr(CONTRACT_ADDRESS)}`}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- TRUST GAP --- */}
      <section className="section" id="why">
        <div className="wrap">
          <span className="eyebrow">The trust gap</span>
          <h2>Anonymous sources and the people who need them cannot trust each other.</h2>
          <p className="lede">
            Secure upload tools moved the file. They did not solve the harder problem: is this
            evidence worth paying for, and how does a source get compensated without revealing who
            they are? Today that judgment sits with one editor or one researcher. That is a single
            point of bias, delay, and suppression, and it leaves most sources with nothing.
          </p>
          <div className="cards">
            <div className="card">
              <h3>
                <Mask className="ico" size={20} /> Sources carry the risk
              </h3>
              <p>
                A person with real evidence takes a personal risk and usually receives no
                compensation and no guarantee anyone will act. That suppresses the supply of
                evidence at the source.
              </p>
            </div>
            <div className="card">
              <h3>
                <Balance className="ico" size={20} /> Buyers have no trustless test
              </h3>
              <p>
                A journalist or researcher must personally vouch for authenticity before paying.
                There is no neutral mechanism to check evidence against stated criteria and release
                funds automatically.
              </p>
            </div>
            <div className="card">
              <h3>
                <Nodes className="ico" size={20} /> The decision cannot be centralized
              </h3>
              <p>
                A token vote is gameable by the party being exposed. A single AI endpoint is
                censorable. The verdict has to come from independent evaluators who agree.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --- HOW IT WORKS --- */}
      <section className="section section--alt" id="how">
        <div className="wrap">
          <span className="eyebrow">How it works</span>
          <h2>One drop moves through a fixed lifecycle.</h2>
          <p className="lede">
            Each state transition is a transaction on the contract. Escrow is held the entire time
            and can only move to the source or back to the poster.
          </p>
          <div className="steps">
            <div className="step">
              <span className="step__n">01 / OPEN</span>
              <h3>Poster escrows a bounty</h3>
              <p>
                A poster calls create_drop_request with a category, a plain-language rubric, and an
                expiration, sending the bounty as escrow.
              </p>
            </div>
            <div className="step">
              <span className="step__n">02 / SUBMITTED</span>
              <h3>Source submits a package</h3>
              <p>
                An anonymous source submits a structured evidence package and a content hash that
                commits to the full documents held off chain.
              </p>
            </div>
            <div className="step">
              <span className="step__n">03 / ADJUDICATED</span>
              <h3>Validators reach a verdict</h3>
              <p>
                Anyone triggers adjudicate. Validators each read the rubric and package, run an LLM,
                and must agree on a single boolean verdict.
              </p>
            </div>
            <div className="step">
              <span className="step__n">04 / SETTLED</span>
              <h3>Escrow is released or refunded</h3>
              <p>
                After the appeal window, settle pays the source the escrow minus the protocol fee,
                or refunds the poster in full if the verdict was not met.
              </p>
            </div>
          </div>
          <div className="notice" style={{ marginTop: 24 }}>
            An open drop that never receives a submission can be expired after its deadline, which
            refunds the poster. Escrow never gets stuck.
          </div>
        </div>
      </section>

      {/* --- ADJUDICATION MODEL --- */}
      <section className="section" id="adjudication">
        <div className="wrap">
          <span className="eyebrow">The adjudication model</span>
          <h2>Validators judge the package against the rubric, not the truth of the world.</h2>
          <div className="two-col">
            <div className="panel panel--tick">
              <h3 style={{ fontSize: 18, marginBottom: 12 }}>What the validators decide</h3>
              <p className="muted" style={{ fontSize: 14.5 }}>
                The question is bounded: does the submitted package, taken at face value, satisfy
                the criteria the poster defined? It is not a real-world investigation. That keeps
                the judgment reproducible enough for independent evaluators to converge.
              </p>
              <ul className="mono-list">
                <li>Does it address the category sought</li>
                <li>Is it internally consistent</li>
                <li>Does it contain specific, verifiable detail</li>
                <li>Does it meet the counts and thresholds in the rubric</li>
                <li>Are there obvious signs of fabrication</li>
              </ul>
            </div>
            <div className="panel panel--tick">
              <h3 style={{ fontSize: 18, marginBottom: 12 }}>Why it needs GenLayer</h3>
              <p className="muted" style={{ fontSize: 14.5 }}>
                A regular contract cannot reason over unstructured evidence. A single API can be
                censored or spoofed. DeadDrop uses GenLayer's Optimistic Democracy: many validators
                run the same evaluation independently and the network compares their verdicts.
              </p>
              <p className="muted" style={{ fontSize: 14.5 }}>
                The equivalence rule is deliberately narrow. Validators must agree on one boolean:
                met or not met. A vague rubric produces disagreement and fails to settle, which
                pushes posters to write precise criteria.
              </p>
              <p style={{ marginTop: 8 }}>
                <a href="https://docs.genlayer.com/" target="_blank" rel="noreferrer">
                  GenLayer documentation{" "}
                  <External size={12} style={{ display: "inline", verticalAlign: "-2px" }} />
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --- FOR POSTERS / FOR SOURCES --- */}
      <section className="section section--alt" id="guides">
        <div className="wrap">
          <span className="eyebrow">Using DeadDrop</span>
          <h2>Two sides, one contract.</h2>
          <div className="two-col">
            <div className="panel">
              <h3 style={{ fontSize: 18, marginBottom: 6 }}>
                <Dossier size={18} className="ico" style={{ display: "inline", verticalAlign: "-3px", marginRight: 8, color: "var(--amber)" }} />
                For posters
              </h3>
              <div className="deflist">
                <Def t="Write a testable rubric" d="Name the required elements, the counts, the dates, and what disqualifies a submission. Precise rubrics converge; vague ones fail to settle." />
                <Def t="Escrow the bounty" d="The value you send with create_drop_request is the escrow. It is released to the source only on a met verdict, minus the protocol fee." />
                <Def t="Set an expiration" d="If no source submits before the deadline, you can expire the drop and reclaim the full escrow." />
              </div>
            </div>
            <div className="panel">
              <h3 style={{ fontSize: 18, marginBottom: 6 }}>
                <Mask size={18} className="ico" style={{ display: "inline", verticalAlign: "-3px", marginRight: 8, color: "var(--amber)" }} />
                For sources
              </h3>
              <div className="deflist">
                <Def t="Submit a package, not raw files" d="Send redacted summaries, excerpts, metadata, dates, and roles. The raw documents stay off chain until settlement." />
                <Def t="Commit with a content hash" d="Include a hash of the full evidence. It proves you held the documents at submission time without exposing them during adjudication." />
                <Def t="Get paid trustlessly" d="If validators agree the package meets the rubric, the escrow is sent to your address after the appeal window. No intermediary decides." />
              </div>
            </div>
          </div>
          <div className="notice" style={{ marginTop: 24 }}>
            <strong>Anonymity model.</strong> The chain records the source address and the evidence
            package you choose to submit. Use a fresh address, and keep the package free of details
            that identify you. DeadDrop protects the evidence during adjudication; it cannot protect
            you from what you choose to write.
          </div>
        </div>
      </section>

      {/* --- CASE FILES (live) --- */}
      <CaseFiles drops={drops} loading={loading} error={error} onRefresh={refresh} />

      {/* --- CONSOLE --- */}
      <Console config={config} onDone={refresh} />

      {/* --- PROTOCOL REFERENCE --- */}
      <section className="section section--alt" id="protocol">
        <div className="wrap">
          <span className="eyebrow">Protocol reference</span>
          <h2>The deployed contract.</h2>
          <div className="two-col">
            <div className="panel">
              <div className="deflist">
                <Def t="Network" d={`${NETWORK.name} (chain ${NETWORK.chainId})`} mono />
                <Def
                  t="Contract"
                  d={
                    <a href={contractUrl()} target="_blank" rel="noreferrer">
                      {CONTRACT_ADDRESS}
                    </a>
                  }
                  mono
                />
                <Def t="Protocol fee" d={config ? `${config.fee_bps / 100}% of a released payout (cap ${config.max_fee_bps / 100}%)` : "1% of a released payout"} mono />
                <Def t="Appeal window" d={config ? `${config.appeal_window_secs}s on this testnet instance` : "set on the instance"} mono />
                <Def t="Fee recipient" d={config ? shortAddr(config.fee_recipient) : "not set"} mono />
              </div>
            </div>
            <div className="panel">
              <div className="label" style={{ marginBottom: 10 }}>Contract methods</div>
              <ul className="mono-list" style={{ marginTop: 0 }}>
                <li>create_drop_request(category, rubric, expiration_secs) payable</li>
                <li>submit_evidence(drop_id, evidence_package, content_hash)</li>
                <li>adjudicate(drop_id)</li>
                <li>settle(drop_id)</li>
                <li>expire_drop(drop_id)</li>
                <li>get_drop(id), list_drops(offset, limit), get_protocol_config</li>
              </ul>
            </div>
          </div>
          <div className="notice" style={{ marginTop: 24 }}>
            The appeal window is short on this testnet instance so a full lifecycle can be
            demonstrated quickly. A production deployment would use hours to days, giving posters
            time to challenge a verdict through GenLayer's appeal mechanism before funds settle.
          </div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="footer">
        <div className="wrap">
          <div className="footer__grid">
            <div>
              <Logo />
              <p className="muted" style={{ fontSize: 13, marginTop: 12, maxWidth: "34ch" }}>
                Trustless adjudication of anonymous evidence, settled on GenLayer.
              </p>
            </div>
            <nav className="footer__links">
              <a href="#how">How it works</a>
              <a href="#cases">Case files</a>
              <a href="#console">Console</a>
              <a href={contractUrl()} target="_blank" rel="noreferrer">Explorer</a>
              <a href={NETWORK.faucet} target="_blank" rel="noreferrer">Faucet</a>
              <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
              <a href="https://docs.genlayer.com/" target="_blank" rel="noreferrer">GenLayer</a>
            </nav>
          </div>
          <p className="footer__note">
            DeadDrop runs on the {NETWORK.name} testnet. Balances are test tokens with no
            monetary value. The case files are real on-chain drops seeded for demonstration and were
            executed from a single maintainer account across roles; in normal use the poster and
            source are different wallets. Nothing here is legal advice.
          </p>
        </div>
      </footer>
    </>
  );
}

function Def({ t, d, mono }: { t: string; d: React.ReactNode; mono?: boolean }) {
  return (
    <div className="defrow">
      <span className="dt">{t}</span>
      <span className="dd" style={mono ? { fontFamily: "var(--mono)", fontSize: 13 } : undefined}>
        {d}
      </span>
    </div>
  );
}
