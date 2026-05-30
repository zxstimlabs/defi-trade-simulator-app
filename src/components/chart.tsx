import { useState, useMemo } from "react"
import {
  CandlestickSeries,
  Chart as LWChart,
  TimeScale,
  TimeScaleFitContentTrigger,
} from "lightweight-charts-react-components"
import type { CandlestickData, UTCTimestamp } from "lightweight-charts"
import { useAtomValue } from "jotai"
import { useQuery } from "@tanstack/react-query"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { POOL_ID, API_BASE } from "@/lib/constants"
import { recentSwapsAtom } from "@/atoms/poolSnapshotAtoms"
import { type SwapEvent } from "@/types/pool"

const COLORS = {
  green: "#2ebd85",
  red: "#f6465d",
}

type Resolution = "1m" | "5m" | "15m" | "1h" | "4h" | "1d"

const INTERVALS: { value: Resolution; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
]

const BUCKET_SECONDS: Record<Resolution, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
}

const chartOptions = {
  layout: {
    background: { color: "transparent" },
    textColor: "#9ca3af",
  },
  grid: {
    vertLines: { color: "rgba(255, 255, 255, 0.06)" },
    horzLines: { color: "rgba(255, 255, 255, 0.06)" },
  },
  autoSize: true,
}

interface ApiCandle {
  t: number
  open: number
  high: number
  low: number
  close: number
  volume0: number
  volume1: number
  n: number
}

function toLwCandle(c: ApiCandle): CandlestickData<UTCTimestamp> {
  return {
    time: c.t as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }
}

function applySwap(
  candles: CandlestickData<UTCTimestamp>[],
  swap: SwapEvent,
  bucketSeconds: number,
): CandlestickData<UTCTimestamp>[] {
  const t = (Math.floor(swap.blockTimestamp / bucketSeconds) * bucketSeconds) as UTCTimestamp
  const last = candles[candles.length - 1]

  if (last && last.time === t) {
    const updated: CandlestickData<UTCTimestamp> = {
      time: last.time,
      open: last.open,
      high: Math.max(last.high, swap.price),
      low: Math.min(last.low, swap.price),
      close: swap.price,
    }
    return [...candles.slice(0, -1), updated]
  }

  // Either no candles yet, or this swap belongs to a new bucket past the last one
  if (!last || (last.time as number) < (t as number)) {
    return [
      ...candles,
      { time: t, open: swap.price, high: swap.price, low: swap.price, close: swap.price },
    ]
  }

  // Out-of-order swap (older than last candle) — ignore
  return candles
}

function usePoolCandles(resolution: Resolution, limit = 500) {
  const bucketSeconds = BUCKET_SECONDS[resolution]
  const recentSwaps = useAtomValue(recentSwapsAtom)

  // Authoritative OHLC history from the DB. Shared/cached by query key, so it
  // survives unmounts (e.g. the mobile drawer reopening) without re-fetching.
  const { data: seed, isLoading } = useQuery<CandlestickData<UTCTimestamp>[]>({
    queryKey: ["candles", POOL_ID, resolution, limit],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/pools/${POOL_ID}/candles?resolution=${resolution}&limit=${limit}`,
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to fetch candles")
      return (json.candles as ApiCandle[] | undefined ?? []).map(toLwCandle)
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 5,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  })

  // Fold the live swap window onto the seeded history. applySwap only touches
  // the trailing candle (older swaps are ignored), so re-folding the whole
  // window each tick is idempotent — no dedupe bookkeeping needed.
  const candles = useMemo(() => {
    let next = seed ?? []
    for (const s of recentSwaps) next = applySwap(next, s, bucketSeconds)
    return next
  }, [seed, recentSwaps, bucketSeconds])

  return { candles, isLoading }
}

export function Chart() {
  const [resolution, setResolution] = useState<Resolution>("15m")
  const { candles, isLoading } = usePoolCandles(resolution)

  return (
    <div className="flex h-full flex-col p-3">
      <div className="flex items-center justify-between">
        <Tabs value={resolution} onValueChange={(v) => setResolution(v as Resolution)}>
          <TabsList variant="line" className="gap-3">
            {INTERVALS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className={cn(
                  "px-1 text-xs",
                  "data-active:text-foreground after:!bg-yellow-500",
                )}
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {isLoading && (
          <span className="text-[10px] text-muted-foreground">Loading…</span>
        )}
        {!isLoading && candles.length === 0 && (
          <span className="text-[10px] text-muted-foreground">No trades yet</span>
        )}
      </div>

      <div className="mt-3 flex-1 min-h-0">
        <LWChart
          options={chartOptions}
          containerProps={{ style: { width: "100%", height: "100%" } }}
        >
          <CandlestickSeries
            data={candles}
            options={{
              upColor: COLORS.green,
              downColor: COLORS.red,
              borderUpColor: COLORS.green,
              borderDownColor: COLORS.red,
              wickUpColor: COLORS.green,
              wickDownColor: COLORS.red,
            }}
            reactive
          />
          <TimeScale>
            <TimeScaleFitContentTrigger deps={[resolution, candles.length === 0]} />
          </TimeScale>
        </LWChart>
      </div>
    </div>
  )
}

export default Chart
