import { useState, useEffect, useRef } from "react"
import {
  CandlestickSeries,
  Chart as LWChart,
  TimeScale,
  TimeScaleFitContentTrigger,
} from "lightweight-charts-react-components"
import type { CandlestickData, UTCTimestamp } from "lightweight-charts"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const POOL_ID =
  "0x363251ac1864e05ea6f839785a02ccaef52cd97f9e2b4516a4c47b638efb4257"

const API_BASE = import.meta.env.VITE_ZXSTIM_API || "http://localhost:8001"
const WS_BASE = API_BASE.replace("http", "ws")

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

interface SwapEvent {
  poolId: string
  price: number
  amount0: string
  amount1: string
  blockTimestamp: number
  transactionHash: string
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

function usePoolCandles(poolId: string, resolution: Resolution) {
  const queryClient = useQueryClient()
  const bucketSeconds = BUCKET_SECONDS[resolution]
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const queryKey = ["candles", poolId, resolution] as const

  const { data: candles, isLoading } = useQuery<CandlestickData<UTCTimestamp>[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/pools/${poolId}/candles?resolution=${resolution}&limit=500`,
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to fetch candles")
      const apiCandles: ApiCandle[] = json.candles ?? []
      return apiCandles.map(toLwCandle)
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 5,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  })

  useEffect(() => {
    function connect() {
      try {
        const ws = new WebSocket(`${WS_BASE}/pools/${poolId}/ws`)
        wsRef.current = ws

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type !== "swap") return
            const swap = msg.data as SwapEvent
            queryClient.setQueryData<CandlestickData<UTCTimestamp>[]>(queryKey, (prev) =>
              applySwap(prev ?? [], swap, bucketSeconds),
            )
          } catch (e) {
            console.error("[chart-ws] parse error:", e)
          }
        }

        ws.onerror = () => ws.close()

        ws.onclose = () => {
          wsRef.current = null
          reconnectTimer.current = setTimeout(connect, 5000)
        }
      } catch {
        reconnectTimer.current = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, bucketSeconds, queryClient])

  return { candles: candles ?? [], isLoading }
}

export function Chart() {
  const [resolution, setResolution] = useState<Resolution>("1m")
  const { candles, isLoading } = usePoolCandles(POOL_ID, resolution)

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
