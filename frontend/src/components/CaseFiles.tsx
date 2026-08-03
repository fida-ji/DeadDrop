import { useMemo, useState } from "react";
import type { Drop } from "../lib/types";
import DropCard from "./DropCard";
import { contractUrl } from "../lib/config";
import { External } from "./Icons";

type Filter = "all" | "open" | "submitted" | "settled";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "open", label: "OPEN" },
  { key: "submitted", label: "SUBMITTED" },
  { key: "settled", label: "SETTLED" },
];

export default function CaseFiles({
  drops,
  loading,
  error,
  onRefresh,
}: {
  drops: Drop[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    if (filter === "all") return drops;
    if (filter === "settled")
      return drops.filter((d) => d.status === "settled" || d.status === "expired");
    return drops.filter((d) => d.status === filter);
  }, [drops, filter]);

  return (
    <section id="cases" className="section section--alt">
      <div className="wrap">
        <span className="eyebrow">Live case files</span>
        <h2>Every drop below is read directly from the contract on Bradbury.</h2>
        <p className="lede">
          These are real drops with real escrow. Two have run the full lifecycle and were
          adjudicated by GenLayer validators; the reasoning shown is the model output that
          consensus agreed on. Nothing here is mock data.
        </p>

        <div className="filterbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip ${filter === f.key ? "active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
          <button className="chip" onClick={onRefresh} style={{ marginLeft: "auto" }}>
            {loading ? "LOADING\u2026" : "\u21BB REFRESH"}
          </button>
        </div>

        {error && !drops.length && (
          <div className="notice" style={{ marginTop: 20 }}>
            Could not read the contract right now: {error}. The network may be rate limiting reads.
            Try refresh in a moment.
          </div>
        )}

        {loading && !drops.length ? (
          <p className="muted mono" style={{ marginTop: 24 }}>
            Reading drops from chain{"\u2026"}
          </p>
        ) : shown.length === 0 ? (
          <p className="muted" style={{ marginTop: 24 }}>
            No drops in this view yet.
          </p>
        ) : (
          <div className="dropgrid">
            {shown.map((d) => (
              <DropCard key={d.id} drop={d} />
            ))}
          </div>
        )}

        <p className="muted" style={{ marginTop: 24, fontSize: 13 }}>
          <a href={contractUrl()} target="_blank" rel="noreferrer">
            Inspect the contract and all transactions on the explorer{" "}
            <External size={12} style={{ display: "inline", verticalAlign: "-2px" }} />
          </a>
        </p>
      </div>
    </section>
  );
}
