/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react"
import { WS_BASE } from "@/lib/constants"

// A single WebSocket connection per pool, shared by every consumer (chart,
// market status, pool info). Each consumer registers a handler via
// `usePoolMessage` instead of opening its own socket.

export interface PoolMessage {
  type: string
  data: unknown
}

type Subscriber = (msg: PoolMessage) => void

interface PoolSocketContextValue {
  subscribe: (fn: Subscriber) => () => void
}

const PoolSocketContext = createContext<PoolSocketContextValue | null>(null)

export function PoolSocketProvider({
  poolId,
  children,
}: {
  poolId: string
  children: ReactNode
}) {
  const subscribers = useRef<Set<Subscriber>>(new Set())
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Stable context value — memoized so consumers don't re-subscribe on render.
  const ctxValue = useMemo<PoolSocketContextValue>(
    () => ({
      subscribe: (fn) => {
        subscribers.current.add(fn)
        return () => {
          subscribers.current.delete(fn)
        }
      },
    }),
    [],
  )

  useEffect(() => {
    let disposed = false

    function connect() {
      if (disposed) return
      try {
        const ws = new WebSocket(`${WS_BASE}/pools/${poolId}/ws`)
        wsRef.current = ws

        ws.onmessage = (event) => {
          let msg: PoolMessage
          try {
            msg = JSON.parse(event.data)
          } catch (e) {
            console.error("[pool-ws] parse error:", e)
            return
          }
          for (const fn of subscribers.current) {
            try {
              fn(msg)
            } catch (e) {
              console.error("[pool-ws] subscriber error:", e)
            }
          }
        }

        ws.onerror = () => ws.close()

        ws.onclose = () => {
          wsRef.current = null
          if (disposed) return
          reconnectTimer.current = setTimeout(connect, 5000)
        }
      } catch {
        if (!disposed) reconnectTimer.current = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      disposed = true
      clearTimeout(reconnectTimer.current)
      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        // Detach handlers first so the deliberate close() below doesn't
        // schedule a zombie reconnect after unmount.
        ws.onclose = null
        ws.onerror = null
        ws.onmessage = null
        ws.close()
      }
    }
  }, [poolId])

  return (
    <PoolSocketContext.Provider value={ctxValue}>
      {children}
    </PoolSocketContext.Provider>
  )
}

/**
 * Subscribe to messages from the shared pool socket. The latest `handler` is
 * always invoked without re-subscribing, so it may safely close over changing
 * values (filters, resolution, etc.).
 */
export function usePoolMessage(handler: (msg: PoolMessage) => void) {
  const ctx = useContext(PoolSocketContext)
  if (!ctx) {
    throw new Error("usePoolMessage must be used within a PoolSocketProvider")
  }

  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    return ctx.subscribe((msg) => handlerRef.current(msg))
  }, [ctx])
}
