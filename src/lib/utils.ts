import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatUnits, type Address } from "viem";

const vnNumberFormat = new Intl.NumberFormat("vi-VN")

// VND-like: no decimals, Vietnamese thousand separators → "5.000.000"
export function formatVndBalance(value: bigint, decimals = 18): string {
  const whole = value / BigInt(10 ** decimals)
  return vnNumberFormat.format(whole)
}

// ETH-like: Vietnamese thousand separators + comma decimal, full precision → "1.234,5678901234567890"
export function formatEthBalance(value: bigint, decimals = 18): string {
  const [whole, frac = ""] = formatUnits(value, decimals).split(".")
  const wholeFormatted = vnNumberFormat.format(BigInt(whole))
  return frac ? `${wholeFormatted},${frac}` : wholeFormatted
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function highlightWalletAddressSections(address: Address) {
  // Standard EVM address: 0x + 40 hex chars = 42 chars total
  // Break into 4 sections of 10 hex chars each (plus 0x prefix on first section)
  const colors = [
    "text-rose-500",      // Section 1: pink/rose
    "text-amber-500",     // Section 2: amber/yellow
    "text-emerald-500",   // Section 3: green
    "text-sky-500",       // Section 4: blue
  ];

  return [
    { text: address.slice(0, 12), colorClass: colors[0] },  // 0x + first 10 hex
    { text: address.slice(12, 22), colorClass: colors[1] }, // next 10 hex
    { text: address.slice(22, 32), colorClass: colors[2] }, // next 10 hex
    { text: address.slice(32, 42), colorClass: colors[3] }, // last 10 hex
  ];
}

export function truncateAddress(address: string | undefined) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function truncateHash(hash: string | undefined) {
  if (!hash) return "";
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export function chainIdToName(chainId: number) {
  switch (chainId) {
    case 1:
      return "Ethereum";
    case 137:
      return "Polygon";
    case 8453:
      return "Base";
  }
}