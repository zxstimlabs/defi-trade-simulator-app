import { useState, useCallback, useEffect } from "react"
import { RefreshCw, LoaderCircle, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, formatEthBalance, formatVndBalance } from "@/lib/utils"
import { useReadContracts } from "wagmi"
import { useMutation } from "@tanstack/react-query"
import {
  erc20Abi,
  type Address,
  parseUnits,
  encodeFunctionData,
  encodePacked,
  keccak256,
  createWalletClient,
  createPublicClient,
  http,
} from "viem"
import { arbitrumSepolia } from "viem/chains"
import { V4Planner, Actions } from "@uniswap/v4-sdk"
import { Skeleton } from "@/components/ui/skeleton"
import { useAtomValue } from "jotai"
import type { UmKeystore } from "@/types/wallet"
import { activeWalletAtom } from "@/atoms/activeWalletAtom"
import { passwordAtom } from "@/atoms/passwordAtom"
import { decryptWalletToAccount } from "@/lib/um-wallet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { PERMIT2_ABI, UNIVERSAL_ROUTER_ABI } from "@/lib/abis"

const CURRENCY0 = "0x3890f8Fb0F7aa237e03E995CFe7282fdb519F95a" as Address // ETH
const CURRENCY1 = "0x46DEA9Be3165024CC358Fa24798458e62BFC1d57" as Address // VND
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address
const UNIVERSAL_ROUTER = "0xeFd1D4bD4cf1e86Da286BB4CB1B8BcED9C10BA47" as Address
const POOL_KEY = {
  currency0: CURRENCY0,
  currency1: CURRENCY1,
  fee: 500,
  tickSpacing: 10,
  hooks: "0x0000000000000000000000000000000000000000" as Address,
}

const CHAIN_ID = arbitrumSepolia.id
const rpcUrl = import.meta.env.VITE_ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc"
const apiBase = import.meta.env.VITE_ZXSTIM_API || "http://localhost:8001"

const MAX_UINT256 = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")

const BATCH_CALL_AND_SPONSOR_ABI = [
  {
    inputs: [],
    name: "nonce",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

function buildV4SwapInput(zeroForOne: boolean, amountIn: bigint): `0x${string}` {
  const inputCurrency = zeroForOne ? CURRENCY0 : CURRENCY1
  const outputCurrency = zeroForOne ? CURRENCY1 : CURRENCY0

  const planner = new V4Planner()

  planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [{
    poolKey: POOL_KEY,
    zeroForOne,
    amountIn: amountIn.toString(),
    amountOutMinimum: "0",
    hookData: "0x",
  }])

  planner.addAction(Actions.SETTLE_ALL, [inputCurrency, MAX_UINT256.toString()])
  planner.addAction(Actions.TAKE_ALL, [outputCurrency, "0"])

  return planner.finalize() as `0x${string}`
}

type SwapState = "idle" | "pending" | "success" | "error"

const vnGroup = new Intl.NumberFormat("vi-VN")

// Strip VND display formatting back to a parseUnits-friendly numeric string:
// drop "." thousand separators and turn the "," decimal into ".".
function normalizeAmount(raw: string): string {
  let s = raw.replace(/[^\d.,]/g, "")
  s = s.replace(/\./g, "")
  s = s.replace(/,/g, ".")
  const dot = s.indexOf(".")
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "")
  return s
}

// Format a normalized numeric string for display in VND convention:
// "." thousands on the integer part, "," as the decimal separator.
function formatAmountVnd(normalized: string): string {
  if (!normalized) return ""
  const [intRaw, decRaw] = normalized.split(".")
  const intDigits = intRaw.replace(/^0+(?=\d)/, "") || "0"
  const intFormatted = vnGroup.format(BigInt(intDigits))
  return normalized.includes(".") ? `${intFormatted},${decRaw ?? ""}` : intFormatted
}

function OrderPanel({
  side,
  balances,
  isBalancesLoading,
  onRefreshBalances,
}: {
  side: "buy" | "sell"
  balances: { methBalance: bigint; mvndBalance: bigint }
  isBalancesLoading: boolean
  onRefreshBalances: () => void
}) {
  const activeWallet = useAtomValue<UmKeystore | null>(activeWalletAtom)
  const password = useAtomValue(passwordAtom)
  const [amount, setAmount] = useState("")
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const zeroForOne = side === "sell"
  const inputToken = zeroForOne ? CURRENCY0 : CURRENCY1
  const inputSymbol = zeroForOne ? "ETH" : "VND"
  const inputDecimals = 18
  const availableBalance = zeroForOne ? balances.methBalance : balances.mvndBalance

  // Store the normalized numeric value; display it with VND separators.
  const handleAmountChange = (raw: string) => setAmount(normalizeAmount(raw))

  const swapMutation = useMutation({
    mutationFn: async () => {
      if (!amount || !activeWallet || !password) throw new Error("Missing inputs")

      const account = decryptWalletToAccount(activeWallet, password)
      const publicClient = createPublicClient({
        chain: arbitrumSepolia,
        transport: http(rpcUrl),
      })
      const walletClient = createWalletClient({
        account,
        chain: arbitrumSepolia,
        transport: http(rpcUrl),
      })

      const amountIn = parseUnits(amount, inputDecimals)
      const v4SwapInput = buildV4SwapInput(zeroForOne, amountIn)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

      const calls = [
        {
          to: inputToken,
          value: 0n,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [PERMIT2, amountIn],
          }),
        },
        {
          to: PERMIT2,
          value: 0n,
          data: encodeFunctionData({
            abi: PERMIT2_ABI,
            functionName: "approve",
            args: [inputToken, UNIVERSAL_ROUTER, amountIn, Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30],
          }),
        },
        {
          to: UNIVERSAL_ROUTER,
          value: 0n,
          data: encodeFunctionData({
            abi: UNIVERSAL_ROUTER_ABI,
            functionName: "execute",
            args: ["0x10" as `0x${string}`, [v4SwapInput], deadline],
          }),
        },
      ]

      const currentNonce = await publicClient.readContract({
        address: account.address,
        abi: BATCH_CALL_AND_SPONSOR_ABI,
        functionName: "nonce",
      })

      const packed = encodePacked(
        ["uint256", ...calls.flatMap(() => ["address", "uint256", "bytes"] as const)],
        [currentNonce, ...calls.flatMap((c) => [c.to, c.value, c.data])] as [bigint, ...(`0x${string}` | bigint)[]]
      )
      const digest = keccak256(packed)

      const signature = await walletClient.signMessage({ account, message: { raw: digest } })

      const res = await fetch(`${apiBase}/sponsor/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authority: account.address,
          calls: calls.map((c) => ({ to: c.to, value: c.value.toString(), data: c.data })),
          signature,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Sponsored trade failed")

      await publicClient.waitForTransactionReceipt({ hash: result.transactionHash })
      return result.transactionHash as string
    },
    onSuccess: () => onRefreshBalances(),
  })

  // Auto-reset after success/error so the button returns to idle.
  // Depend on the stable bits only — `swapMutation` is a fresh object every
  // render, so including it would re-arm (and clear) the timer on every
  // re-render (e.g. the 1s pool poll), and it would never fire.
  const { isSuccess, isError, reset } = swapMutation
  useEffect(() => {
    if (isSuccess || isError) {
      const t = setTimeout(() => reset(), 1000)
      return () => clearTimeout(t)
    }
  }, [isSuccess, isError, reset])

  const swapState: SwapState = swapMutation.isPending
    ? "pending"
    : swapMutation.isSuccess
      ? "success"
      : swapMutation.isError
        ? "error"
        : "idle"

  const handleSwap = useCallback(() => swapMutation.mutate(), [swapMutation])

  const buttonLabel = (() => {
    if (swapState === "pending") return null
    if (swapState === "success") return null
    if (swapState === "error") return side === "buy" ? "Mua ETH" : "Bán ETH"
    return side === "buy" ? "Mua ETH" : "Bán ETH"
  })()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center border border-muted-foreground/30 px-3 py-2">
        <span className="text-xs text-muted-foreground mr-2">Khối lượng</span>
        {isDesktop ? (
          <input
            value={formatAmountVnd(amount)}
            onChange={(e) => handleAmountChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
            type="text"
            placeholder="0"
            className="flex-1 bg-transparent text-right text-base outline-none"
          />
        ) : (
          <input
            value={formatAmountVnd(amount)}
            onChange={(e) => handleAmountChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
            type="text"
            inputMode="decimal"
            pattern="[0-9]*"
            placeholder="0"
            className="flex-1 bg-transparent text-right text-base outline-none"
          />
        )}
        <span className="ml-2 text-xs text-muted-foreground">{inputSymbol}</span>
      </div>

      <div className="flex flex-col gap-1 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-yellow-500">Số dư</span>
          <div className="flex items-center gap-1.5">
            <span>
              {isBalancesLoading ? (
                <Skeleton className="inline-block w-16 h-3" />
              ) : zeroForOne ? (
                formatEthBalance(availableBalance)
              ) : (
                formatVndBalance(availableBalance)
              )}{" "}
              {inputSymbol}
            </span>
            <button
              type="button"
              onClick={onRefreshBalances}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="size-3" />
            </button>
          </div>
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        className={cn(
          "w-full font-bold",
          side === "buy"
            ? "bg-[#2ebd85] hover:bg-[#2ebd85]/90"
            : "bg-[#f6465d] hover:bg-[#f6465d]/90"
        )}
        disabled={!amount || !activeWallet || !password || swapState === "pending" || swapState === "success"}
        onClick={handleSwap}
      >
        {swapState === "pending" && <LoaderCircle className="size-4 animate-spin" />}
        {swapState === "success" && <Check className="size-4" />}
        {buttonLabel}
      </Button>
    </div>
  )
}

export default function SwapInterface() {
  const activeWallet = useAtomValue<UmKeystore | null>(activeWalletAtom)

  const {
    data: balancesData,
    isLoading: isBalancesLoading,
    refetch: refetchBalances,
  } = useReadContracts({
    contracts: [
      {
        abi: erc20Abi,
        address: CURRENCY0,
        functionName: "balanceOf",
        chainId: CHAIN_ID,
        args: [activeWallet?.address as Address],
      },
      {
        abi: erc20Abi,
        address: CURRENCY1,
        functionName: "balanceOf",
        chainId: CHAIN_ID,
        args: [activeWallet?.address as Address],
      },
    ],
    query: {
      enabled: !!activeWallet?.address,
    },
  })

  const balances = {
    methBalance: (balancesData?.[0]?.result as bigint) ?? BigInt(0),
    mvndBalance: (balancesData?.[1]?.result as bigint) ?? BigInt(0),
  }

  const handleRefresh = useCallback(() => {
    refetchBalances()
  }, [refetchBalances])

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="border border-muted-foreground/10 p-3">
          <OrderPanel
            side="buy"
            balances={balances}
            isBalancesLoading={isBalancesLoading}
            onRefreshBalances={handleRefresh}
          />
        </div>
        <div className="border border-muted-foreground/10 p-3">
          <OrderPanel
            side="sell"
            balances={balances}
            isBalancesLoading={isBalancesLoading}
            onRefreshBalances={handleRefresh}
          />
        </div>
      </div>
    </div>
  )
}
