import type { BaseError } from "viem";
import { Hash, ExternalLink, Ban, LoaderCircle, CircleCheck, X, Layers } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { truncateHash, truncateAddress } from "@/lib/utils";
import { useConfig } from "wagmi";

export interface BundledCall {
  label: string;
  to: string;
}

interface TransactionStatusProps {
  hash?: string;
  isPending?: boolean;
  isConfirming?: boolean;
  isConfirmed?: boolean;
  error?: Error | null;
  chainId?: number;
  label?: string;
  bundledCalls?: BundledCall[];
}

export function TransactionStatus({
  hash,
  isPending,
  isConfirming,
  isConfirmed = false,
  error,
  chainId,
  label,
  bundledCalls,
}: TransactionStatusProps) {
  const config = useConfig();
  const explorerUrl = config.chains?.find(chain => chain.id === chainId)?.blockExplorers?.default?.url || config.chains?.[0]?.blockExplorers?.default?.url;

  return (
    <div className="flex flex-col gap-2 border border-muted-foreground/10 rounded-md p-3">
      {label && (
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      )}

      {bundledCalls && bundledCalls.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Layers className="size-3" />
            <span>7702 Bundle ({bundledCalls.length} calls)</span>
          </div>
          <div className="flex flex-col gap-0.5 pl-[18px]">
            {bundledCalls.map((call, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground/50 font-mono w-3 text-right">{i + 1}</span>
                <span>{call.label}</span>
                <span className="text-muted-foreground font-mono">{truncateAddress(call.to)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hash && (isConfirmed || isConfirming) ? (
        <div className="flex flex-row gap-2 items-center">
          <Hash className="w-4 h-4" />
          Mã giao dịch
          <a
            className="flex flex-row gap-2 items-center underline underline-offset-4"
            href={`${explorerUrl}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {truncateHash(hash)}
            <ExternalLink className="w-4 h-4" />
          </a>
          <CopyButton text={hash || ""} />
        </div>
      ) : (
        <div className="flex flex-row gap-2 items-center">
          <Hash className="w-4 h-4" />
          Không có mã giao dịch
        </div>
      )}

      {!isPending && !isConfirmed && !isConfirming && !error && (
        <div className="flex flex-row gap-2 items-center">
          <Ban className="w-4 h-4" /> Không có mã giao dịch
        </div>
      )}

      {isConfirming && (
        <div className="flex flex-row gap-2 items-center text-yellow-500">
          <LoaderCircle className="w-4 h-4 animate-spin" /> Chờ xác nhận...
        </div>
      )}

      {hash && isConfirmed && !isPending && !isConfirming && (
        <div className="flex flex-row gap-2 items-center text-green-500">
          <CircleCheck className="w-4 h-4" /> Đã xác nhận!
        </div>
      )}

      {error && (
        <div className="flex flex-row gap-2 items-center text-red-500">
          <X className="w-4 h-4" /> Lỗi: {(error as BaseError).shortMessage || error.message}
        </div>
      )}
    </div>
  );
}
