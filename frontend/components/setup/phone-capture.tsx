"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Loader2, Smartphone, CheckCircle2, X, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

type PhoneCaptureStatus = "creating" | "waiting" | "downloading" | "done" | "error"

const POLL_INTERVAL = 2500

interface PhoneCaptureProps {
  onVideoReady: (blob: Blob, filename: string) => void
  onCancel: () => void
}

export function PhoneCapture({ onVideoReady, onCancel }: PhoneCaptureProps) {
  const [status, setStatus] = useState<PhoneCaptureStatus>("creating")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [captureUrl, setCaptureUrl] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    async function createSession() {
      try {
        const res = await fetch("/api/capture", { method: "POST" })
        if (!res.ok) throw new Error("Failed to create capture session")
        const data = await res.json()
        const url = `${window.location.origin}/capture/${data.id}`
        setSessionId(data.id)
        setCaptureUrl(url)
        setStatus("waiting")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create session")
        setStatus("error")
      }
    }
    createSession()
  }, [])

  useEffect(() => {
    if (status !== "waiting" || !sessionId) return

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/capture/${sessionId}`)
        if (!res.ok) return
        const data = await res.json()

        if (data.status === "uploaded") {
          if (pollRef.current) clearInterval(pollRef.current)
          setStatus("downloading")
          await downloadVideo(sessionId)
        } else if (data.status === "expired") {
          if (pollRef.current) clearInterval(pollRef.current)
          setError("Session expired. Please try again.")
          setStatus("error")
        }
      } catch {
        // transient error, keep polling
      }
    }, POLL_INTERVAL)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [status, sessionId])

  const downloadVideo = useCallback(
    async (sid: string) => {
      try {
        const res = await fetch(`/api/capture/${sid}/video`)
        if (!res.ok) throw new Error("Failed to download video")
        const blob = await res.blob()
        const ext = res.headers.get("Content-Disposition")?.match(/\.(\w+)/)?.[1] || "mp4"
        setStatus("done")
        onVideoReady(blob, `phone-recording.${ext}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Download failed")
        setStatus("error")
      }
    },
    [onVideoReady]
  )

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(captureUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [captureUrl])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Record with your phone</h2>
        <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {status === "creating" && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Setting up...</p>
        </div>
      )}

      {status === "waiting" && captureUrl && (
        <div className="space-y-5">
          {/* QR Code */}
          <div className="flex justify-center">
            <div className="rounded-2xl border border-border bg-white p-4">
              <QRCodeSVG value={captureUrl} size={200} level="M" />
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with your phone camera
            </p>
            <ol className="space-y-1.5 text-xs text-muted-foreground">
              <li>1. Point your phone camera at the QR code</li>
              <li>2. Tap the link that appears</li>
              <li>3. Record a walkthrough of your space</li>
              <li>4. The video will appear here automatically</li>
            </ol>
          </div>

          {/* Copy link fallback */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <input
              readOnly
              value={captureUrl}
              className="flex-1 bg-transparent text-xs text-muted-foreground outline-none truncate"
            />
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2 shrink-0">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {/* Waiting indicator */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mango-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-mango-400" />
            </div>
            Waiting for phone...
          </div>
        </div>
      )}

      {status === "downloading" && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-mango-500" />
          <p className="text-sm font-medium text-foreground">Video received! Downloading...</p>
        </div>
      )}

      {status === "done" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          </div>
          <p className="text-sm font-semibold text-foreground">Video received from phone</p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <Smartphone className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Connection failed</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
          <Button variant="outline" onClick={onCancel} className="w-full rounded-xl h-10">
            Go back
          </Button>
        </div>
      )}
    </div>
  )
}
