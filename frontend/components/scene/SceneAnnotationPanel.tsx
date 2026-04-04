"use client"

import { Search } from "lucide-react"

import type { ObjectItem } from "@/components/scene/HomeSceneViewer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface SceneAnnotationPanelProps {
  objects: ObjectItem[]
  visibleObjects: ObjectItem[]
  query: string
  hiddenLabels: string[]
  selectedObjectId?: string | null
  hoveredObjectId?: string | null
  onQueryChange: (value: string) => void
  onToggleLabel: (label: string) => void
  onSelectAll: () => void
  onUnselectAll: () => void
  onReset: () => void
  onObjectSelect?: (objectId: string | null) => void
  onObjectHover?: (objectId: string | null) => void
  className?: string
}

export function SceneAnnotationPanel({
  objects,
  visibleObjects,
  query,
  hiddenLabels,
  selectedObjectId,
  hoveredObjectId,
  onQueryChange,
  onToggleLabel,
  onSelectAll,
  onUnselectAll,
  onReset,
  onObjectSelect,
  onObjectHover,
  className,
}: SceneAnnotationPanelProps) {
  const uniqueLabels = Array.from(
    new Set(
      objects
        .map((object) => object.label.trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort()

  return (
    <Card className={cn("border-border/50 bg-background/42 shadow-none backdrop-blur-2xl", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Annotations</CardTitle>
            <CardDescription>
              {visibleObjects.length} of {objects.length} currently visible
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={onSelectAll}>
              Select all
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={onUnselectAll}>
              Unselect all
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={onReset}>
              Reset
            </Button>
          </div>
        </div>

        <div className="relative pt-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Filter labels"
            className="rounded-2xl border-border/70 bg-background/55 pl-10"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
          {uniqueLabels.map((label) => {
            const isActive = !hiddenLabels.includes(label)

            return (
              <button
                key={label}
                type="button"
                onClick={() => onToggleLabel(label)}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] backdrop-blur-xl transition-colors",
                  isActive
                    ? "border-mango/25 bg-mango/8 text-mango"
                    : "border-border/60 bg-background/48 text-muted-foreground"
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="space-y-2">
          {visibleObjects.length > 0 ? (
            visibleObjects.slice(0, 12).map((object) => {
              const isSelected = selectedObjectId === object.id
              const isHovered = hoveredObjectId === object.id

              return (
                <button
                  key={object.id}
                  type="button"
                  onClick={() => onObjectSelect?.(isSelected ? null : object.id)}
                  onMouseEnter={() => onObjectHover?.(object.id)}
                  onMouseLeave={() => onObjectHover?.(null)}
                  onFocus={() => onObjectHover?.(object.id)}
                  onBlur={() => onObjectHover?.(null)}
                  className={cn(
                    "w-full rounded-2xl border px-3 py-3 text-left backdrop-blur-xl transition-colors",
                    isSelected
                      ? "border-mango/40 bg-mango/10"
                      : isHovered
                        ? "border-sky-300/35 bg-sky-300/8"
                        : "border-border/60 bg-background/44"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium capitalize text-foreground">{object.label}</p>
                        {isSelected ? (
                          <span className="rounded-full border border-mango/35 bg-mango/12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-mango">
                            Selected
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        x={object.x.toFixed(2)} y={object.y.toFixed(2)} z={object.z.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{object.n_observations} frames</p>
                      {object.confidence != null && <p>{Math.round(object.confidence * 100)}%</p>}
                    </div>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="rounded-2xl border border-border/60 bg-background/35 px-4 py-6 text-sm text-muted-foreground">
              No annotations match the current filter.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
