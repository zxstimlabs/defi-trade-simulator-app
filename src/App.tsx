import { useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSetAtom } from "jotai"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import SwapInterface from "@/components/swap-interface"
import PoolInfo from "@/components/pool-info"
import MarketStatus from "@/components/market-status"
import Chart from "@/components/chart"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { poolStateAtom, recentSwapsAtom, pollStatusAtom } from "@/atoms/poolSnapshotAtoms"
import type { PoolState, SwapEvent } from "@/types/pool"
import { POOL_ID, API_BASE } from "@/lib/constants"

interface PoolSnapshot {
  poolState: PoolState | null
  recentSwaps: SwapEvent[]
  updatedAt: number | null
}

const EMPTY_SNAPSHOT: PoolSnapshot = { poolState: null, recentSwaps: [], updatedAt: null }

function DesktopMain() {
  return (
    <main className="grid flex-1 min-h-0 grid-cols-4 grid-rows-[1fr_auto] gap-2">
      <section className="col-span-1 col-start-1 row-span-2 overflow-y-auto">
        <PoolInfo />
      </section>
      <div className="col-span-2 col-start-2 row-start-1 min-h-0 border border-muted-foreground/10">
        <Chart />
      </div>
      <div className="col-span-2 col-start-2 row-start-2 min-h-0">
        <SwapInterface />
      </div>
      <section className="col-span-1 col-start-4 row-span-2 overflow-y-auto">
        <MarketStatus />
      </section>
    </main>
  )
}

function MobileMain() {
  return (
    <main className="flex flex-1 min-h-0 flex-col gap-2">
      {/* Tabbed secondary info: pool overview (default) / market */}
      <Tabs defaultValue="pool" className="min-h-0 flex-1">
        <TabsList className="w-full">
          <TabsTrigger value="pool">Tổng quan</TabsTrigger>
          <TabsTrigger value="market">Thị trường</TabsTrigger>
        </TabsList>
        {/* keepMounted so both keep their derived state across tab switches */}
        <TabsContent value="pool" keepMounted className="min-h-0 overflow-y-auto">
          <PoolInfo />
        </TabsContent>
        <TabsContent value="market" keepMounted className="min-h-0 overflow-y-auto">
          <MarketStatus />
        </TabsContent>
      </Tabs>
      {/* Swap is the primary action — always visible, pinned to the bottom */}
      <section className="overflow-y-auto">
        <SwapInterface />
      </section>
    </main>
  )
}

export function App() {
  const isDesktop = useMediaQuery("(min-width: 768px)")

  // Atom setters the poll fans out to — all written from queryFn below, so
  // there's a single source of truth and no separate sync effects.
  const setPoolState = useSetAtom(poolStateAtom)
  const setRecentSwaps = useSetAtom(recentSwapsAtom)
  const setPollStatus = useSetAtom(pollStatusAtom)

  // Single 1s poll of GET /defi/pools/:poolId, owned here and fanned out to the
  // components via jotai. ETag/If-None-Match makes unchanged ticks a tiny 304.
  const etagRef = useRef<string | null>(null)
  const lastRef = useRef<PoolSnapshot>(EMPTY_SNAPSHOT)
  useQuery<PoolSnapshot>({
    queryKey: ["pool-snapshot", POOL_ID],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE}/defi/pools/${POOL_ID}`, {
          // Manage conditional requests ourselves rather than via the HTTP cache.
          cache: "no-store",
          headers: etagRef.current ? { "If-None-Match": etagRef.current } : {},
        })

        // 304 unchanged / 503 booting → no new data, but the request
        // round-tripped, so still a live heartbeat. Keep the last snapshot.
        if (res.status === 304 || res.status === 503) {
          setPollStatus({ lastSuccessAt: Date.now(), isError: false })
          return lastRef.current
        }
        if (!res.ok) throw new Error("Failed to fetch pool snapshot")

        etagRef.current = res.headers.get("etag")
        const json = await res.json()
        lastRef.current = {
          poolState: json.poolState ?? null,
          recentSwaps: json.recentSwaps ?? [],
          updatedAt: json.updatedAt ?? null,
        }

        // Fan the fresh snapshot out to consumers and mark the feed live.
        setPoolState(lastRef.current.poolState)
        setRecentSwaps(lastRef.current.recentSwaps)
        setPollStatus({ lastSuccessAt: Date.now(), isError: false })
        return lastRef.current
      } catch (err) {
        // Network blip / bad status → flag the feed down (the footer turns red).
        setPollStatus((prev) => ({ ...prev, isError: true }))
        throw err
      }
    },
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  })

  return (
    <div className="flex h-svh flex-col p-1 md:p-2">
      <Header />
      {isDesktop ? <DesktopMain /> : <MobileMain />}
      <Footer />
    </div>
  )
}

export default App
