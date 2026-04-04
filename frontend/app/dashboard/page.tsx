"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Navbar } from "@/components/nav/Navbar"
import { World3DViewer, type Object3D } from "@/components/scene/World3DViewer"
import { DetectionFeed, type Detection as FeedDetection } from "@/components/dashboard/DetectionFeed"
import { NearbyHazards } from "@/components/dashboard/NearbyHazards"
import { SessionCard } from "@/components/dashboard/SessionCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, Mic, MicOff, Info, AlertTriangle, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { getSessionId, makeShareUrl } from "@/lib/session"

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000"

type Detection = {
  id: number
  ts: string
  label: string
  urgency: "high" | "medium" | "low"
  distance: string
  direction: string
}

const IDLE_SCENE: Object3D[] = [{ label: "waiting\u2026", x: 0, y: 0, z: 3, urgency: "low", confidence: 1 }]

function nowTs() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export default function DashboardPage() {
  const wsRef = useRef<WebSocket | null>(null)
  const audioQueueRef = useRef<string[]>([])
  const playingRef = useRef(false)

  const [scene, setScene] = useState<Object3D[]>(IDLE_SCENE)
  const [detections, setDetections] = useState<Detection[]>([])
  const [hazards, setHazards] = useState<any[]>([])
  const [narration, setNarration] = useState<string | null>(null)
  const [frameCount, setFrameCount] = useState(0)
  const [sessionSecs, setSessionSecs] = useState(0)
  const [sessionId, setSessionId] = useState("")
  const [captureUrl, setCaptureUrl] = useState("")
  const [copied, setCopied] = useState(false)
  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected")
  const [liveMode, setLiveMode] = useState(false)
  const [selectedObj, setSelectedObj] = useState<number | null>(null)
  const [availableSessions, setAvailableSessions] = useState<string[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const reconnectTimeoutRef = useRef<any | null>(null)
  const reconnectAttemptsRef = useRef(0)

  useEffect(() => {
    const id = getSessionId()
    setSessionId(id)
    setCaptureUrl(makeShareUrl(id))
    fetchActiveSessions()

    // Check for scan results in localStorage
    const scanData = localStorage.getItem(`wayfr_scan_${id}`)
    if (scanData) {
      try {
        const parsed = JSON.parse(scanData)
        if (parsed.objects?.length) {
          setScene(parsed.objects)
          setLiveMode(true)
          setFrameCount(parsed.stats?.total_frames ?? 0)
        }
      } catch {}
    }
  }, [])

  const fetchActiveSessions = async () => {
    try {
      const res = await fetch(`${WS_URL.replace("ws", "http")}/sessions/active`)
      const data = await res.json()
      setAvailableSessions(data.sessions || [])
    } catch {}
  }

  const fetchNearbyHazards = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`${WS_URL.replace("ws", "http")}/hazards/nearby?lat=${lat}&lng=${lng}`)
      const data = await res.json()
      setHazards(data.hazards || [])
    } catch {}
  }

  // Session timer
  useEffect(() => {
    const t = setInterval(() => setSessionSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // ── Notification sounds ──────────────────────────────────────────────────
  const playNotification = useCallback((urgency: string) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = urgency === "high" ? "sawtooth" : "sine"
      osc.frequency.setValueAtTime(urgency === "high" ? 440 : 880, ctx.currentTime)
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.2)
    } catch {}
  }, [])

  // ── Audio queue ───────────────────────────────────────────────────────────
  const drainAudioQueue = useCallback(() => {
    if (playingRef.current || audioQueueRef.current.length === 0) return
    playingRef.current = true
    const b64 = audioQueueRef.current.shift()!
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: "audio/mp3" })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = () => {
      URL.revokeObjectURL(url)
      playingRef.current = false
      drainAudioQueue()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      playingRef.current = false
      drainAudioQueue()
    }
    audio.play().catch(() => {
      playingRef.current = false
      drainAudioQueue()
    })
  }, [])

  // ── WebSocket connection ──────────────────────────────────────────────────
  const connectWs = useCallback(() => {
    if (!sessionId) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setWsStatus("connecting")
    const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      setWsStatus("connected")
      reconnectAttemptsRef.current = 0
    }

    ws.onclose = () => {
      setWsStatus("disconnected")
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
      reconnectAttemptsRef.current++
      reconnectTimeoutRef.current = setTimeout(connectWs, delay)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)

        if (msg.type === "audio") {
          setNarration(msg.text)
          setLiveMode(true)
          setFrameCount((n: number) => n + 1)
          if (msg.data) {
            audioQueueRef.current.push(msg.data)
            drainAudioQueue()
          }
        }

        if (msg.type === "detections") {
          const objs: Object3D[] = (msg.objects || []).map((o: any) => ({
            label: o.label,
            x: o.x || 0,
            y: 0,
            z: o.z || 1.5,
            urgency: o.urgency,
            confidence: o.confidence,
          }))
          if (objs.length > 0) {
            setScene(objs)
            setLiveMode(true)
            setFrameCount((n: number) => n + 1)
            objs.forEach((obj: Object3D) => {
              if (obj.urgency === "high") playNotification("high")
              setDetections((prev: Detection[]) =>
                [
                  {
                    id: Date.now() + Math.random(),
                    ts: nowTs(),
                    label: obj.label,
                    urgency: obj.urgency,
                    distance: `${Math.sqrt(obj.x ** 2 + obj.z ** 2).toFixed(1)}m`,
                    direction: obj.x < -0.5 ? "left" : obj.x > 0.5 ? "right" : "ahead",
                  },
                  ...prev,
                ].slice(0, 50),
              )
            })
          }
        }

        if (msg.type === "hazard_alert") {
          setLiveMode(true)
          playNotification("high")
          const h = msg.hazard
          setDetections((prev: Detection[]) => [
            {
              id: Date.now(),
              ts: nowTs(),
              label: `\u26A0 ${h.type}`,
              urgency: "high",
              distance: `${h.distance_m}m`,
              direction: h.direction,
            },
            ...prev,
          ])
        }

        if (msg.gps) {
          setGps(msg.gps)
          fetchNearbyHazards(msg.gps.lat, msg.gps.lng)
        }
      } catch {}
    }
  }, [sessionId, drainAudioQueue, playNotification])

  useEffect(() => {
    connectWs()
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      wsRef.current?.close()
    }
  }, [connectWs])

  // ── Voice messaging ───────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" })
        const reader = new FileReader()
        reader.readAsDataURL(blob)
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1]
          wsRef.current?.send(JSON.stringify({ type: "caregiver_voice", data: base64 }))
        }
        stream.getTracks().forEach((t) => t.stop())
      }

      recorder.start()
      setIsRecording(true)
    } catch {}
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  const exportLog = () => {
    const data = JSON.stringify(detections, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `wayfr-session-${sessionId}-${Date.now()}.json`
    a.click()
  }

  const sessionTime = `${String(Math.floor(sessionSecs / 60)).padStart(2, "0")}:${String(sessionSecs % 60).padStart(2, "0")}`

  const copyCapture = useCallback(() => {
    navigator.clipboard.writeText(captureUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [captureUrl])

  const wsColor = wsStatus === "connected" ? "bg-green-400" : wsStatus === "connecting" ? "bg-mango animate-pulse" : "bg-muted-foreground"

  const selectedObjectData = selectedObj !== null ? scene[selectedObj] : null

  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 pt-20 pb-12">
        {/* Top Header & Session Picker */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div className="flex-1 min-w-[300px]">
            <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">Active Surveillance</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Caregiver Dashboard</h1>
            <div className="mt-4 flex items-center gap-4">
              <Select value={sessionId} onValueChange={(val) => val && setSessionId(val)}>
                <SelectTrigger className="w-64 border-mango/20 bg-card font-mono text-xs">
                  <SelectValue placeholder="Switch session..." />
                </SelectTrigger>
                <SelectContent>
                  {availableSessions.map((s) => (
                    <SelectItem key={s} value={s} className="font-mono text-xs">
                      {s} {s === getSessionId() && "(Current)"}
                    </SelectItem>
                  ))}
                  {availableSessions.length === 0 && (
                    <SelectItem value={sessionId} disabled className="font-mono text-xs italic">
                      No other active sessions
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" onClick={fetchActiveSessions} className="h-9 w-9 text-muted-foreground hover:text-mango">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Connection</span>
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className={cn("h-2 w-2 rounded-full", wsColor)} />
                {wsStatus} &middot; {sessionTime}
              </div>
            </div>
            <div className="h-10 w-[1px] bg-border mx-2 hidden sm:block" />
            <Button size="sm" onClick={exportLog} className="bg-card border border-border text-foreground hover:bg-muted font-mono text-[10px] h-9">
              <Download className="mr-2 h-3.5 w-3.5" />
              EXPORT LOG
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Main Content Area */}
          <div className="lg:col-span-8 space-y-6">
            <SessionCard
              name={`Session ${sessionId}`}
              status={wsStatus === "connected" ? "active" : "paused"}
              speedMph={frameCount > 0 ? 2.4 : 0}
              lastSeen={nowTs()}
              nearbyHazards={hazards.length}
              lastDetection={detections[0]?.label || "Initializing..."}
            />

            <div className="rounded-xl border border-mango/15 bg-card overflow-hidden">
              <div className="border-b border-border px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="h-5 rounded-sm border-mango/20 bg-mango/5 text-mango text-[10px] font-bold px-1.5 uppercase tracking-tighter">LIVE 3D</Badge>
                  <span className="text-xs font-semibold">Environment Reconstruction</span>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono border-border text-muted-foreground">
                   {scene.filter((o: Object3D) => o.label !== "waiting\u2026").length} objects in viewport
                </Badge>
              </div>
              <div className="p-2 relative group">
                <World3DViewer objects={scene} autoOrbit onObjectClick={setSelectedObj} />
                
                {/* Object Detail Panel Overlay */}
                {selectedObjectData && (
                  <Card className="absolute right-6 top-6 w-56 border-mango/30 bg-background/90 backdrop-blur shadow-2xl p-4 animate-in fade-in slide-in-from-right-4">
                    <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
                       <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Object Details</h4>
                       <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setSelectedObj(null)}>&times;</Button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-tighter">Classification</p>
                        <p className="text-sm font-bold text-foreground">{selectedObjectData.label}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-tighter">Distance</p>
                          <p className="text-xs font-mono font-bold text-mango">{Math.sqrt(selectedObjectData.x**2 + selectedObjectData.z**2).toFixed(2)}m</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-tighter">Urgency</p>
                          <Badge variant="outline" className={cn("text-[9px] h-4 uppercase px-1 font-bold", 
                            selectedObjectData.urgency === "high" ? "border-red-500/30 text-red-400 bg-red-400/5" : "border-mango/20 text-mango")}>
                            {selectedObjectData.urgency}
                          </Badge>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-border">
                         <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono italic">
                           <Info className="h-3 w-3" />
                           Tap mapping to highlight
                         </div>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <NearbyHazards items={hazards.map((h: any) => ({
                 id: h.id,
                 type: h.label,
                 severity: h.severity,
                 distanceM: h.distance_m,
                 direction: h.direction,
                 description: h.description,
                 verifiedCount: h.verified_count
               }))} />
               
               <Card className="border-border bg-card p-5 flex flex-col justify-between">
                 <div>
                   <h3 className="text-sm font-semibold">Communicate with user</h3>
                   <p className="mt-1 text-xs text-muted-foreground">Press and hold to send a direct voice message to the user's mobile device.</p>
                 </div>
                 
                 <div className="mt-8 flex flex-col items-center gap-4">
                    <Button 
                      size="lg"
                      className={cn(
                        "h-20 w-20 rounded-full transition-all duration-300",
                        isRecording ? "bg-red-500 hover:bg-red-600 scale-110 shadow-[0_0_20px_rgba(239,68,68,0.5)]" : "bg-mango hover:bg-mango/90"
                      )}
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onMouseLeave={isRecording ? stopRecording : undefined}
                    >
                      {isRecording ? <MicOff className="h-8 w-8 text-white" animate-pulse /> : <Mic className="h-8 w-8 text-white" />}
                    </Button>
                    <span className={cn("text-[10px] font-mono uppercase tracking-widest", isRecording ? "text-red-400 animate-pulse" : "text-muted-foreground")}>
                      {isRecording ? "Transmitting audio..." : "Hold to talk"}
                    </span>
                 </div>
                 
                 <div className="mt-6 rounded-lg border border-border bg-background/50 p-3 italic text-[11px] text-muted-foreground">
                   &ldquo;Watch out for the construction barrier on your left.&rdquo;
                 </div>
               </Card>
            </div>
          </div>

          {/* Sidebars */}
          <div className="lg:col-span-4 space-y-6">
            <DetectionFeed items={detections.map((d: Detection) => ({
              id: d.id.toString(),
              timestamp: d.ts,
              type: d.label.includes("Hazard") ? "hazard_alert" : "obstacle",
              content: `${d.label} at ${d.distance} ${d.direction}`,
              urgency: d.urgency === "high" ? "urgent" : d.urgency === "medium" ? "normal" : "low"
            }))} />

            <Card className="border-border bg-card overflow-hidden">
               <div className="border-b border-border px-4 py-3 bg-muted/30">
                  <h4 className="text-xs font-bold uppercase tracking-widest">Real-time Narration</h4>
               </div>
               <div className="p-4 space-y-4">
                  <div className="min-h-[60px] text-sm leading-relaxed font-medium">
                    {narration ? (
                      <span className="text-foreground italic">&ldquo;{narration}&rdquo;</span>
                    ) : (
                      <span className="text-muted-foreground italic">Waiting for AI narrator...</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[9px] font-mono border-mango/20 bg-mango/5 text-mango">LLAMA-4-CAREGIVER</Badge>
                    <Badge variant="outline" className="text-[9px] font-mono border-border bg-background/50">CARTESIA-ELAINE-V2</Badge>
                  </div>
               </div>
            </Card>

            <Card className="border-border bg-card p-4">
              <div className="flex items-center gap-2 text-destructive mb-3">
                 <AlertTriangle className="h-4 w-4" />
                 <h4 className="text-[10px] font-bold uppercase tracking-widest">System Alerts</h4>
              </div>
              <div className="space-y-2">
                 {wsStatus === "disconnected" && (
                   <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1.5 font-medium">
                     CRITICAL: Survelliance connection lost. Reconnecting...
                   </div>
                 )}
                 {hazards.length > 0 && (
                   <div className="text-[11px] text-orange-500 bg-orange-500/10 border border-orange-500/20 rounded px-2 py-1.5 font-medium">
                     WARNING: {hazards.length} hazards verified nearby.
                   </div>
                 )}
                 {wsStatus === "connected" && hazards.length === 0 && (
                   <div className="text-[11px] text-green-500 bg-green-500/10 border border-orange-500/20 rounded px-2 py-1.5 font-medium">
                     System active. Environment safe.
                   </div>
                 )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}
