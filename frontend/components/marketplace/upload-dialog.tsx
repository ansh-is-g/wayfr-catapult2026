"use client"

import { useCallback, useRef, useState } from "react"
import { CheckCircle, Upload, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface UploadDialogProps {
  contractId: string
  contractTitle: string
  priceCents: number
  feePct: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded: () => void
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export function UploadDialog({
  contractId,
  contractTitle,
  priceCents,
  feePct,
  open,
  onOpenChange,
  onUploaded,
}: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{
    payout_cents: number
    slots_remaining: number
  } | null>(null)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const estimatedPayout = Math.round(priceCents * (1 - feePct / 100))

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type.startsWith("video/")) {
      setFile(dropped)
      setError("")
    } else {
      setError("Please drop a video file")
    }
  }, [])

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError("")
    setProgress(10)

    const formData = new FormData()
    formData.append("video", file)

    try {
      setProgress(30)
      const res = await fetch(
        `/api/marketplace/contracts/${contractId}/submit`,
        { method: "POST", body: formData }
      )
      setProgress(90)

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Upload failed")
        return
      }

      setProgress(100)
      setResult(data)
      onUploaded()
    } catch {
      setError("Network error — please try again")
    } finally {
      setUploading(false)
    }
  }

  function handleClose(v: boolean) {
    if (!uploading) {
      onOpenChange(v)
      if (!v) {
        setFile(null)
        setResult(null)
        setError("")
        setProgress(0)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {result ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15">
              <CheckCircle className="size-7 text-emerald-500" />
            </div>
            <div className="text-center">
              <h3 className="mb-1 text-base font-semibold text-foreground">
                Submission confirmed
              </h3>
              <p className="text-sm text-muted-foreground">
                You earned{" "}
                <span className="font-semibold text-emerald-500">
                  {formatCents(result.payout_cents)}
                </span>{" "}
                for this recording.
              </p>
              {result.slots_remaining > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.slots_remaining} slot
                  {result.slots_remaining !== 1 ? "s" : ""} remaining on this
                  contract
                </p>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              className="mt-2 rounded-xl"
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Submit Recording</DialogTitle>
              <DialogDescription>
                Upload a video for &ldquo;{contractTitle}&rdquo;. You&apos;ll
                earn{" "}
                <span className="font-medium text-foreground">
                  {formatCents(estimatedPayout)}
                </span>{" "}
                on confirmation.
              </DialogDescription>
            </DialogHeader>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 transition-colors",
                file
                  ? "border-mango-500/50 bg-mango-500/5"
                  : "border-border/50 hover:border-border hover:bg-muted/30"
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setFile(f)
                    setError("")
                  }
                }}
              />
              {file ? (
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-mango-500/15 text-mango-500">
                    <Upload className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setFile(null)
                    }}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="size-6 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">
                      Drop a video here or click to browse
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      MP4, WebM, MOV up to 500 MB
                    </p>
                  </div>
                </>
              )}
            </div>

            {uploading && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-mango-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={uploading}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="rounded-xl bg-mango-500 text-white hover:bg-mango-500/90"
              >
                {uploading ? "Uploading..." : "Submit Recording"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
