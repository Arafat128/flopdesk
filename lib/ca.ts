const EVM = /^0x[a-fA-F0-9]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type ContractKind = "evm" | "solana";

export function parseContract(raw: string): { address: string; kind: ContractKind } | null {
  const value = raw.trim();
  if (EVM.test(value)) {
    return { address: value, kind: "evm" };
  }
  if (SOLANA.test(value) && !value.startsWith("0x")) {
    return { address: value, kind: "solana" };
  }
  return null;
}

export function extractContract(text: string): { address: string; kind: ContractKind } | null {
  const evm = text.match(/0x[a-fA-F0-9]{40}/);
  if (evm) {
    return { address: evm[0], kind: "evm" };
  }
  const sol = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/);
  if (sol) {
    return { address: sol[0], kind: "solana" };
  }
  return null;
}
