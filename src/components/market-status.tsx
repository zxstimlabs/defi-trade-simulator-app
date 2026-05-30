import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { activeWalletAtom } from "@/atoms/activeWalletAtom"
import type { UmKeystore } from "@/types/wallet"
import { cn, formatEthBalance } from "@/lib/utils"
import { POOL_ID, API_BASE } from "@/lib/constants"
import { recentSwapsAtom } from "@/atoms/poolSnapshotAtoms"
import type { SwapEvent } from "@/types/pool"

function dedupeAndSort(swaps: SwapEvent[]): SwapEvent[] {
  const seen = new Map<string, SwapEvent>()
  for (const s of swaps) seen.set(s.transactionHash, s)
  return [...seen.values()].sort((a, b) => b.timestamp - a.timestamp)
}

function useSwapStream(filterAddress?: string) {
  // All recent swaps come from the shared 1s poll (oldest-first, capped 50).
  const recentSwaps = useAtomValue(recentSwapsAtom)
  const allSwaps = useMemo(() => dedupeAndSort(recentSwaps), [recentSwaps])

  // The user's fuller history (up to 100) comes from the DB-backed REST
  // endpoint; live swaps from the poll are merged on top.
  const { data: mySeed } = useQuery<SwapEvent[]>({
    queryKey: ["userSwaps", POOL_ID, filterAddress ?? "none"],
    queryFn: async () => {
      if (!filterAddress) return []
      const res = await fetch(`${API_BASE}/pools/${POOL_ID}/users/${filterAddress}/swaps?limit=100`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to fetch user swaps")
      return dedupeAndSort(json.swaps ?? [])
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: !!filterAddress,
    retry: 5,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  })

  const mySwaps = useMemo(() => {
    if (!filterAddress) return []
    const lower = filterAddress.toLowerCase()
    const liveMine = recentSwaps.filter((s) => s.userAddress.toLowerCase() === lower)
    return dedupeAndSort([...liveMine, ...(mySeed ?? [])])
  }, [recentSwaps, mySeed, filterAddress])

  return { allSwaps, mySwaps }
}

const priceFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })
const timeFormat = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

function SwapRow({ swap }: { swap: SwapEvent }) {
  const amount0 = BigInt(swap.amount0)
  // amount0 > 0 means ETH (currency0) leaves the pool to the user = user is BUYING ETH
  const isBuy = amount0 > 0n
  const ethAmount = amount0 < 0n ? -amount0 : amount0

  return (
    <div className="grid grid-cols-[1fr_2fr_1fr] gap-x-2 py-1 text-[10px] font-mono">
      <span className={cn("text-left", isBuy ? "text-[#2ebd85]" : "text-[#f6465d]")}>
        {priceFormat.format(swap.price)}
      </span>
      <span className="text-right">
        {formatEthBalance(ethAmount)}
      </span>
      <span className="text-right text-muted-foreground">
        {timeFormat.format(swap.timestamp)}
      </span>
    </div>
  )
}

function TradeSection({
  title,
  swaps,
  emptyMessage,
  className,
}: {
  title: string
  swaps: SwapEvent[]
  emptyMessage: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-col min-h-0", className)}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="border-b-2 border-primary w-12 mb-2" />
      <div className="grid grid-cols-[1fr_2fr_1fr] gap-x-2 text-xs text-muted-foreground pb-1">
        <span className="text-left">Giá (VND)</span>
        <span className="text-right">Khối lượng (ETH)</span>
        <span className="text-right">Thời gian</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {swaps.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">{emptyMessage}</p>
        ) : (
          swaps.map((swap) => (
            <SwapRow key={swap.transactionHash} swap={swap} />
          ))
        )}
      </div>
    </div>
  )
}

export default function MarketStatus() {
  const activeWallet = useAtomValue<UmKeystore | null>(activeWalletAtom)
  const { allSwaps, mySwaps } = useSwapStream(activeWallet?.address)

  return (
    <div className="flex flex-col gap-0 h-full">
      <TradeSection
        title="Giao dịch gần nhất"
        swaps={allSwaps}
        emptyMessage="No trades yet"
        className="flex-1 border border-muted-foreground/10 p-3"
      />
      <TradeSection
        title="Giao dịch của tôi"
        swaps={mySwaps}
        emptyMessage={activeWallet ? "No trades yet" : "Connect wallet to see your trades"}
        className="flex-1 border border-muted-foreground/10 border-t-0 p-3"
      />
    </div>
  )
}
