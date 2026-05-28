import { ChevronDown, FileClock, FileSearch } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type OpenOrder = {
  id: string
  date: string
  pair: string
  type: string
  side: "buy" | "sell"
  price: number
  amount: number
  filled: number
  total: number
}

type Holding = {
  asset: string
  balance: number
  avgCost: number
  pnlPct: number
}

const orderManagementData: {
  openOrders: OpenOrder[]
  holdings: Holding[]
  bots: unknown[]
  desktopTabs: { value: string; label: string; count?: number }[]
  mobileTabs: { value: string; label: string; count?: number }[]
  columns: { label: string; sortable?: boolean | "both" }[]
} = {
  openOrders: [],
  holdings: [],
  bots: [],
  desktopTabs: [
    { value: "open-orders", label: "Open Orders", count: 0 },
    { value: "order-history", label: "Order History" },
    { value: "trade-history", label: "Trade History" },
    { value: "holdings", label: "Holdings" },
    { value: "bots", label: "Bots" },
  ],
  mobileTabs: [
    { value: "open-orders", label: "Open Orders", count: 0 },
    { value: "holdings", label: "Holdings", count: 10 },
    { value: "bots", label: "Bots" },
  ],
  columns: [
    { label: "Date" },
    { label: "Pair" },
    { label: "Type", sortable: true },
    { label: "Side", sortable: true },
    { label: "Price", sortable: "both" },
    { label: "Amount" },
    { label: "Amount per Iceberg Order" },
    { label: "Filled" },
    { label: "Total" },
    { label: "Trigger Conditions" },
    { label: "SOR" },
    { label: "TP/SL" },
  ],
}

function ColumnHeader({
  label,
  sortable,
}: {
  label: string
  sortable?: boolean | "both"
}) {
  return (
    <div className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
      <span>{label}</span>
      {sortable === true && <ChevronDown className="size-3" />}
      {sortable === "both" && (
        <span className="flex flex-col leading-none">
          <ChevronDown className="-mb-0.5 size-2.5 rotate-180" />
          <ChevronDown className="size-2.5" />
        </span>
      )}
    </div>
  )
}

function OrderCard({ order }: { order: OpenOrder }) {
  const sideColor =
    order.side === "buy"
      ? "bg-[#2ebd85]/15 text-[#2ebd85]"
      : "bg-[#f6465d]/15 text-[#f6465d]"
  return (
    <div className="flex flex-col gap-2 border-b px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{order.pair}</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
              sideColor
            )}
          >
            {order.side} · {order.type}
          </span>
        </div>
        <button type="button" className="text-xs text-yellow-500">
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">Price</span>
          <span className="tabular-nums">{order.price.toFixed(2)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">Amount</span>
          <span className="tabular-nums">{order.amount}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">Filled</span>
          <span className="tabular-nums">{order.filled}%</span>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground">{order.date}</div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
      <FileSearch className="size-8 opacity-40" />
      <span>{message}</span>
    </div>
  )
}

function OrderManagementDesktop() {
  const d = orderManagementData
  return (
    <section className="hidden flex-col border-t md:flex">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <Tabs defaultValue="open-orders">
          <TabsList variant="line" className="gap-4">
            {d.desktopTabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className={cn(
                  "px-1 text-sm",
                  "data-active:text-foreground after:!bg-yellow-500"
                )}
              >
                {t.label}
                {t.count !== undefined && `(${t.count})`}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Checkbox id="hide-other-pairs" />
          <Label htmlFor="hide-other-pairs">Hide Other Pairs</Label>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(12,minmax(0,1fr))_auto] items-center gap-3 border-b px-3 py-2">
        {d.columns.map((c) => (
          <ColumnHeader key={c.label} label={c.label} sortable={c.sortable} />
        ))}
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-yellow-500 hover:text-yellow-400"
        >
          Cancel All
          <ChevronDown className="size-3" />
        </button>
      </div>

      {d.openOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-3 py-16 text-xs text-muted-foreground">
          <FileSearch className="size-10 opacity-40" />
          <span>You have no open orders.</span>
        </div>
      ) : null}
    </section>
  )
}

function OrderManagementMobile() {
  const d = orderManagementData
  return (
    <section className="flex h-full flex-col border-t md:hidden">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <Tabs defaultValue="open-orders">
          <TabsList variant="line" className="gap-4">
            {d.mobileTabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className={cn(
                  "px-1 text-sm",
                  "data-active:text-foreground after:!bg-yellow-500"
                )}
              >
                {t.label}
                {t.count !== undefined ? ` (${t.count})` : ""}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <button
          type="button"
          aria-label="Order history"
          className="text-muted-foreground hover:text-foreground"
        >
          <FileClock className="size-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {d.openOrders.length === 0 ? (
          <EmptyState message="You have no open orders." />
        ) : (
          d.openOrders.map((o) => <OrderCard key={o.id} order={o} />)
        )}
      </div>
    </section>
  )
}

export function OrderManagement() {
  return (
    <>
      <OrderManagementMobile />
      <OrderManagementDesktop />
    </>
  )
}

export default OrderManagement
