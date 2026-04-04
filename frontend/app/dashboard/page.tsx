"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  Download,
  ExternalLink,
  FolderClock,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react"

import { HomeSceneViewer } from "@/components/scene/HomeSceneViewer"
import { SceneAnnotationPanel } from "@/components/scene/SceneAnnotationPanel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
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

type ObjectItem = {
  id: string
  label: string
  x: number
  y: number
  z: number
  confidence: number | null
  n_observations: number
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
  objects?: ObjectItem[]
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

export default function DashboardPage() {
  const [homes, setHomes] = useState<HomeSummary[]>([])
  const [requestedHomeId, setRequestedHomeId] = useState("")
  const [selectedHomeId, setSelectedHomeId] = useState("")
  const [selectedHome, setSelectedHome] = useState<HomeDetail | null>(null)
  const [objects, setObjects] = useState<ObjectItem[]>([])
  const [historyQuery, setHistoryQuery] = useState("")
  const [annotationQuery, setAnnotationQuery] = useState("")
  const [hiddenLabels, setHiddenLabels] = useState<string[]>([])
  const [homesLoading, setHomesLoading] = useState(true)
  const [homeLoading, setHomeLoading] = useState(false)
  const [homesError, setHomesError] = useState<string | null>(null)
  const [homeError, setHomeError] = useState<string | null>(null)

  const loadHomes = useCallback(async (signal?: AbortSignal) => {
    setHomesError(null)
    setHomesLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/homes`, {
        signal,
        cache: "no-store",
      })

      if (!response.ok) {
        throw new Error(`Failed to load homes (${response.status})`)
      }

      const data: HomesResponse = await response.json()
      setHomes(data.homes ?? [])
    } catch (error: unknown) {
      if (signal?.aborted) return
      setHomesError(error instanceof Error ? error.message : "Failed to load homes")
    } finally {
      if (!signal?.aborted) {
        setHomesLoading(false)
      }
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
        fetch(`${API_URL}/api/homes/${homeId}`, {
          signal,
          cache: "no-store",
        }),
        fetch(`${API_URL}/api/homes/${homeId}/objects`, {
          signal,
          cache: "no-store",
        }),
      ])

      if (!homeResponse.ok) {
        throw new Error(`Failed to load home (${homeResponse.status})`)
      }

      if (!objectsResponse.ok) {
        throw new Error(`Failed to load objects (${objectsResponse.status})`)
      }

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
      setObjects(objectData.objects ?? [])
    } catch (error: unknown) {
      if (signal?.aborted) return
      setHomeError(error instanceof Error ? error.message : "Failed to load selected home")
    } finally {
      if (!signal?.aborted) {
        setHomeLoading(false)
      }
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
      if (current && homes.some((home) => home.home_id === current)) {
        return current
      }

      return homes[0]?.home_id ?? ""
    })
  }, [homes, requestedHomeId])

  useEffect(() => {
    setAnnotationQuery("")
    setHiddenLabels([])
  }, [selectedHomeId])

  useEffect(() => {
    const controller = new AbortController()
    void loadSelectedHome(selectedHomeId, controller.signal)
    return () => controller.abort()
  }, [selectedHomeId, loadSelectedHome])

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
  const uniqueLabelCount = useMemo(
    () =>
      Array.from(
        new Set(
          objects
            .map((object) => object.label.trim().toLowerCase())
            .filter(Boolean)
        )
      ).length,
    [objects]
  )

  const filteredObjects = useMemo(() => {
    const query = annotationQuery.trim().toLowerCase()

    return objects.filter((object) => {
      const label = object.label.trim().toLowerCase()
      if (hiddenLabels.includes(label)) return false
      if (query && !label.includes(query)) return false
      return true
    })
  }, [annotationQuery, hiddenLabels, objects])

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

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${activeHome.home_id}-objects.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [activeHome, objects])

  const toggleHiddenLabel = useCallback((label: string) => {
    setHiddenLabels((current) => {
      if (current.includes(label)) {
        return current.filter((item) => item !== label)
      }

      return [...current, label]
    })
  }, [])

  const selectAllLabels = useCallback(() => {
    setHiddenLabels([])
  }, [])

  const unselectAllLabels = useCallback(() => {
    setHiddenLabels(
      Array.from(
        new Set(
          objects
            .map((object) => object.label.trim().toLowerCase())
            .filter(Boolean)
        )
      )
    )
  }, [objects])

  return (
    <main className="min-h-full bg-background">
      <div className="mx-auto w-full max-w-[1700px] px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-mango/90">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Saved scenes</h1>
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
                <p className="font-medium">Unable to load saved homes.</p>
                <p className="mt-1 text-red-500/80">{homesError}</p>
              </div>
            </div>
          </div>
        ) : null}

        {!homesLoading && homes.length === 0 && !homesError ? <EmptyPanel /> : null}

        {homes.length > 0 ? (
          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-w-0 space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
                      : "Choose a saved scene from history."}
                  </p>
                </div>

                {activeHome ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="rounded-full" onClick={downloadObjects}>
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </Button>
                    {activeHome.status === "ready" ? (
                      <>
                        <a
                          href={sceneUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open GLB
                        </a>
                      </>
                    ) : null}
                  </div>
                ) : null}
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
                  <div className="rounded-[32px] bg-card/40 p-1 shadow-[0_24px_80px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:shadow-[0_32px_100px_rgba(0,0,0,0.28)]">
                    <HomeSceneViewer
                      homeId={activeHome.home_id}
                      glbUrl={sceneUrl}
                      sceneVersion={sceneVersion}
                      objects={filteredObjects}
                      height={700}
                      className="rounded-[30px]"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    <div className="rounded-[24px] bg-card/45 px-4 py-4 backdrop-blur-xl">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Objects
                      </p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                        {objects.length}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Anchored in this scene</p>
                    </div>

                    <div className="rounded-[24px] bg-card/45 px-4 py-4 backdrop-blur-xl">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Labels
                      </p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                        {uniqueLabelCount}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Distinct annotation types</p>
                    </div>

                    <div className="rounded-[24px] bg-card/45 px-4 py-4 backdrop-blur-xl">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Visible
                      </p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                        {filteredObjects.length}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Matching current filters</p>
                    </div>

                    <div className="rounded-[24px] bg-card/45 px-4 py-4 backdrop-blur-xl">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Updated
                      </p>
                      <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                        {formatRelative(activeHomeUpdatedAt)}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {activeHome.home_id}
                      </p>
                    </div>
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
                        Setup is still building the annotated GLB and object anchors for this home.
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

            <aside className="space-y-4">
              <div className="rounded-[28px] bg-card/52 p-4 backdrop-blur-xl">
                <SceneAnnotationPanel
                  className="border-0 bg-transparent shadow-none ring-0"
                  objects={objects}
                  visibleObjects={filteredObjects}
                  query={annotationQuery}
                  hiddenLabels={hiddenLabels}
                  onQueryChange={setAnnotationQuery}
                  onToggleLabel={toggleHiddenLabel}
                  onSelectAll={selectAllLabels}
                  onUnselectAll={unselectAllLabels}
                  onReset={() => {
                    setAnnotationQuery("")
                    setHiddenLabels([])
                  }}
                />

                <Separator className="my-4 bg-border/50" />

                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">History</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Newest first.</p>
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={historyQuery}
                      onChange={(event) => setHistoryQuery(event.target.value)}
                      placeholder="Search scenes"
                      className="rounded-2xl border-border/70 bg-background/55 pl-10"
                    />
                  </div>

                  <div className="space-y-2">
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
                              isSelected
                                ? "bg-mango/10 text-foreground"
                                : "bg-background/45 text-foreground hover:bg-mango/6"
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
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  )
}
