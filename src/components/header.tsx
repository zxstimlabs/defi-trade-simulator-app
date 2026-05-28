import { 
  // CandlestickChart, 
  ChevronDown, 
  MoreHorizontal, 
  // X 
} from "lucide-react"
// import { Chart } from "@/components/chart"
// import {
//   Drawer,
//   DrawerClose,
//   DrawerContent,
//   DrawerDescription,
//   DrawerHeader,
//   DrawerTitle,
//   DrawerTrigger,
// } from "@/components/ui/drawer"
import WalletManagement from "@/components/wallet-management"


function MobileHeader() {
  return (
    <header className="flex items-center justify-between border-b bg-background px-4 py-3 md:hidden">
      <button type="button" className="flex flex-col items-start">
        <div className="flex items-center gap-1 text-xl font-semibold leading-tight">
          <span>ETH/VND</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
      </button>

      <div className="flex items-center gap-4">
        {/* <Drawer>
          <DrawerTrigger asChild aria-label="Chart">
            <CandlestickChart className="size-5 text-muted-foreground" />
          </DrawerTrigger>
          <DrawerContent className="outline-none focus:outline-none focus-visible:outline-none data-[vaul-drawer-direction=bottom]:max-h-[85vh]">
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
        </Drawer> */}
        <button type="button" aria-label="More" className="relative">
          <MoreHorizontal className="size-5 text-muted-foreground" />
        </button>
      </div>
    </header>
  )
}

function DesktopHeader() {
  return (
    <header className="hidden items-center gap-6 border-b bg-background px-4 py-3 md:flex md:justify-between">
      <div className="flex flex-row items-center gap-2">
        <img src="/defivn.svg" alt="DeFi.vn logo" className="size-6 dark:invert" />
      </div>
      <WalletManagement />
    </header>
  )
}

export function Header() {
  return (
    <>
      <MobileHeader />
      <DesktopHeader />
    </>
  )
}

export default Header
