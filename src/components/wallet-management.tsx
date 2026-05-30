import { useState, useMemo } from "react"
import { useAtom, useSetAtom, useAtomValue } from "jotai"
import { Plus, LoaderCircle, Check, X, LogOut, LogIn, ShieldCheck, ShieldAlert } from "lucide-react"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { Bytes, Keystore, Mnemonic } from "ox"
import { mnemonicToAccount } from "viem/accounts"
import { createWalletClient, http, getAddress, type Address, type PublicClient, type WalletClient, type Transport, type Chain, type Account as ViemAccount } from "viem"
import { arbitrumSepolia } from "viem/chains"
import { usePublicClient, useBytecode } from "wagmi"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { walletsAtom } from "@/atoms/walletsAtom"
import { activeWalletAtom } from "@/atoms/activeWalletAtom"
import { passwordAtom } from "@/atoms/passwordAtom"
import { decryptWalletToAccount } from "@/lib/um-wallet"
import { BATCH_CALL_AND_SPONSOR_CONTRACT_ADDRESS } from "@/lib/constants"
import type { UmKeystore } from "@/types/wallet"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/copy-button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"

const DELEGATE_CONTRACT = BATCH_CALL_AND_SPONSOR_CONTRACT_ADDRESS as Address

const rpcUrl = import.meta.env.VITE_ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc"
const apiBase = import.meta.env.VITE_ZXSTIM_API || "http://localhost:8001"

const MOCK_ETH = "0x3890f8Fb0F7aa237e03E995CFe7282fdb519F95a" as Address
const MOCK_VND = "0x46DEA9Be3165024CC358Fa24798458e62BFC1d57" as Address

type LocalWalletClient = WalletClient<Transport, Chain, ViemAccount>

// ──────────────────────────────────────────────────────────────────────────
// Standalone async helpers — clients are injected by the caller, no
// `createWalletClient`/`createPublicClient` inside.
// ──────────────────────────────────────────────────────────────────────────

function is7702Delegated(code: `0x${string}` | undefined): boolean {
  const expectedPrefix = "0xef0100" + DELEGATE_CONTRACT.slice(2).toLowerCase()
  return code?.toLowerCase().startsWith(expectedPrefix) ?? false
}

async function delegateAccount(
  publicClient: PublicClient,
  walletClient: LocalWalletClient,
): Promise<`0x${string}`> {
  const account = walletClient.account

  const authorization = await walletClient.signAuthorization({
    account,
    contractAddress: DELEGATE_CONTRACT,
    chainId: arbitrumSepolia.id,
    nonce: await publicClient.getTransactionCount({ address: account.address }),
  })

  const res = await fetch(`${apiBase}/delegate/arbitrum-sepolia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      authorization: {
        address: authorization.address,
        chainId: authorization.chainId,
        nonce: authorization.nonce,
        r: authorization.r,
        s: authorization.s,
        yParity: authorization.yParity,
      },
      authority: account.address,
    }),
  })
  const result = await res.json()
  if (!res.ok) throw new Error(result.error || "Delegation failed")

  await publicClient.waitForTransactionReceipt({ hash: result.transactionHash })
  return result.transactionHash as `0x${string}`
}

async function claimMockTokens(walletClient: LocalWalletClient) {
  const account = walletClient.account
  const requester = getAddress(account.address)
  const tokens = [getAddress(MOCK_ETH), getAddress(MOCK_VND)]
  const nonce = Date.now()

  const message = [
    "zxstim-api claim mock-tokens",
    `requester: ${requester}`,
    `tokens: ${tokens.join(",")}`,
    `nonce: ${nonce}`,
  ].join("\n")

  const signature = await walletClient.signMessage({ account, message })

  const res = await fetch(`${apiBase}/claim/mock-tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requester, tokens, nonce, signature }),
  })
  const result = await res.json()
  if (!res.ok) throw new Error(result.error || "Claim failed")
  return result.transfers
}

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// ──────────────────────────────────────────────────────────────────────────
// UI
// ──────────────────────────────────────────────────────────────────────────

type DelegationStatus = "checking" | "delegating" | "delegated" | "not-delegated" | "error"

function DelegationBadge({ status, error, onRetry }: {
  status: DelegationStatus
  error?: string
  onRetry: () => void
}) {
  if (status === "checking") return null
  if (status === "delegated") {
    return (
      <span className="flex items-center gap-1 text-xs text-[#2ebd85]">
        <ShieldCheck className="size-3" />
      </span>
    )
  }
  if (status === "delegating") {
    return (
      <span className="flex items-center gap-1 text-xs text-yellow-500">
        <LoaderCircle className="size-3 animate-spin" />
        Delegating...
      </span>
    )
  }
  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 text-xs text-red-500 hover:underline"
        title={error}
      >
        <ShieldAlert className="size-3" />
        Retry delegation
      </button>
    )
  }
  return null
}

type CreateState = "idle" | "creating" | "delegating" | "claiming" | "done" | "error"

function CreateWalletDialog() {
  const [, setWallets] = useAtom(walletsAtom)
  const setActiveWallet = useSetAtom(activeWalletAtom)
  const setPassword = useSetAtom(passwordAtom)
  const publicClient = usePublicClient({ chainId: arbitrumSepolia.id })
  const [otp, setOtp] = useState("")
  const [createState, setCreateState] = useState<CreateState>("idle")
  const [error, setError] = useState<string>()
  const [open, setOpen] = useState(false)

  async function handleCreate() {
    if (otp.length !== 6 || createState !== "idle") return
    if (!publicClient) return

    setError(undefined)
    setCreateState("creating")

    try {
      // 1. Generate wallet
      const mnemonic = Mnemonic.random(Mnemonic.english)
      const account = mnemonicToAccount(mnemonic)
      const address = account.address
      const mnemonicBytes = Bytes.fromString(mnemonic)
      const [key, opts] = Keystore.pbkdf2({ password: otp })
      const encrypted = Keystore.encrypt(mnemonicBytes, key, opts)

      const walletData = {
        ...encrypted,
        meta: {
          type: "password-keystore-seedphrase",
          note: "the 12 words secret phrase (aka mnemonic phrase) is encrypted with the password using the keystore encryption process",
          umVersion: "0.0.1",
        },
        handle: null,
        name: "defivn",
        address,
      } as UmKeystore

      // 2. Build wallet client bound to the newly-generated account, then delegate
      setCreateState("delegating")
      const walletClient = createWalletClient({
        account,
        chain: arbitrumSepolia,
        transport: http(rpcUrl),
      })
      await delegateAccount(publicClient, walletClient)

      // 3. Seed the new wallet with some mock tokens so it starts with a balance.
      //    A claim failure shouldn't block wallet creation.
      setCreateState("claiming")
      try {
        await claimMockTokens(walletClient)
      } catch (claimErr) {
        console.error("[create-wallet] mock-token claim failed:", claimErr)
      }

      // 4. Persist + activate
      setCreateState("done")
      setTimeout(() => {
        setOpen(false)
        setWallets((prev) => [...prev, walletData])
        setActiveWallet(walletData)
        setPassword(otp)
        setOtp("")
        setCreateState("idle")
      }, 1000)
    } catch (e) {
      console.error("[create-wallet] failed:", e)
      setError(e instanceof Error ? e.message : "Wallet creation failed")
      setCreateState("error")
    }
  }

  const isBusy = createState === "creating" || createState === "delegating" || createState === "claiming"

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isBusy) setOpen(o) }}>
      <DialogTrigger
        render={
          <Button variant="default" size="sm">
            <Plus data-icon="inline-start" />
            Tạo ví
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tạo ví</DialogTitle>
          <DialogDescription>
            Nhập mã 6 chữ số để bảo mật ví của bạn. Nhớ lưu lại mã này để tiếp tục đăng nhập vào ví.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-4">
          <InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={otp} onChange={setOtp} disabled={isBusy || createState === "done"}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        {createState === "creating" && (
          <p className="text-xs text-muted-foreground text-center">Đang tạo ví...</p>
        )}
        {createState === "delegating" && (
          <p className="text-xs text-muted-foreground text-center">Đang thiết lập tài trợ...</p>
        )}
        {createState === "claiming" && (
          <p className="text-xs text-muted-foreground text-center">Đang nhận token thử nghiệm...</p>
        )}
        {createState === "error" && error && (
          <p className="text-xs text-red-500 text-center break-words">{error}</p>
        )}
        <DialogFooter>
          <div className="flex flex-row justify-between w-full">
            <Button variant="outline" disabled={isBusy} onClick={() => setOpen(false)}>Huỷ</Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={isBusy || createState === "done"}
              className={createState === "done" ? "bg-[#2ebd85] hover:bg-[#2ebd85]" : ""}
            >
              {isBusy && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
              {createState === "done" && <Check className="text-primary-foreground" data-icon="inline-start" />}
              {createState === "error" && <X className="text-primary-foreground" data-icon="inline-start" />}
              {(createState === "idle" || createState === "error") && "Tạo"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LoginDialog() {
  const [wallets] = useAtom(walletsAtom)
  const setActiveWallet = useSetAtom(activeWalletAtom)
  const setPassword = useSetAtom(passwordAtom)
  const [otp, setOtp] = useState("")
  const [open, setOpen] = useState(false)

  function handleLogin() {
    if (otp.length !== 6 || !wallets[0]) return
    setActiveWallet(wallets[0])
    setPassword(otp)
    setOtp("")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <LogIn data-icon="inline-start" />
            Đăng nhập
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Đăng nhập</DialogTitle>
          <DialogDescription>
            Nhập mã 6 chữ số để đăng nhập vào ví của bạn.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-4">
          <InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={otp} onChange={setOtp}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <DialogFooter>
          <div className="flex flex-row justify-between w-full">
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="button" onClick={handleLogin}>Đăng nhập</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WalletInfoDialog({ wallet }: { wallet: UmKeystore }) {
  const setActiveWallet = useSetAtom(activeWalletAtom)
  const setPassword = useSetAtom(passwordAtom)
  const password = useAtomValue(passwordAtom)
  const publicClient = usePublicClient({ chainId: arbitrumSepolia.id })
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  // Decrypt account once when the password is available and build the wallet client.
  const walletClient = useMemo<LocalWalletClient | undefined>(() => {
    if (!password) return undefined
    return createWalletClient({
      account: decryptWalletToAccount(wallet, password),
      chain: arbitrumSepolia,
      transport: http(rpcUrl),
    })
  }, [wallet, password])

  const {
    data: code,
    isPending: isChecking,
    queryKey: bytecodeQueryKey,
  } = useBytecode({
    address: wallet.address as Address,
    chainId: arbitrumSepolia.id,
  })
  const isDelegated = is7702Delegated(code)

  const delegateMutation = useMutation({
    mutationFn: () => {
      if (!publicClient || !walletClient) throw new Error("Clients not available")
      return delegateAccount(publicClient, walletClient)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bytecodeQueryKey }),
  })

  const handleDelegate = () => delegateMutation.mutate()

  const delegationStatus: DelegationStatus = isChecking
    ? "checking"
    : delegateMutation.isPending
      ? "delegating"
      : delegateMutation.isError
        ? "error"
        : isDelegated
          ? "delegated"
          : "not-delegated"

  return (
    <div className="flex items-center gap-2">
      <DelegationBadge status={delegationStatus} error={delegateMutation.error?.message} onRetry={handleDelegate} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              {truncateAddress(wallet.address)}
            </Button>
          }
        />
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ví của bạn</DialogTitle>
            <DialogDescription>
              Quản lý ví của bạn.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between rounded border px-3 py-2">
            <span className="text-sm font-mono">{truncateAddress(wallet.address)}</span>
            <CopyButton text={wallet.address} />
          </div>
          <div className="flex items-center justify-between rounded border px-3 py-2">
            <span className="text-sm text-muted-foreground">EIP-7702</span>
            <DelegationBadge status={delegationStatus} error={delegateMutation.error?.message} onRetry={handleDelegate} />
          </div>
          <Button
            variant="outline"
            className="w-full"
            disabled={delegateMutation.isPending}
            onClick={handleDelegate}
          >
            {delegateMutation.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <>
                <ShieldCheck className="size-4" data-icon="inline-start" />
                {isDelegated ? "Re-delegate" : "Delegate"}
              </>
            )}
          </Button>
          <DialogFooter>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                setActiveWallet(null)
                setPassword(null)
                setOpen(false)
              }}
            >
              <LogOut data-icon="inline-start" />
              Đăng xuất
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ReauthDialog({ wallet }: { wallet: UmKeystore }) {
  const setPassword = useSetAtom(passwordAtom)
  const setActiveWallet = useSetAtom(activeWalletAtom)
  const [otp, setOtp] = useState("")

  function handleUnlock() {
    if (otp.length !== 6) return
    setPassword(otp)
    setOtp("")
  }

  function handleLogout() {
    setActiveWallet(null)
  }

  return (
    <Dialog open>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            {truncateAddress(wallet.address)}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mở khoá ví</DialogTitle>
          <DialogDescription>
            Nhập mã 6 chữ số để tiếp tục sử dụng ví.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-4">
          <InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={otp} onChange={setOtp}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <DialogFooter>
          <div className="flex flex-row justify-between w-full">
            <Button variant="outline" onClick={handleLogout}>Đăng xuất</Button>
            <Button type="button" onClick={handleUnlock}>Mở khoá</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function WalletManagement() {
  const [wallets] = useAtom(walletsAtom)
  const [activeWallet] = useAtom(activeWalletAtom)
  const [password] = useAtom(passwordAtom)
  const hasWallet = wallets.length > 0

  if (hasWallet && activeWallet && !password) {
    return <ReauthDialog wallet={activeWallet} />
  }

  if (hasWallet && activeWallet) {
    return <WalletInfoDialog wallet={activeWallet} />
  }

  if (hasWallet && !activeWallet) {
    return <LoginDialog />
  }

  return <CreateWalletDialog />
}
