import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import SwapInterface from "@/components/swap-interface"
import PoolInfo from "@/components/pool-info"
import MarketStatus from "@/components/market-status"
import Chart from "@/components/chart"
import { PoolSocketProvider } from "@/hooks/use-pool-socket"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { POOL_ID } from "@/lib/constants"

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
      <section className="overflow-y-auto">
        <PoolInfo />
      </section>
      {/* Single column: tabbed Swap (default) / Market */}
      <Tabs defaultValue="swap" className="min-h-0 flex-1">
        <TabsList className="w-full">
          <TabsTrigger value="swap">Giao dịch</TabsTrigger>
          <TabsTrigger value="market">Thị trường</TabsTrigger>
        </TabsList>
        {/* keepMounted so the swap form isn't wiped when peeking at the market tab */}
        <TabsContent value="swap" keepMounted className="min-h-0 overflow-y-auto">
          <SwapInterface />
        </TabsContent>
        <TabsContent value="market" keepMounted className="min-h-0 overflow-y-auto">
          <MarketStatus />
        </TabsContent>
      </Tabs>
    </main>
  )
}

export function App() {
  const isDesktop = useMediaQuery("(min-width: 768px)")

  return (
    <PoolSocketProvider poolId={POOL_ID}>
      <div className="flex h-svh flex-col p-1 md:p-2">
        <Header />
        {isDesktop ? <DesktopMain /> : <MobileMain />}
        <Footer />
      </div>
    </PoolSocketProvider>
  )
}

export default App
