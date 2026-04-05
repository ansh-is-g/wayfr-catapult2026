"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Camera, Upload, CheckCircle2, AlertCircle, Loader2, MapPin, Smartphone } from "lucide-react"
import { HomeSceneViewer } from "@/components/scene/HomeSceneViewer"
import { PhoneCapture } from "@/components/setup/phone-capture"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const POLL_INTERVAL_MS = 3000

type HomeStatus = "processing" | "ready" | "failed"

type ObjectItem = {
  id: string
  label: string
  x: number
  y: number
  z: number
  confidence: number | null
  n_observations: number
}

type HomeInfo = {
  home_id: string
  name: string
  status: HomeStatus
  num_objects: number
  error?: string
}

export default function SetupPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const [mode, setMode] = useState<"idle" | "recording" | "recorded" | "uploading" | "polling" | "done" | "error" | "phone">("idle")
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [homeName, setHomeName] = useState("")
  const [homeInfo, setHomeInfo] = useState<HomeInfo | null>(null)
  const [objects, setObjects] = useState<ObjectItem[]>([])
  const [statusMsg, setStatusMsg] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (pollRef.current) clearInterval(pollRef.current)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const setPreviewUrl = useCallback((file: Blob) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }

    const nextUrl = URL.createObjectURL(file)
    previewUrlRef.current = nextUrl
    setPreviewSrc(nextUrl)
  }, [])

  const handlePhoneVideo = useCallback((blob: Blob, filename: string) => {
    setRecordedBlob(blob)
    setUploadFile(null)
    setPreviewUrl(blob)
    setHomeName(filename.replace(/\.\w+$/, ""))
    setMode("recorded")
  }, [setPreviewUrl])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 640, height: 480 },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      chunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" })
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" })
        setRecordedBlob(blob)
        setPreviewUrl(blob)
        stream.getTracks().forEach((t) => t.stop())
        setMode("recorded")
      }
      recorderRef.current = recorder
      recorder.start()
      setMode("recording")
    } catch (err: unknown) {
      setError(`Camera error: ${err instanceof Error ? err.message : "Unable to start recording"}`)
    }
  }, [setPreviewUrl])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    setRecordedBlob(null)
    setPreviewUrl(file)
    setMode("recorded")
  }

  const fetchObjects = useCallback(async (homeId: string) => {
    const res = await fetch(`${API_URL}/api/homes/${homeId}/objects`)
    const data: { objects?: ObjectItem[] } = await res.json()
    setObjects(data.objects ?? [])
  }, [])

  const startPolling = useCallback(
    (homeId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/homes/${homeId}`)
        const data: HomeInfo = await res.json()
        const status: HomeStatus = data.status
        setHomeInfo((prev) => prev ? { ...prev, status, num_objects: data.num_objects, error: data.error } : prev)

        if (status === "ready") {
          if (pollRef.current) clearInterval(pollRef.current)
          setStatusMsg("Done!")
          await fetchObjects(homeId)
          setMode("done")
        } else if (status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current)
          setError(data.error ?? "Setup failed")
          setMode("error")
        } else {
          setStatusMsg("Running 3D reconstruction on GPU…")
        }
      } catch {
        // ignore transient fetch errors
      }
    }, POLL_INTERVAL_MS)
    },
    [fetchObjects],
  )

  const submitVideo = useCallback(async () => {
    const blob = recordedBlob ?? uploadFile
    if (!blob) return
    setError(null)
    setMode("uploading")
    setStatusMsg("Uploading…")

    const form = new FormData()
    form.append("video", blob, uploadFile?.name ?? "walkthrough.webm")
    form.append("name", homeName || "My Home")

    try {
      const res = await fetch(`${API_URL}/api/homes`, { method: "POST", body: form })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(body.detail ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as HomeInfo
      setHomeInfo(data)
      setMode("polling")
      setStatusMsg("Building your 3D map…")
      startPolling(data.home_id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Setup upload failed")
      setMode("error")
    }
  }, [recordedBlob, uploadFile, homeName, startPolling])

  const reset = () => {
    setMode("idle")
    setRecordedBlob(null)
    setUploadFile(null)
    setPreviewSrc(null)
    setError(null)
    setHomeInfo(null)
    setObjects([])
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const isProcessing = mode === "uploading" || mode === "polling"

  return (
    <main className="mx-auto max-w-xl px-6 py-8 pb-20">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Set up your home</h1>
          <p className="mt-2 text-muted-foreground">
            Walk slowly through your space. wayfr builds a 3D map so you can navigate to any object by name.
          </p>
        </div>

        {/* ── Phone capture (QR code flow) ──────────────────────── */}
        {mode === "phone" && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <PhoneCapture
              onVideoReady={handlePhoneVideo}
              onCancel={() => setMode("idle")}
            />
          </div>
        )}

        {/* ── Step 1: capture ─────────────────────────────────────── */}
        {(mode === "idle" || mode === "recording" || mode === "recorded") && (
          <div className="space-y-6">

            {/* Live camera feed */}
            <video
              ref={videoRef}
              className={cn("w-full rounded-2xl border border-border bg-muted object-cover aspect-video", mode !== "recording" && "hidden")}
              muted
              playsInline
            />

            {/* Preview */}
            <video
              ref={previewRef}
              src={previewSrc ?? undefined}
              className={cn("w-full rounded-2xl border border-border bg-muted object-cover aspect-video", mode !== "recorded" && "hidden")}
              controls
            />

            {/* Idle: three action buttons */}
            {mode === "idle" && (
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={startRecording}
                  className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-left transition-colors hover:border-mango/50 hover:bg-mango-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mango-100 text-mango-700">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">Record</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Use your camera</p>
                  </div>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-left transition-colors hover:border-mango/50 hover:bg-mango-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mango-100 text-mango-700">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">Upload</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Choose a file</p>
                  </div>
                </button>

                <button
                  onClick={() => setMode("phone")}
                  className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-left transition-colors hover:border-mango/50 hover:bg-mango-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mango-100 text-mango-700">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">Phone</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Scan QR code</p>
                  </div>
                </button>

                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
              </div>
            )}

            {/* Recording: stop button */}
            {mode === "recording" && (
              <Button
                onClick={stopRecording}
                className="w-full bg-destructive hover:bg-destructive/90 text-white rounded-xl h-11"
              >
                Stop recording
              </Button>
            )}

            {/* Recorded: name + submit */}
            {mode === "recorded" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Name this map</label>
                  <input
                    className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-mango/50"
                    value={homeName}
                    onChange={(e) => setHomeName(e.target.value)}
                    placeholder="e.g. Living room"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={submitVideo}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-11 font-medium"
                  >
                    Build 3D map
                  </Button>
                  <Button
                    variant="outline"
                    onClick={reset}
                    className="rounded-xl h-11 border-border"
                  >
                    Re-record
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Processing ────────────────────────────────────────────── */}
        {isProcessing && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mango-100">
                <Loader2 className="h-7 w-7 animate-spin text-mango-700" />
              </div>
            </div>
            <div>
              <p className="font-semibold text-foreground">{statusMsg}</p>
              <p className="text-sm text-muted-foreground mt-1">Usually 2–5 minutes on GPU</p>
            </div>
            <div className="flex justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-mango-300 animate-pulse"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────── */}
        {mode === "error" && error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-destructive text-sm">Setup failed</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
            <Button variant="outline" onClick={reset} className="rounded-xl border-border h-9 text-sm">
              Try again
            </Button>
          </div>
        )}

        {/* ── Done ──────────────────────────────────────────────────── */}
        {mode === "done" && homeInfo && (
          <div className="space-y-6">
            {/* Success header */}
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{homeInfo.name || "Your home"}</p>
                <p className="text-sm text-muted-foreground">{objects.length} objects mapped</p>
              </div>
            </div>

            {/* 3D scene viewer */}
            <HomeSceneViewer
              homeId={homeInfo.home_id}
              glbUrl={`${API_URL}/api/homes/${homeInfo.home_id}/scene`}
              objects={objects}
              height={400}
              className="rounded-2xl border border-border overflow-hidden"
            />

            {/* Object grid */}
            {objects.length > 0 ? (
              <div className="space-y-2">
                {objects.map((obj) => (
                  <div
                    key={obj.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-mango-100">
                        <MapPin className="h-3.5 w-3.5 text-mango-700" />
                      </div>
                      <p className="text-sm font-medium text-foreground capitalize">{obj.label}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {obj.n_observations} frames
                      {obj.confidence != null && ` · ${Math.round(obj.confidence * 100)}%`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No objects detected. Try a slower walkthrough.</p>
            )}

            {objects.length > 0 && (
              <Link
                href={`/navigate?home=${homeInfo.home_id}`}
                className="flex w-full items-center justify-center rounded-xl bg-primary hover:bg-primary/90 px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors"
              >
                Navigate this home →
              </Link>
            )}
          </div>
        )}
    </main>
  )
}
