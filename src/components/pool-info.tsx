import { useEffect, useRef } from "react"
import { formatUnits, type Address } from "viem"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"

const POOL_ID =
  "0x363251ac1864e05ea6f839785a02ccaef52cd97f9e2b4516a4c47b638efb4257"

const CURRENCY0 = "0x3890f8Fb0F7aa237e03E995CFe7282fdb519F95a" as Address
const CURRENCY1 = "0x46DEA9Be3165024CC358Fa24798458e62BFC1d57" as Address
const POOL_MANAGER = "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317" as Address

const API_BASE = import.meta.env.VITE_ZXSTIM_API || "http://localhost:8001"
const WS_BASE = API_BASE.replace("http", "ws")

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
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const queryKey = ["pool", poolId]

  const { data: pool, status } = useQuery<PoolState>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/pools/${poolId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to fetch pool")
      return json.pool
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    // Server returns 503 briefly during indexer boot — retry a few times with backoff
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
            if (msg.type === "pool_state") {
              queryClient.setQueryData(queryKey, msg.data)
            }
          } catch (e) {
            console.error("[pool-ws] parse error:", e)
          }
        }

        ws.onerror = () => {
          ws.close()
        }

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
  }, [poolId, queryClient])

  return { pool: pool ?? null, isLoading: status === "pending", isError: status === "error" }
}

function sqrtPriceX96ToPrice(sqrtPriceX96: bigint, decimals0: number, decimals1: number): string {
  const numerator = sqrtPriceX96 * sqrtPriceX96
  const denominator = BigInt(2) ** BigInt(192)
  const decimalAdjustment = 10 ** Math.abs(decimals0 - decimals1)

  if (decimals0 >= decimals1) {
    const price = Number(numerator) / Number(denominator) * decimalAdjustment
    return price.toLocaleString(undefined, { maximumFractionDigits: 6 })
  }
  const price = Number(numerator) / Number(denominator) / decimalAdjustment
  return price.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

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
  const liquidity = pool?.liquidity ? BigInt(pool.liquidity) : undefined
  const feeGrowth0 = pool?.feeGrowthGlobal0X128
  const feeGrowth1 = pool?.feeGrowthGlobal1X128
  const reserve0 = pool?.reserve0 ? BigInt(pool.reserve0) : undefined
  const reserve1 = pool?.reserve1 ? BigInt(pool.reserve1) : undefined

  const price =
    sqrtPriceX96 != null
      ? sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1)
      : undefined

  if (isError || (!isLoading && !pool)) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-muted-foreground/10 p-4">
        <h2 className="text-sm font-semibold">mETH/mVND Pool</h2>
        <p className="text-xs text-muted-foreground">Waiting for connection...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-muted-foreground/10 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {symbol0}/{symbol1} Pool
        </h2>
        <div className="flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${pool ? "bg-[#2ebd85]" : "bg-yellow-500 animate-pulse"}`} />
          <span className="text-xs text-muted-foreground">
            {pool ? `#${pool.blockNumber}` : "Arbitrum Sepolia"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <InfoRow label="Fee Tier" loading={isLoading}>
          {lpFee != null ? `${(lpFee / 10000).toFixed(2)}%` : "-"}
        </InfoRow>
        <InfoRow label="Tick Spacing" loading={isLoading}>
          10
        </InfoRow>
        <InfoRow label="Current Tick" loading={isLoading}>
          {tick?.toString() ?? "-"}
        </InfoRow>
        <InfoRow label="Protocol Fee" loading={isLoading}>
          {protocolFee != null ? protocolFee.toString() : "-"}
        </InfoRow>
      </div>

      <div className="border-t border-muted-foreground/10 pt-2">
        <p className="text-xs text-muted-foreground mb-1">Price</p>
        {isLoading ? (
          <Skeleton className="h-5 w-32" />
        ) : (
          <p className="text-sm font-medium">
            1 {symbol0} = {price ?? "-"} {symbol1}
          </p>
        )}
      </div>

      <div className="border-t border-muted-foreground/10 pt-2">
        <p className="text-xs text-muted-foreground mb-1">Liquidity</p>
        {isLoading ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <p className="text-sm font-mono">
            {liquidity?.toLocaleString() ?? "-"}
          </p>
        )}
      </div>

      <div className="border-t border-muted-foreground/10 pt-2">
        <p className="text-xs text-muted-foreground mb-1">Pool Reserves</p>
        <div className="flex flex-col gap-1">
          <InfoRow label={symbol0} loading={isLoading}>
            {reserve0 != null ? formatUnits(reserve0, decimals0) : "-"}
          </InfoRow>
          <InfoRow label={symbol1} loading={isLoading}>
            {reserve1 != null ? formatUnits(reserve1, decimals1) : "-"}
          </InfoRow>
        </div>
      </div>

      <div className="border-t border-muted-foreground/10 pt-2">
        <p className="text-xs text-muted-foreground mb-1">Fee Growth (Global)</p>
        <div className="flex flex-col gap-1 text-xs font-mono">
          {isLoading ? (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </>
          ) : (
            <>
              <p className="truncate">
                {symbol0}: {feeGrowth0 ?? "-"}
              </p>
              <p className="truncate">
                {symbol1}: {feeGrowth1 ?? "-"}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-muted-foreground/10 pt-2">
        <p className="text-xs text-muted-foreground mb-1">Addresses</p>
        <div className="flex flex-col gap-1 text-xs font-mono">
          <p>
            <span className="text-muted-foreground">Pool ID: </span>
            {truncateAddress(POOL_ID)}
          </p>
          <p>
            <span className="text-muted-foreground">{symbol0}: </span>
            {truncateAddress(CURRENCY0)}
          </p>
          <p>
            <span className="text-muted-foreground">{symbol1}: </span>
            {truncateAddress(CURRENCY1)}
          </p>
          <p>
            <span className="text-muted-foreground">PoolManager: </span>
            {truncateAddress(POOL_MANAGER)}
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
