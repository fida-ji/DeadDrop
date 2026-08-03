import { NETWORK } from "./config";
import type { Drop, DropStatus } from "./types";
import { ZERO_ADDRESS } from "./types";

export const WEI = 10n ** 18n;

export function genToWei(gen: string | number): bigint {
  const s = String(gen).trim();
  if (!s) return 0n;
  const neg = s.startsWith("-");
  const clean = neg ? s.slice(1) : s;
  const [whole, frac = ""] = clean.split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  const v = BigInt(whole || "0") * WEI + BigInt(fracPadded || "0");
  return neg ? -v : v;
}

export function weiToGen(wei: bigint | string, dp = 4): string {
  const v = typeof wei === "string" ? BigInt(wei || "0") : wei;
  const whole = v / WEI;
  const frac = v % WEI;
  const fracStr = frac
    .toString()
    .padStart(18, "0")
    .slice(0, dp)
    .replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

export function shortAddr(addr?: string): string {
  if (!addr) return "";
  if (addr.toLowerCase() === ZERO_ADDRESS) return "unassigned";
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

export function isZero(addr?: string): boolean {
  return !addr || addr.toLowerCase() === ZERO_ADDRESS;
}

export function fmtDateTime(epochSecs: number): string {
  if (!epochSecs) return "not set";
  const d = new Date(epochSecs * 1000);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function timeUntil(epochSecs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = epochSecs - now;
  if (diff <= 0) return "elapsed";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export interface StatusMeta {
  label: string;
  tone: "amber" | "released" | "refunded" | "muted" | "submitted";
}

export function statusMeta(d: Drop): StatusMeta {
  switch (d.status) {
    case "open":
      return { label: "OPEN", tone: "amber" };
    case "submitted":
      return { label: "SUBMITTED", tone: "submitted" };
    case "adjudicated":
      return {
        label: d.verdict ? "ADJUDICATED / MET" : "ADJUDICATED / NOT MET",
        tone: d.verdict ? "released" : "refunded",
      };
    case "settled":
      return d.outcome === "released"
        ? { label: "RELEASED", tone: "released" }
        : { label: "REFUNDED", tone: "refunded" };
    case "expired":
      return { label: "EXPIRED / REFUNDED", tone: "muted" };
    default:
      return { label: String(d.status).toUpperCase(), tone: "muted" };
  }
}

const STATUS_STEPS: DropStatus[] = ["open", "submitted", "adjudicated", "settled"];

export function stepIndex(status: DropStatus): number {
  if (status === "expired") return 1; // open -> expired branch
  const i = STATUS_STEPS.indexOf(status);
  return i < 0 ? 0 : i;
}

export function currencyLabel(): string {
  return NETWORK.currency;
}
