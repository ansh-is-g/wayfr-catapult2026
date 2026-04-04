"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FolderClock,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react"

import {
  type CameraPreset,
  type ObjectItem,
  type SceneColorMode,
  type SceneDebugOptions,
  type SceneDisplayMode,
  HomeSceneViewer,
} from "@/components/scene/HomeSceneViewer"
import { SceneObjectBrowser } from "@/components/scene/SceneObjectBrowser"
import {
  type ObjectEvidencePayload,
  SceneObjectInspector,
} from "@/components/scene/SceneObjectInspector"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

type HomeStatus = "processing" | "ready" | "failed"

type HomeSummary = {
  home_id: string
  name: string
  status: HomeStatus
  num_objects: number
  created_at?: unknown
}

type HomeDetail = HomeSummary & {
  updated_at?: unknown
  error?: string | null
}

type HomesResponse = {
  homes?: HomeSummary[]
}

type HomeResponse = {
  home_id: string
  name: string
  status: HomeStatus
  num_objects: number
  error?: string | null
  created_at?: unknown
  updated_at?: unknown
}

type ObjectsResponse = {
  objects?: Array<{
    id: string
    label: string
    x: number
    y: number
    z: number
    track_id?: number | null
    bbox_min?: number[] | null
    bbox_max?: number[] | null
    confidence?: number | null
    n_observations?: number
  }>
}

function parseTimestamp(value: unknown) {
  if (typeof value === "number") {
    return new Date(value < 1e12 ? value * 1000 : value)
  }

  if (typeof value === "string") {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    }

    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  return null
}

function formatDateTime(value: unknown) {
  const parsed = parseTimestamp(value)
  if (!parsed) return "Unknown"

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatRelative(value: unknown) {
  const parsed = parseTimestamp(value)
  if (!parsed) return "Unknown"

  const diffMs = parsed.getTime() - Date.now()
  const diffMins = Math.round(diffMs / 60000)

  if (Math.abs(diffMins) < 60) {
    return `${Math.abs(diffMins)} min${Math.abs(diffMins) === 1 ? "" : "s"} ${diffMins <= 0 ? "ago" : "from now"}`
  }

  const diffHours = Math.round(diffMins / 60)
  if (Math.abs(diffHours) < 24) {
    return `${Math.abs(diffHours)} hr${Math.abs(diffHours) === 1 ? "" : "s"} ${diffHours <= 0 ? "ago" : "from now"}`
  }

  const diffDays = Math.round(diffHours / 24)
  return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ${diffDays <= 0 ? "ago" : "from now"}`
}

function getStatusLabel(status: HomeStatus) {
  if (status === "ready") return "Ready"
  if (status === "processing") return "Processing"
  return "Failed"
}

function getStatusClasses(status: HomeStatus) {
  if (status === "ready") return "border-green-500/20 bg-green-500/10 text-green-500"
  if (status === "processing") return "border-mango/20 bg-mango/10 text-mango"
  return "border-red-500/20 bg-red-500/10 text-red-500"
}

function EmptyPanel() {
  return (
    <div className="mt-8 rounded-[28px] border border-border/60 bg-card/55 px-6 py-14 text-center backdrop-blur-xl">
      <FolderClock className="mx-auto h-10 w-10 text-mango" />
      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">No saved scenes yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Start in setup, upload a walkthrough, and the completed GLB will appear here.
      </p>
      <Link
        href="/setup"
        className="mt-6 inline-flex items-center justify-center rounded-full bg-mango px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-mango/90"
      >
        Open setup
        <ArrowRight className="ml-2 h-4 w-4" />
      </Link>
    </div>
  )
}

function formatConfidence(confidence: number | null) {
  if (confidence == null) return "n/a"
  return `${Math.round(confidence * 100)}%`
}

const COLOR_MODE_OPTIONS: Array<{ key: SceneColorMode; label: string }> = [
  { key: "natural", label: "Natural" },
  { key: "class", label: "By class" },
  { key: "instance", label: "By instance" },
  { key: "confidence", label: "By confidence" },
  { key: "support", label: "By support" },
]

const DISPLAY_MODE_OPTIONS: Array<{ key: SceneDisplayMode; label: string }> = [
  { key: "normal", label: "Normal" },
  { key: "ghost", label: "Ghost" },
  { key: "isolate", label: "Isolate" },
]

export default function DashboardPage() {
  const [homes, setHomes] = useState<HomeSummary[]>([])
  const [requestedHomeId, setRequestedHomeId] = useState("")
  const [selectedHomeId, setSelectedHomeId] = useState("")
  const [selectedHome, setSelectedHome] = useState<HomeDetail | null>(null)
  const [objects, setObjects] = useState<ObjectItem[]>([])
  const [focusedObjectId, setFocusedObjectId] = useState<string | null>(null)
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([])
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null)
  const [historyQuery, setHistoryQuery] = useState("")
  const [objectQuery, setObjectQuery] = useState("")
  const [hiddenLabels, setHiddenLabels] = useState<string[]>([])
  const [hiddenObjectIds, setHiddenObjectIds] = useState<string[]>([])
  const [pinnedObjectIds, setPinnedObjectIds] = useState<string[]>([])
  const [displayMode, setDisplayMode] = useState<SceneDisplayMode>("normal")
  const [colorMode, setColorMode] = useState<SceneColorMode>("natural")
  const [viewerDebug, setViewerDebug] = useState<SceneDebugOptions>({
    showBBoxes: false,
    showCentroids: false,
    showApproxRegion: false,
    showExactPoints: false,
  })
  const [cameraCommandNonce, setCameraCommandNonce] = useState(0)
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("overview")
  const [homesLoading, setHomesLoading] = useState(true)
  const [homeLoading, setHomeLoading] = useState(false)
  const [homesError, setHomesError] = useState<string | null>(null)
  const [homeError, setHomeError] = useState<string | null>(null)
  const [evidence, setEvidence] = useState<ObjectEvidencePayload | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [activeEvidenceFrame, setActiveEvidenceFrame] = useState<number | null>(null)

  const loadHomes = useCallback(async (signal?: AbortSignal) => {
    setHomesError(null)
    setHomesLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/homes`, { signal, cache: "no-store" })
      if (!response.ok) {
        throw new Error(`Failed to load homes (${response.status})`)
      }
      const data: HomesResponse = await response.json()
      setHomes(data.homes ?? [])
    } catch (error: unknown) {
      if (signal?.aborted) return
      setHomesError(error instanceof Error ? error.message : "Failed to load homes")
    } finally {
      if (!signal?.aborted) setHomesLoading(false)
    }
  }, [])

  const loadSelectedHome = useCallback(async (homeId: string, signal?: AbortSignal) => {
    if (!homeId) {
      setSelectedHome(null)
      setObjects([])
      return
    }

    setHomeLoading(true)
    setHomeError(null)

    try {
      const [homeResponse, objectsResponse] = await Promise.all([
        fetch(`${API_URL}/api/homes/${homeId}`, { signal, cache: "no-store" }),
        fetch(`${API_URL}/api/homes/${homeId}/objects`, { signal, cache: "no-store" }),
      ])

      if (!homeResponse.ok) throw new Error(`Failed to load home (${homeResponse.status})`)
      if (!objectsResponse.ok) throw new Error(`Failed to load objects (${objectsResponse.status})`)

      const homeData: HomeResponse = await homeResponse.json()
      const objectData: ObjectsResponse = await objectsResponse.json()

      setSelectedHome({
        home_id: homeData.home_id,
        name: homeData.name,
        status: homeData.status,
        num_objects: homeData.num_objects,
        error: homeData.error ?? null,
        created_at: homeData.created_at,
        updated_at: homeData.updated_at,
      })
      setObjects(
        (objectData.objects ?? []).map((object) => ({
          id: object.id,
          label: object.label,
          classLabel: object.label,
          x: object.x,
          y: object.y,
          z: object.z,
          track_id: object.track_id ?? null,
          bbox_min: object.bbox_min ?? null,
          bbox_max: object.bbox_max ?? null,
          confidence: object.confidence ?? null,
          n_observations: object.n_observations ?? 1,
        }))
      )
    } catch (error: unknown) {
      if (signal?.aborted) return
      setHomeError(error instanceof Error ? error.message : "Failed to load selected home")
    } finally {
      if (!signal?.aborted) setHomeLoading(false)
    }
  }, [])

  useEffect(() => {
    const syncRequestedHome = () => {
      const params = new URLSearchParams(window.location.search)
      setRequestedHomeId(params.get("home") ?? "")
    }

    syncRequestedHome()
    window.addEventListener("popstate", syncRequestedHome)
    return () => window.removeEventListener("popstate", syncRequestedHome)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadHomes(controller.signal)
    return () => controller.abort()
  }, [loadHomes])

  useEffect(() => {
    if (homes.length === 0) {
      setSelectedHomeId("")
      return
    }

    if (requestedHomeId && homes.some((home) => home.home_id === requestedHomeId)) {
      setSelectedHomeId((current) => (current === requestedHomeId ? current : requestedHomeId))
      return
    }

    setSelectedHomeId((current) => {
      if (current && homes.some((home) => home.home_id === current)) return current
      return homes[0]?.home_id ?? ""
    })
  }, [homes, requestedHomeId])

  useEffect(() => {
    setObjectQuery("")
    setHiddenLabels([])
    setHiddenObjectIds([])
    setPinnedObjectIds([])
    setFocusedObjectId(null)
    setSelectedObjectIds([])
    setHoveredObjectId(null)
    setDisplayMode("normal")
    setColorMode("natural")
    setViewerDebug({
      showBBoxes: false,
      showCentroids: false,
      showApproxRegion: false,
      showExactPoints: false,
    })
    setEvidence(null)
    setActiveEvidenceFrame(null)
  }, [selectedHomeId])

  useEffect(() => {
    const controller = new AbortController()
    void loadSelectedHome(selectedHomeId, controller.signal)
    return () => controller.abort()
  }, [selectedHomeId, loadSelectedHome])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocusedObjectId(null)
        setSelectedObjectIds([])
        setHoveredObjectId(null)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const sortedHomes = useMemo(() => {
    return [...homes].sort((left, right) => {
      const leftTime = parseTimestamp(left.created_at)?.getTime() ?? 0
      const rightTime = parseTimestamp(right.created_at)?.getTime() ?? 0
      return rightTime - leftTime
    })
  }, [homes])

  const filteredHomes = useMemo(() => {
    const query = historyQuery.trim().toLowerCase()
    if (!query) return sortedHomes
    return sortedHomes.filter((home) => {
      return (
        home.name.toLowerCase().includes(query) ||
        home.home_id.toLowerCase().includes(query) ||
        home.status.toLowerCase().includes(query)
      )
    })
  }, [historyQuery, sortedHomes])

  const activeHome = selectedHome ?? sortedHomes.find((home) => home.home_id === selectedHomeId) ?? null
  const activeHomeUpdatedAt = selectedHome?.updated_at ?? activeHome?.created_at
  const sceneUrl = activeHome ? `${API_URL}/api/homes/${activeHome.home_id}/scene` : ""
  const sceneVersion = activeHomeUpdatedAt ? String(activeHomeUpdatedAt) : undefined

  const visibleObjects = useMemo(() => {
    const query = objectQuery.trim().toLowerCase()
    return objects.filter((object) => {
      const label = object.label.trim().toLowerCase()
      if (hiddenLabels.includes(label)) return false
      if (hiddenObjectIds.includes(object.id)) return false
      if (query && !label.includes(query)) return false
      return true
    })
  }, [hiddenLabels, hiddenObjectIds, objectQuery, objects])

  const objectMap = useMemo(() => new Map(visibleObjects.map((object) => [object.id, object])), [visibleObjects])

  const focusedObject = useMemo(
    () => (focusedObjectId ? objectMap.get(focusedObjectId) ?? null : null),
    [focusedObjectId, objectMap]
  )

  const selectedObjects = useMemo(
    () => selectedObjectIds.map((id) => objectMap.get(id)).filter((object): object is ObjectItem => object != null),
    [objectMap, selectedObjectIds]
  )

  useEffect(() => {
    setSelectedObjectIds((current) => current.filter((id) => objectMap.has(id)))
    setFocusedObjectId((current) => (current && objectMap.has(current) ? current : null))
    setHoveredObjectId((current) => (current && objectMap.has(current) ? current : null))
  }, [objectMap])

  useEffect(() => {
    if (!activeHome?.home_id || !focusedObject?.track_id) {
      setEvidence(null)
      setActiveEvidenceFrame(null)
      return
    }

    let cancelled = false
    setEvidenceLoading(true)

    void fetch(`${API_URL}/api/homes/${activeHome.home_id}/object-evidence/${focusedObject.track_id}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load object evidence (${response.status})`)
        const payload: ObjectEvidencePayload = await response.json()
        if (!cancelled) {
          setEvidence(payload)
          setActiveEvidenceFrame(payload.frames[0]?.sampled_frame_idx ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEvidence({
            track_id: focusedObject.track_id ?? -1,
            frames: [],
            message: "Supporting frames are not available for this object yet.",
          })
          setActiveEvidenceFrame(null)
        }
      })
      .finally(() => {
        if (!cancelled) setEvidenceLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeHome?.home_id, focusedObject?.id, focusedObject?.track_id])

  const createCameraCommand = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset)
    setCameraCommandNonce((current) => current + 1)
  }, [])

  useEffect(() => {
    if (focusedObjectId) {
      createCameraCommand("focus")
    }
  }, [createCameraCommand, focusedObjectId])

  const selectHome = useCallback((homeId: string) => {
    setSelectedHomeId(homeId)
    setRequestedHomeId(homeId)
    window.history.replaceState({}, "", `/dashboard?home=${homeId}`)
  }, [])

  const refreshAll = useCallback(() => {
    void loadHomes()
    if (selectedHomeId) {
      void loadSelectedHome(selectedHomeId)
    }
  }, [loadHomes, loadSelectedHome, selectedHomeId])

  const downloadObjects = useCallback(() => {
    if (!activeHome) return

    const payload = {
      home_id: activeHome.home_id,
      name: activeHome.name,
      status: activeHome.status,
      objects,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${activeHome.home_id}-objects.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [activeHome, objects])

  const activateObject = useCallback((objectId: string, additive = false) => {
    setSelectedObjectIds((current) => {
      if (additive) {
        if (current.includes(objectId)) {
          const next = current.filter((id) => id !== objectId)
          setFocusedObjectId((focused) => (focused === objectId ? next[0] ?? null : focused))
          return next
        }
        return [...current, objectId]
      }
      return [objectId]
    })
    setFocusedObjectId(objectId)
  }, [])

  const selectLabelGroup = useCallback(
    (label: string) => {
      const ids = visibleObjects.filter((object) => object.label.trim().toLowerCase() === label).map((object) => object.id)
      setSelectedObjectIds(ids)
      setFocusedObjectId(ids[0] ?? null)
    },
    [visibleObjects]
  )

  const togglePin = useCallback((objectId: string) => {
    setPinnedObjectIds((current) => (current.includes(objectId) ? current.filter((id) => id !== objectId) : [...current, objectId]))
  }, [])

  const hideObject = useCallback((objectId: string) => {
    setHiddenObjectIds((current) => (current.includes(objectId) ? current : [...current, objectId]))
  }, [])

  const toggleLabelVisibility = useCallback((label: string) => {
    const normalized = label.trim().toLowerCase()
    setHiddenLabels((current) =>
      current.includes(normalized) ? current.filter((item) => item !== normalized) : [...current, normalized]
    )
  }, [])

  const toggleViewerDebug = useCallback((key: keyof SceneDebugOptions) => {
    setViewerDebug((current) => ({ ...current, [key]: !current[key] }))
  }, [])

  const resetVisibility = useCallback(() => {
    setHiddenLabels([])
    setHiddenObjectIds([])
  }, [])

  const toggleIsolate = useCallback(() => {
    setDisplayMode((current) => (current === "isolate" ? "normal" : "isolate"))
  }, [])

  const navigateRelative = useCallback(
    (delta: number, scope: "all" | "class") => {
      if (visibleObjects.length === 0) return

      const candidates =
        scope === "class" && focusedObject
          ? visibleObjects.filter((object) => object.label === focusedObject.label)
          : visibleObjects

      if (candidates.length === 0) return
      const currentIndex = focusedObjectId ? candidates.findIndex((object) => object.id === focusedObjectId) : -1
      const nextIndex = currentIndex >= 0 ? (currentIndex + delta + candidates.length) % candidates.length : 0
      const nextObject = candidates[nextIndex]
      if (nextObject) activateObject(nextObject.id)
    },
    [activateObject, focusedObject, focusedObjectId, visibleObjects]
  )

  const uniqueLabelCount = useMemo(
    () => Array.from(new Set(objects.map((object) => object.label.trim().toLowerCase()).filter(Boolean))).length,
    [objects]
  )

  const cameraCommand = useMemo(
    () => ({ preset: cameraPreset, nonce: cameraCommandNonce }),
    [cameraCommandNonce, cameraPreset]
  )

  return (
    <main className="min-h-full bg-background">
      <div className="mx-auto w-full max-w-none px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-mango/90">Scene explorer</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Living 3D annotations</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Explore, search, and focus annotated objects in context. The scene stays central while supporting frames explain what the model saw.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" onClick={refreshAll}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Link
              href="/setup"
              className="inline-flex items-center justify-center rounded-full bg-mango px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-mango/90"
            >
              <Plus className="mr-2 h-4 w-4" />
              New map
            </Link>
          </div>
        </header>

        {homesError ? (
          <div className="mt-6 rounded-[24px] border border-red-500/20 bg-red-500/5 px-4 py-4 text-sm text-red-500">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Unable to load saved scenes.</p>
                <p className="mt-1 text-red-500/80">{homesError}</p>
              </div>
            </div>
          </div>
        ) : null}

        {!homesLoading && homes.length === 0 && !homesError ? <EmptyPanel /> : null}

        {homes.length > 0 ? (
          <div className="mt-6 grid gap-5">
            <aside className="space-y-4">
              <div className="rounded-[28px] bg-card/52 p-4 backdrop-blur-xl">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Scene library</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Pick another walkthrough without leaving the explorer.</p>
                </div>

                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={historyQuery}
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    placeholder="Search scenes"
                    className="rounded-2xl border-border/70 bg-background/55 pl-10"
                  />
                </div>

                <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {filteredHomes.length > 0 ? (
                    filteredHomes.map((home) => {
                      const isSelected = home.home_id === activeHome?.home_id

                      return (
                        <button
                          key={home.home_id}
                          type="button"
                          onClick={() => selectHome(home.home_id)}
                          className={cn(
                            "w-full rounded-2xl px-4 py-3 text-left transition-colors",
                            isSelected ? "bg-mango/10 text-foreground" : "bg-background/45 text-foreground hover:bg-mango/6"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{home.name}</p>
                              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{home.home_id}</p>
                            </div>
                            <Badge className={cn("border shrink-0", getStatusClasses(home.status))}>
                              {getStatusLabel(home.status)}
                            </Badge>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{home.num_objects} objects</span>
                            <span>{formatDateTime(home.created_at)}</span>
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <div className="rounded-2xl bg-background/35 px-4 py-5 text-sm text-muted-foreground">
                      No scenes match this filter.
                    </div>
                  )}
                </div>
              </div>
            </aside>

            <section className="min-w-0 space-y-4">
              <div className="rounded-[28px] border border-border/60 bg-card/40 px-5 py-5 backdrop-blur-2xl">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                        {activeHome?.name ?? "Select a scene"}
                      </h2>
                      {activeHome ? (
                        <Badge className={cn("border font-medium", getStatusClasses(activeHome.status))}>
                          {getStatusLabel(activeHome.status)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {activeHome
                        ? `Created ${formatDateTime(activeHome.created_at)}. Updated ${formatRelative(activeHomeUpdatedAt)}.`
                        : "Choose a saved scene from the library."}
                    </p>
                  </div>

                  {activeHome ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="rounded-full" onClick={downloadObjects}>
                        <Download className="mr-2 h-4 w-4" />
                        Export
                      </Button>
                      {activeHome.status === "ready" ? (
                        <a
                          href={sceneUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open GLB
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[24px] bg-background/42 px-4 py-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Objects</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{objects.length}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Anchored in this scene</p>
                  </div>
                  <div className="rounded-[24px] bg-background/42 px-4 py-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Classes</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{uniqueLabelCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Distinct labels</p>
                  </div>
                  <div className="rounded-[24px] bg-background/42 px-4 py-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Visible</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{visibleObjects.length}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Matching current filters</p>
                  </div>
                  <div className="rounded-[24px] bg-background/42 px-4 py-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Focused</p>
                    <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                      {focusedObject ? focusedObject.label : "None"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {focusedObject ? `${focusedObject.n_observations} frames · ${formatConfidence(focusedObject.confidence)}` : "Click an object to focus"}
                    </p>
                  </div>
                </div>
              </div>

              {homeError ? (
                <div className="rounded-[24px] border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500">
                  {homeError}
                </div>
              ) : null}

              {homeLoading ? (
                <div className="flex items-center gap-2 rounded-[24px] bg-card/55 px-4 py-3 text-sm text-muted-foreground backdrop-blur-xl">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading scene...
                </div>
              ) : null}

              {activeHome?.status === "ready" ? (
                <div className="space-y-4">
                  <div className="relative min-h-[82vh] overflow-hidden rounded-[36px] border border-white/8 bg-[#030507] shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
                    <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(88,196,255,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(245,166,35,0.08),transparent_22%)]" />
                    <div className="absolute inset-0 z-0">
                      {focusedObject ? (
                        <div className="pointer-events-none absolute left-6 top-6 z-30 rounded-full border border-mango/25 bg-black/45 px-4 py-2 text-sm text-white/85 backdrop-blur-xl">
                          {focusedObject.label} · {formatConfidence(focusedObject.confidence)} · {focusedObject.n_observations} frames
                        </div>
                      ) : null}

                      <HomeSceneViewer
                        homeId={activeHome.home_id}
                        glbUrl={sceneUrl}
                        sceneVersion={sceneVersion}
                        objects={visibleObjects}
                        mode="annotator"
                        focusedObjectId={focusedObjectId}
                        selectedObjectIds={selectedObjectIds}
                        hoveredObjectId={hoveredObjectId}
                        displayMode={displayMode}
                        colorMode={colorMode}
                        cameraCommand={cameraCommand}
                        onObjectActivate={(objectId, options) => activateObject(objectId, options?.additive)}
                        onObjectHover={setHoveredObjectId}
                        debugOptions={viewerDebug}
                        height={980}
                        className="h-full rounded-none"
                      />
                    </div>

                    <div className="absolute left-5 top-24 z-30 hidden w-[320px] max-w-[26vw] xl:block">
                      <SceneObjectBrowser
                        objects={visibleObjects}
                        query={objectQuery}
                        selectedObjectIds={selectedObjectIds}
                        focusedObjectId={focusedObjectId}
                        pinnedObjectIds={pinnedObjectIds}
                        hiddenLabels={hiddenLabels}
                        hiddenObjectIds={hiddenObjectIds}
                        onQueryChange={setObjectQuery}
                        onSelectObject={activateObject}
                        onSelectLabel={selectLabelGroup}
                        onHoverObject={setHoveredObjectId}
                        onTogglePin={togglePin}
                        onHideObject={hideObject}
                        onToggleLabelVisibility={toggleLabelVisibility}
                        onResetVisibility={resetVisibility}
                      />
                    </div>

                    <div className="absolute right-5 top-5 z-30 hidden w-[360px] max-w-[28vw] 2xl:block">
                      <SceneObjectInspector
                        focusedObject={focusedObject}
                        selectedObjects={selectedObjects}
                        pinnedObjectIds={pinnedObjectIds}
                        displayMode={displayMode}
                        evidence={evidence}
                        evidenceLoading={evidenceLoading}
                        activeEvidenceFrame={activeEvidenceFrame}
                        onClearSelection={() => {
                          setFocusedObjectId(null)
                          setSelectedObjectIds([])
                          setHoveredObjectId(null)
                        }}
                        onToggleIsolate={toggleIsolate}
                        onTogglePin={togglePin}
                        onHideObject={hideObject}
                        onHideLabel={toggleLabelVisibility}
                        onSelectEvidenceFrame={setActiveEvidenceFrame}
                      />
                    </div>

                    <div className="absolute left-1/2 top-5 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full border border-white/10 bg-black/38 px-3 py-2 backdrop-blur-xl">
                      <Button variant="outline" className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => createCameraCommand("reset")}>
                        Reset view
                      </Button>
                      <Button variant="outline" className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => createCameraCommand("top")}>
                        Top view
                      </Button>
                      <Button variant="outline" className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => createCameraCommand("overview")}>
                        Overview
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                        onClick={() => createCameraCommand("focus")}
                        disabled={!focusedObject}
                      >
                        Focus selected
                      </Button>
                    </div>

                    <div className="absolute bottom-5 left-1/2 z-30 flex w-[min(960px,calc(100%-2.5rem))] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-black/42 px-4 py-4 backdrop-blur-2xl">
                      <div className="flex flex-wrap gap-2">
                        {DISPLAY_MODE_OPTIONS.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setDisplayMode(option.key)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
                              displayMode === option.key
                                ? "border-mango/35 bg-mango/10 text-mango"
                                : "border-white/10 bg-white/5 text-white/72"
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                        {COLOR_MODE_OPTIONS.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setColorMode(option.key)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
                              colorMode === option.key
                                ? "border-sky-300/35 bg-sky-300/10 text-sky-100"
                                : "border-white/10 bg-white/5 text-white/72"
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => navigateRelative(-1, "all")}>
                          <ChevronLeft className="mr-2 h-4 w-4" />
                          Previous
                        </Button>
                        <Button variant="outline" className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => navigateRelative(1, "all")}>
                          Next
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                          onClick={() => navigateRelative(1, "class")}
                          disabled={!focusedObject}
                        >
                          Next in class
                        </Button>
                      </div>
                    </div>

                    <div className="absolute right-5 top-5 z-30 flex max-w-[70vw] flex-wrap items-center justify-end gap-2 2xl:hidden">
                      <button
                        type="button"
                        onClick={() => toggleViewerDebug("showApproxRegion")}
                        className={cn(
                          "rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
                          viewerDebug.showApproxRegion
                            ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200"
                            : "border-white/10 bg-black/36 text-white/72"
                        )}
                      >
                        Approx
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleViewerDebug("showExactPoints")}
                        className={cn(
                          "rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
                          viewerDebug.showExactPoints
                            ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200"
                            : "border-white/10 bg-black/36 text-white/72"
                        )}
                      >
                        Support
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleViewerDebug("showBBoxes")}
                        className={cn(
                          "rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
                          viewerDebug.showBBoxes
                            ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200"
                            : "border-white/10 bg-black/36 text-white/72"
                        )}
                      >
                        BBox
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:hidden">
                    <SceneObjectBrowser
                      objects={visibleObjects}
                      query={objectQuery}
                      selectedObjectIds={selectedObjectIds}
                      focusedObjectId={focusedObjectId}
                      pinnedObjectIds={pinnedObjectIds}
                      hiddenLabels={hiddenLabels}
                      hiddenObjectIds={hiddenObjectIds}
                      onQueryChange={setObjectQuery}
                      onSelectObject={activateObject}
                      onSelectLabel={selectLabelGroup}
                      onHoverObject={setHoveredObjectId}
                      onTogglePin={togglePin}
                      onHideObject={hideObject}
                      onToggleLabelVisibility={toggleLabelVisibility}
                      onResetVisibility={resetVisibility}
                    />
                  </div>

                  <div className="grid gap-4 2xl:hidden">
                    <SceneObjectInspector
                      focusedObject={focusedObject}
                      selectedObjects={selectedObjects}
                      pinnedObjectIds={pinnedObjectIds}
                      displayMode={displayMode}
                      evidence={evidence}
                      evidenceLoading={evidenceLoading}
                      activeEvidenceFrame={activeEvidenceFrame}
                      onClearSelection={() => {
                        setFocusedObjectId(null)
                        setSelectedObjectIds([])
                        setHoveredObjectId(null)
                      }}
                      onToggleIsolate={toggleIsolate}
                      onTogglePin={togglePin}
                      onHideObject={hideObject}
                      onHideLabel={toggleLabelVisibility}
                      onSelectEvidenceFrame={setActiveEvidenceFrame}
                    />
                  </div>
                </div>
              ) : null}

              {activeHome?.status === "processing" ? (
                <div className="rounded-[28px] bg-mango/7 px-6 py-8">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mango/10 text-mango">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Scene is still processing</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Setup is still building the annotated GLB, object anchors, and supporting evidence for this walkthrough.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeHome?.status === "failed" ? (
                <div className="rounded-[28px] bg-red-500/6 px-6 py-8">
                  <h3 className="text-lg font-semibold text-red-500">Scene build failed</h3>
                  <p className="mt-2 text-sm leading-6 text-red-500/80">
                    {selectedHome?.error ?? "The backend returned a failed status for this run."}
                  </p>
                </div>
              ) : null}
            </section>

          </div>
        ) : null}
      </div>
    </main>
  )
}
