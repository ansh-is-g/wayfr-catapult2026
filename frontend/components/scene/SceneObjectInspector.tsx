"use client"

import Image from "next/image"
import { EyeOff, Focus, Pin, ScanSearch, Sparkles } from "lucide-react"

import type { ObjectItem, SceneDisplayMode } from "@/components/scene/HomeSceneViewer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type ObjectEvidenceFrame = {
  frame_idx: number
  sampled_frame_idx: number
  timestamp_sec: number
  bbox?: number[] | null
  mask_quality?: number | null
  label_confidence?: number | null
  image_url?: string | null
}

export type ObjectEvidencePayload = {
  track_id: number
  label?: string
  label_confidence?: number
  frames_seen_count?: number
  evidence_strength?: number
  frames: ObjectEvidenceFrame[]
  message?: string
}

interface SceneObjectInspectorProps {
  focusedObject: ObjectItem | null
  selectedObjects: ObjectItem[]
  pinnedObjectIds: string[]
  displayMode: SceneDisplayMode
  evidence: ObjectEvidencePayload | null
  evidenceLoading: boolean
  activeEvidenceFrame: number | null
  onClearSelection: () => void
  onToggleIsolate: () => void
  onTogglePin: (objectId: string) => void
  onHideObject: (objectId: string) => void
  onHideLabel: (label: string) => void
  onSelectEvidenceFrame: (sampledFrameIdx: number) => void
}

function formatConfidence(confidence: number | null | undefined) {
  if (confidence == null) return "n/a"
  return `${Math.round(confidence * 100)}%`
}

function formatTimestamp(seconds: number) {
  if (!Number.isFinite(seconds)) return "Unknown"
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds - mins * 60
  return `${mins}m ${secs.toFixed(1)}s`
}

export function SceneObjectInspector({
  focusedObject,
  selectedObjects,
  pinnedObjectIds,
  displayMode,
  evidence,
  evidenceLoading,
  activeEvidenceFrame,
  onClearSelection,
  onToggleIsolate,
  onTogglePin,
  onHideObject,
  onHideLabel,
  onSelectEvidenceFrame,
}: SceneObjectInspectorProps) {
  const multipleSelected = selectedObjects.length > 1
  const focusedPinned = focusedObject ? pinnedObjectIds.includes(focusedObject.id) : false

  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-card/58 shadow-none backdrop-blur-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Inspector</CardTitle>
          <CardDescription>
            {focusedObject ? "Focus an object to inspect its geometry and evidence." : "Select an object to explore it."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {focusedObject ? (
            <>
              <div className="rounded-3xl border border-mango/20 bg-mango/8 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-mango/80">Focused object</p>
                    <h3 className="mt-2 text-2xl font-semibold capitalize text-foreground">{focusedObject.label}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedObjects.length} selected · confidence {formatConfidence(focusedObject.confidence)}
                    </p>
                  </div>
                  {focusedPinned ? <Sparkles className="h-5 w-5 text-mango" /> : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/45 px-3 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Track</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{focusedObject.track_id ?? "n/a"}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/45 px-3 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Support</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{focusedObject.n_observations} frames</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border/60 bg-background/45 px-3 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">X</p>
                    <p className="mt-1 text-sm text-foreground">{focusedObject.x.toFixed(2)}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/45 px-3 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Y</p>
                    <p className="mt-1 text-sm text-foreground">{focusedObject.y.toFixed(2)}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/45 px-3 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Z</p>
                    <p className="mt-1 text-sm text-foreground">{focusedObject.z.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" className="rounded-full" onClick={onToggleIsolate}>
                  <Focus className="mr-2 h-4 w-4" />
                  {displayMode === "isolate" ? "Exit isolate" : "Isolate focus"}
                </Button>
                <Button variant="outline" className="rounded-full" onClick={onClearSelection}>
                  <ScanSearch className="mr-2 h-4 w-4" />
                  Clear selection
                </Button>
                <Button variant="outline" className="rounded-full" onClick={() => onTogglePin(focusedObject.id)}>
                  <Pin className="mr-2 h-4 w-4" />
                  {focusedPinned ? "Unpin object" : "Pin object"}
                </Button>
                <Button variant="outline" className="rounded-full" onClick={() => onHideObject(focusedObject.id)}>
                  <EyeOff className="mr-2 h-4 w-4" />
                  Hide instance
                </Button>
              </div>

              <Button variant="outline" className="w-full rounded-full" onClick={() => onHideLabel(focusedObject.label)}>
                <EyeOff className="mr-2 h-4 w-4" />
                Hide class “{focusedObject.label}”
              </Button>

              {multipleSelected ? (
                <div className="rounded-2xl border border-sky-300/20 bg-sky-300/8 px-4 py-3 text-sm text-sky-100">
                  {selectedObjects.length} objects are selected. The first active focus stays centered while the rest stay grouped in the scene.
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
              Use the object browser or click an object in the scene to enter focus mode.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/58 shadow-none backdrop-blur-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Supporting Frames</CardTitle>
          <CardDescription>
            {focusedObject
              ? "Source frames help explain why this object exists in 3D."
              : "Frame evidence will appear once an object is focused."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {evidenceLoading ? (
            <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
              Loading object evidence…
            </div>
          ) : evidence && evidence.frames.length > 0 ? (
            <>
              <div className="grid gap-3">
                {evidence.frames.map((frame) => {
                  const active = frame.sampled_frame_idx === activeEvidenceFrame

                  return (
                    <button
                      key={frame.sampled_frame_idx}
                      type="button"
                      onClick={() => onSelectEvidenceFrame(frame.sampled_frame_idx)}
                      className={cn(
                        "overflow-hidden rounded-3xl border text-left transition-colors",
                        active ? "border-mango/35 bg-mango/8" : "border-border/60 bg-background/42 hover:bg-background/56"
                      )}
                    >
                      <div className="relative aspect-[16/9] overflow-hidden bg-black/20">
                        {frame.image_url ? (
                          <Image
                            src={frame.image_url}
                            alt={`Supporting frame ${frame.frame_idx}`}
                            fill
                            sizes="(max-width: 768px) 100vw, 360px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            No preview available
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-foreground">Frame {frame.frame_idx}</p>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {formatTimestamp(frame.timestamp_sec)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border/60 bg-background/55 px-2.5 py-1">
                            confidence {formatConfidence(frame.label_confidence)}
                          </span>
                          {frame.mask_quality != null ? (
                            <span className="rounded-full border border-border/60 bg-background/55 px-2.5 py-1">
                              mask quality {(frame.mask_quality * 100).toFixed(0)}%
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              {evidence.message ? (
                <p className="text-sm text-muted-foreground">{evidence.message}</p>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
              {focusedObject
                ? evidence?.message ?? "No supporting frames were stored for this object yet."
                : "Supporting frames stay secondary until an object is focused."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
