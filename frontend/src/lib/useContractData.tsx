import { useCallback, useEffect, useState } from "react";
import { readContract } from "./genlayer";
import type { Drop, ProtocolConfig } from "./types";

interface ContractData {
  config: ProtocolConfig | null;
  drops: Drop[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useContractData(): ContractData {
  const [config, setConfig] = useState<ProtocolConfig | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      // Sequential (not parallel) to respect the read rate limit / global queue.
      const cfg = (await readContract<ProtocolConfig>("get_protocol_config")) ?? null;
      setConfig(cfg);
      const list = (await readContract<Drop[]>("list_drops", [0, 50])) ?? [];
      setDrops(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { config, drops, loading, error, refresh };
}
