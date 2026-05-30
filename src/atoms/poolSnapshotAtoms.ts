import { atom } from "jotai"
import type { PoolState, SwapEvent } from "@/types/pool"

// Fed by the single pool-snapshot poll in App.tsx, read by pool-info, chart,
// and market-status.
export const poolStateAtom = atom<PoolState | null>(null)
export const recentSwapsAtom = atom<SwapEvent[]>([])

// Heartbeat of the poll itself (not the data): `lastSuccessAt` advances on
// every successful poll (200 or 304); `isError` flips when fetches fail. The
// footer reads this to surface a stalled feed.
export interface PollStatus {
  lastSuccessAt: number | null
  isError: boolean
}
export const pollStatusAtom = atom<PollStatus>({ lastSuccessAt: null, isError: false })
