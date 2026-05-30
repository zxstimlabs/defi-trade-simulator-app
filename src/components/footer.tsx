import { useState, useEffect } from "react"
import { useAtomValue } from "jotai"
import { cn } from "@/lib/utils"
import { pollStatusAtom } from "@/atoms/poolSnapshotAtoms"

export function Footer() {
  const { lastSuccessAt, isError } = useAtomValue(pollStatusAtom)
  const [now, setNow] = useState(() => Date.now())

  // Tick every second so the "seconds ago" climbs visibly the moment the
  // 1s poll stops landing — the sneaky part: a healthy feed sits quietly at
  // "Trực tiếp", a broken one starts counting up in red.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const ageMs = lastSuccessAt != null ? now - lastSuccessAt : null
  const ageSec = ageMs != null ? Math.max(0, Math.round(ageMs / 1000)) : 0

  const status: "connecting" | "live" | "lagging" | "down" =
    lastSuccessAt == null
      ? "connecting"
      : isError || (ageMs ?? 0) >= 5000
        ? "down"
        : (ageMs ?? 0) >= 3000
          ? "lagging"
          : "live"

  const dotColor = {
    connecting: "bg-yellow-500",
    live: "bg-[#2ebd85]",
    lagging: "bg-yellow-500",
    down: "bg-[#f6465d]",
  }[status]

  const textColor =
    status === "down"
      ? "text-[#f6465d]"
      : status === "lagging"
        ? "text-yellow-500"
        : "text-muted-foreground"

  const label = {
    connecting: "Đang kết nối…",
    live: "Trực tiếp",
    lagging: `Chậm đồng bộ · ${ageSec}s trước`,
    down: `Mất kết nối · ${ageSec}s trước`,
  }[status]

  return (
    <footer className="border-t px-4 py-3">
      <div className={cn("flex items-center gap-1.5 text-xs", textColor)}>
        <span
          className={cn(
            "size-1.5 rounded-full",
            dotColor,
            status === "live" && "animate-pulse",
          )}
        />
        <span>{label}</span>
      </div>
    </footer>
  )
}

export default Footer
