import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import SwapInterface from "@/components/swap-interface"
import PoolInfo from "@/components/pool-info"
import MarketStatus from "@/components/market-status"
import Chart from "@/components/chart"


export function App() {
  return (
    <div className="flex h-svh flex-col p-1 md:p-2">
      <Header />
      <main className="grid flex-1 min-h-0 grid-cols-4 gap-2">
        <section className="col-span-1 overflow-y-auto">
          <PoolInfo />
        </section>
        <section className="col-span-2 grid grid-rows-[1fr_auto] gap-2">
          <div className="min-h-0 border border-muted-foreground/10">
            <Chart />
          </div>
          <SwapInterface />
        </section>
        <section className="col-span-1 overflow-y-auto">
          <MarketStatus />
        </section>
      </main>
      <Footer />
    </div>
  )
}

export default App
