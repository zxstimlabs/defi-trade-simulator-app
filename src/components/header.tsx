import { CandlestickChart, X } from "lucide-react"
import { Chart } from "@/components/chart"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import WalletManagement from "@/components/wallet-management"

export function Header() {
  return (
    <header className="flex items-center justify-between border-b bg-background px-4 py-3">
      <div className="flex flex-row items-center gap-2">
        <img src="/defivn.svg" alt="DeFi.vn logo" className="size-6 dark:invert" />
      </div>

      <div className="flex items-center gap-4">
        {/* Chart drawer — mobile only; on desktop the chart is shown inline */}
        <Drawer>
          <DrawerTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Chart"
              className="text-muted-foreground md:hidden"
            >
              <CandlestickChart className="size-5" />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[85vh]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>ETH/VND Biểu đồ giá</DrawerTitle>
              <DrawerDescription>Biểu đồ giá cho ETH/VND</DrawerDescription>
            </DrawerHeader>
            <DrawerClose
              aria-label="Close chart"
              className="absolute right-3 top-3 z-10 text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </DrawerClose>
            <div className="mt-6 h-[70vh] min-h-0">
              <Chart />
            </div>
          </DrawerContent>
        </Drawer>
        <WalletManagement />
      </div>
    </header>
  )
}

export default Header
