import { useEffect, useRef, useState } from "react"
import { formatUnits, type Address } from "viem"
import { arbitrumSepolia } from "viem/chains"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, formatEthBalance, formatVndBalance } from "@/lib/utils"
import { POOL_ID, API_BASE } from "@/lib/constants"

const EXPLORER_URL = arbitrumSepolia.blockExplorers.default.url
import { usePoolMessage } from "@/hooks/use-pool-socket"

const CURRENCY0 = "0x3890f8Fb0F7aa237e03E995CFe7282fdb519F95a" as Address
const CURRENCY1 = "0x46DEA9Be3165024CC358Fa24798458e62BFC1d57" as Address

interface PoolState {
  currency0Symbol: string
  currency1Symbol: string
  currency0Decimals: number
  currency1Decimals: number
  sqrtPriceX96: string
  tick: number
  protocolFee: number
  lpFee: number
  liquidity: string
  feeGrowthGlobal0X128: string
  feeGrowthGlobal1X128: string
  reserve0: string
  reserve1: string
  blockNumber: string
  updatedAt: number
}

function usePoolStream(poolId: string) {
  const queryClient = useQueryClient()

  const queryKey = ["pool", poolId]

  const { data: pool, status } = useQuery<PoolState>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/pools/${poolId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Tải dữ liệu thất bại")
      return json.pool
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    // Server returns 503 briefly during indexer boot — retry a few times with backoff
    retry: 5,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  })

  usePoolMessage((msg) => {
    if (msg.type === "pool_state") {
      queryClient.setQueryData(["pool", poolId], msg.data)
    }
  })

  return { pool: pool ?? null, isLoading: status === "pending", isError: status === "error" }
}

// Price of 1 token0 (ETH) expressed in token1 (VND), in human units.
function priceToken0InToken1(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
  const numerator = sqrtPriceX96 * sqrtPriceX96
  const denominator = BigInt(2) ** BigInt(192)
  const ratio = Number(numerator) / Number(denominator)
  const decimalAdjustment = 10 ** Math.abs(decimals0 - decimals1)
  return decimals0 >= decimals1 ? ratio * decimalAdjustment : ratio / decimalAdjustment
}

const vndFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export default function PoolInfo() {
  const { pool, isLoading, isError } = usePoolStream(POOL_ID)
  const symbol0 = pool?.currency0Symbol || "mETH"
  const symbol1 = pool?.currency1Symbol || "mVND"
  const decimals0 = pool?.currency0Decimals ?? 18
  const decimals1 = pool?.currency1Decimals ?? 18

  const sqrtPriceX96 = pool?.sqrtPriceX96 ? BigInt(pool.sqrtPriceX96) : undefined
  const tick = pool?.tick
  const protocolFee = pool?.protocolFee
  const lpFee = pool?.lpFee
  const reserve0 = pool?.reserve0 ? BigInt(pool.reserve0) : undefined
  const reserve1 = pool?.reserve1 ? BigInt(pool.reserve1) : undefined

  // 1 ETH (token0) priced in VND (token1), human units
  const priceEthInVnd =
    sqrtPriceX96 != null
      ? priceToken0InToken1(sqrtPriceX96, decimals0, decimals1)
      : undefined
  const price = priceEthInVnd?.toLocaleString(undefined, { maximumFractionDigits: 6 })

  // Colour the price by its last move: green if it rose, red if it fell.
  const prevPriceRef = useRef<number | undefined>(undefined)
  const [priceDirection, setPriceDirection] = useState<"up" | "down" | null>(null)
  useEffect(() => {
    if (priceEthInVnd == null) return
    const prev = prevPriceRef.current
    if (prev != null && priceEthInVnd !== prev) {
      setPriceDirection(priceEthInVnd > prev ? "up" : "down")
    }
    prevPriceRef.current = priceEthInVnd
  }, [priceEthInVnd])

  // Total value of pool reserves in VND: (ETH reserve × ETH price) + VND reserve
  const reservesValueVnd =
    reserve0 != null && reserve1 != null && priceEthInVnd != null
      ? Number(formatUnits(reserve0, decimals0)) * priceEthInVnd +
        Number(formatUnits(reserve1, decimals1))
      : undefined

  if (isError || (!isLoading && !pool)) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-muted-foreground/10 p-4">
        <h2 className="text-sm font-semibold">ETH/VND Pool</h2>
        <p className="text-xs text-muted-foreground">Đang đợi kết nối...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-muted-foreground/10 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {symbol0}/{symbol1}
        </h2>
        <div className="flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${pool ? "bg-[#2ebd85]" : "bg-yellow-500 animate-pulse"}`} />
          <span className="text-xs text-muted-foreground">thử nghiệm</span>
        </div>
      </div>

      <div className="hidden grid-cols-2 gap-x-4 gap-y-2 text-xs md:grid">
        <InfoRow label="Mức phí" loading={isLoading}>
          {lpFee != null ? `${(lpFee / 10000).toFixed(2)}%` : "-"}
        </InfoRow>
        <InfoRow label="Khoảng cách tick" loading={isLoading}>
          10
        </InfoRow>
        <InfoRow label="Tick hiện tại" loading={isLoading}>
          {tick?.toString() ?? "-"}
        </InfoRow>
        <InfoRow label="Phí giao thức" loading={isLoading}>
          {protocolFee != null ? protocolFee.toString() : "-"}
        </InfoRow>
      </div>

      <div className="border-t border-muted-foreground/10 pt-2">
        <p className="text-xs text-muted-foreground mb-1">Giá</p>
        {isLoading ? (
          <Skeleton className="h-5 w-32" />
        ) : (
          <p
            className={cn(
              "text-sm font-medium transition-colors",
              priceDirection === "up" && "text-[#2ebd85]",
              priceDirection === "down" && "text-[#f6465d]",
            )}
          >
            1 {symbol0} = {price ?? "-"} {symbol1}
          </p>
        )}
      </div>

      <div className="border-t border-muted-foreground/10 pt-2">
        <p className="text-xs text-muted-foreground mb-1">Thanh khoản (VND)</p>
        {isLoading ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <p className="text-sm font-medium">
            {reservesValueVnd != null ? `${vndFormat.format(reservesValueVnd)} ${symbol1}` : "-"}
          </p>
        )}
      </div>

      <div className="border-t border-muted-foreground/10 pt-2">
        <p className="text-xs text-muted-foreground mb-1">Tài sản trong pool</p>
        <div className="flex flex-col gap-1">
          <InfoRow label={symbol0} loading={isLoading}>
            {reserve0 != null ? formatEthBalance(reserve0, decimals0) : "-"}
          </InfoRow>
          <InfoRow label={symbol1} loading={isLoading}>
            {reserve1 != null ? formatVndBalance(reserve1, decimals1) : "-"}
          </InfoRow>
        </div>
      </div>

      <div className="hidden border-t border-muted-foreground/10 pt-2 md:block">
        <p className="text-xs text-muted-foreground mb-1">Địa chỉ</p>
        <div className="flex flex-col gap-1 text-xs font-mono">
          <p>
            <span className="text-muted-foreground">ID: </span>
            {truncateAddress(POOL_ID)}
          </p>
          <p>
            <span className="text-muted-foreground">{symbol0}: </span>
            <a
              href={`${EXPLORER_URL}/address/${CURRENCY0}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground hover:underline"
            >
              {truncateAddress(CURRENCY0)}
            </a>
          </p>
          <p>
            <span className="text-muted-foreground">{symbol1}: </span>
            <a
              href={`${EXPLORER_URL}/address/${CURRENCY1}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground hover:underline"
            >
              {truncateAddress(CURRENCY1)}
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

function InfoRow({
  label,
  loading,
  children,
}: {
  label: string
  loading: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      {loading ? <Skeleton className="h-4 w-12" /> : <span>{children}</span>}
    </div>
  )
}
