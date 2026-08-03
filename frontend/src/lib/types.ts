export type DropStatus =
  | "open"
  | "submitted"
  | "adjudicated"
  | "settled"
  | "expired";

export type DropOutcome = "pending" | "released" | "refunded";

export interface Drop {
  id: number;
  poster: string;
  category: string;
  rubric: string;
  escrow_amount: string; // wei, as string
  fee_bps: number;
  expiration_ts: number;
  status: DropStatus;
  source: string;
  evidence_package: string;
  content_hash: string;
  submitted_at: number;
  adjudicated_at: number;
  settle_after_ts: number;
  verdict: boolean;
  confidence: number;
  reasoning: string;
  outcome: DropOutcome;
  paid_amount: string; // wei, as string
  created_at: string;
}

export interface ProtocolConfig {
  owner: string;
  fee_recipient: string;
  fee_bps: number;
  appeal_window_secs: number;
  drop_count: number;
  max_fee_bps: number;
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
