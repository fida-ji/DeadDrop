// DeadDrop network and contract configuration (GenLayer Bradbury testnet).

export const NETWORK = {
  name: "GenLayer Bradbury",
  chainId: 4221,
  chainIdHex: "0x107d",
  rpc: "https://rpc-bradbury.genlayer.com",
  currency: "GEN",
  explorer: "https://explorer-bradbury.genlayer.com",
  faucet: "https://testnet-faucet.genlayer.foundation",
} as const;

// The deployed DeadDrop contract on Bradbury. This address is public (not a
// secret), so it ships as the default and makes the hosted site work with no
// configuration. Override it with VITE_CONTRACT_ADDRESS for a fresh deployment.
const DEFAULT_CONTRACT_ADDRESS = "0x79F6C2E942DE68a3e24Cf70e42D8A8F2b3813D20";

export const CONTRACT_ADDRESS = (
  import.meta.env.VITE_CONTRACT_ADDRESS?.trim() || DEFAULT_CONTRACT_ADDRESS
) as `0x${string}`;

// Protocol fee cap mirrored from the contract (informational).
export const MAX_FEE_BPS = 1000;

// Public source repository.
export const REPO_URL = "https://github.com/fida-ji/DeadDrop";

export function txUrl(hash: string): string {
  return `${NETWORK.explorer}/tx/${hash}`;
}

export function contractUrl(): string {
  return `${NETWORK.explorer}/contracts/${CONTRACT_ADDRESS}`;
}

export function addressUrl(addr: string): string {
  return `${NETWORK.explorer}/address/${addr}`;
}
