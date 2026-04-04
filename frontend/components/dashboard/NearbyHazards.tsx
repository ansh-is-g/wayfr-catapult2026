import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"

interface Hazard {
  id: string
  type: string
  severity: "low" | "medium" | "high" | "critical"
  distanceM: number
  direction: string
  description: string
  verifiedCount: number
}

const severityConfig = {
  critical: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/30" },
  high:     { color: "text-orange-500",  bg: "bg-orange-500/10 border-orange-500/30" },
  medium:   { color: "text-mango",       bg: "bg-mango-subtle border-mango/30" },
  low:      { color: "text-green-500",   bg: "bg-green-500/10 border-green-500/30" },
}

export function NearbyHazards({ items = [] }: { items?: Hazard[] }) {
  return (
    <Card className="border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
           <MapPin className="h-4 w-4 text-mango" />
           <h3 className="text-sm font-semibold tracking-tight">Nearby scene annotations</h3>
        </div>
        <Badge variant="outline" className="border-mango/20 bg-mango/5 text-mango text-[10px] font-bold">
          {items.length} ACTIVE
        </Badge>
      </div>

      {items.length > 0 ? (
        <>
          <div className="mb-4 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
            <p className="text-[11px] font-medium text-orange-400 leading-tight">
              {items.length} verified scene annotations within 500m of user location.
            </p>
          </div>

          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {items.map((h) => {
              const cfg = severityConfig[h.severity] || severityConfig.medium
              return (
                <div key={h.id} className={cn("group rounded-xl border p-3.5 transition-all hover:bg-muted/50", cfg.bg)}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={cn("text-xs font-bold uppercase tracking-wider", cfg.color)}>{h.type}</span>
                    <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground uppercase">
                      <MapPin className="h-3 w-3" />
                      {h.distanceM}m &middot; {h.direction}
                    </div>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{h.description}</p>
                  <div className="mt-2.5 flex items-center justify-between border-t border-border/40 pt-2">
                     <span className="text-[10px] italic text-muted-foreground">verified by {h.verifiedCount} users</span>
                     <Badge variant="outline" className="text-[9px] h-4 px-1 border-border/60 bg-background/50 font-mono">ID: {h.id.slice(0, 4)}</Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
           <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <MapPin className="h-5 w-5 text-muted-foreground/40" />
           </div>
           <p className="text-xs font-medium text-muted-foreground">No annotations in this area</p>
           <p className="text-[10px] text-muted-foreground/60 mt-1 uppercase tracking-tighter font-mono">Radius: 500m</p>
        </div>
      )}
    </Card>
  )
}
