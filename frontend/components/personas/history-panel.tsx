"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Clock, Home, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { HistorySession } from "@/app/api/personas/history/route"

export type { HistorySession }

interface HistoryPanelProps {
  onLoadSession: (session: HistorySession) => void
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function HistoryPanel({ onLoadSession }: HistoryPanelProps) {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<HistorySession[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [open])

  const handleToggle = useCallback(async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    setLoading(true)
    try {
      const res = await fetch("/api/personas/history")
      const data = (await res.json()) as { sessions?: HistorySession[] }
      setSessions(data.sessions ?? [])
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        title="Past sessions"
        aria-label="View past sessions"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200",
          open
            ? "border-mango/50 bg-mango/10 text-mango"
            : "border-border/50 bg-background/60 text-muted-foreground hover:border-border hover:text-foreground dark:bg-[oklch(0.18_0.008_60)]"
        )}
      >
        <Clock className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 overflow-hidden rounded-2xl border border-border/50 bg-background/95 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[oklch(0.14_0.008_60)/0.97]">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Past Sessions
            </p>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Clock className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No past sessions found</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Sessions appear once you annotate a space
              </p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto py-1.5">
              {sessions.map((session) => {
                const primaryColor = session.persona?.colorScheme.primary ?? "#F5A623"
                const role = session.persona?.role ?? session.plan.personaRole
                const count = session.plan.annotations.length

                return (
                  <button
                    key={session.sessionId}
                    onClick={() => {
                      onLoadSession(session)
                      setOpen(false)
                    }}
                    className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    {/* Color swatch */}
                    <div
                      className="mt-1 h-2 w-2 shrink-0 rounded-full ring-1 ring-white/10"
                      style={{ backgroundColor: primaryColor }}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground group-hover:text-foreground">
                        {role}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Home className="h-3 w-3 shrink-0" />
                        <span className="truncate">{session.homeName ?? session.homeId}</span>
                        <span className="shrink-0 opacity-50">·</span>
                        <span className="shrink-0">{timeAgo(session.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground/70">
                        {count} annotation{count !== 1 ? "s" : ""}
                        {session.plan.summary ? ` · ${session.plan.summary.slice(0, 40)}${session.plan.summary.length > 40 ? "…" : ""}` : ""}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
