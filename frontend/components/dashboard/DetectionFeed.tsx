"use client"

import { AnimatedList } from "@/components/ui/animated-list"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface Detection {
  id: string
  timestamp: string
  type: "obstacle" | "text" | "hazard_alert" | "scene"
  content: string
  urgency: "urgent" | "normal" | "low"
}

const urgencyConfig = {
  urgent: { label: "Urgent", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  normal: { label: "Normal", className: "border-mango/30 bg-mango-subtle text-mango" },
  low:    { label: "Info",   className: "border-border bg-muted text-muted-foreground" },
}

function DetectionItem({ item }: { item: Detection }) {
  const cfg = urgencyConfig[item.urgency]
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
      <span className="mt-0.5 font-mono text-xs text-muted-foreground shrink-0">
        {item.timestamp}
      </span>
      <p className="flex-1 text-foreground">{item.content}</p>
      <Badge variant="outline" className={cn("text-xs shrink-0", cfg.className)}>
        {cfg.label}
      </Badge>
    </div>
  )
}

export function DetectionFeed({ items = [] }: { items?: Detection[] }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
           <h3 className="text-sm font-semibold">Detection feed</h3>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-mango animate-pulse" />
          Live telemetry
        </span>
      </div>
      <div className="h-96 overflow-y-auto">
        <div className="p-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
               <p className="text-xs font-mono">WAITING FOR STREAM...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((d) => (
                <DetectionItem key={`${d.id}-${d.timestamp}`} item={d} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
