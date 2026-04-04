"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"

import { cn } from "@/lib/utils"

export type ObjectItem = {
  id: string
  label: string
  x: number
  y: number
  z: number
  confidence: number | null
  n_observations: number
  bbox_min?: number[] | null
  bbox_max?: number[] | null
}

type ResolvedSceneAsset = {
  url: string
  source: "local" | "remote"
}

export interface HomeSceneViewerProps {
  homeId?: string
  glbUrl: string
  sceneVersion?: string
  objects: ObjectItem[]
  path?: { x: number; z: number }[]
  currentStepIndex?: number
  targetLabel?: string
  height?: number
  className?: string
}

const sceneAssetCache = new Map<string, Promise<ResolvedSceneAsset>>()
const sceneObjectUrlCache = new Map<string, ResolvedSceneAsset>()
const LOCAL_SCENE_BROWSER_CACHE = "wayfr-local-scenes-v1"

const Scene = dynamic(() => import("./HomeSceneInner").then((m) => m.HomeSceneInner), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#030408",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
      }}
    >
      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#F5A62360" }}>
        Loading 3D scene...
      </span>
    </div>
  ),
})

function buildSceneCacheKey(homeId: string | undefined, glbUrl: string, sceneVersion?: string) {
  if (!homeId) return `${glbUrl}:${sceneVersion ?? "latest"}`
  return `${homeId}:${sceneVersion ?? "latest"}`
}

function buildVersionSuffix(sceneVersion?: string) {
  if (!sceneVersion) return ""
  return `?v=${encodeURIComponent(sceneVersion)}`
}

async function readLocalSceneAsObjectUrl(url: string) {
  if (typeof window === "undefined") {
    throw new Error("Browser cache unavailable on server.")
  }

  const cache = "caches" in window ? await window.caches.open(LOCAL_SCENE_BROWSER_CACHE) : null
  let response = cache ? await cache.match(url) : undefined

  if (!response) {
    response = await fetch(url, { cache: "force-cache" })
    if (!response.ok) {
      throw new Error(`Failed to read local scene (${response.status})`)
    }
    await cache?.put(url, response.clone())
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

async function resolveSceneAsset(homeId: string | undefined, glbUrl: string, sceneVersion?: string) {
  const cacheKey = buildSceneCacheKey(homeId, glbUrl, sceneVersion)
  const cachedAsset = sceneObjectUrlCache.get(cacheKey)
  if (cachedAsset) return cachedAsset

  const inFlight = sceneAssetCache.get(cacheKey)
  if (inFlight) return inFlight

  const promise = (async () => {
    const versionSuffix = buildVersionSuffix(sceneVersion)
    const localUrl = homeId ? `/api/local-scenes/${homeId}${versionSuffix}` : null

    if (localUrl) {
      try {
        const objectUrl = await readLocalSceneAsObjectUrl(localUrl)
        const asset = { url: objectUrl, source: "local" as const }
        sceneObjectUrlCache.set(cacheKey, asset)
        return asset
      } catch {
        // Fall through to backend scene URL when the local file is unavailable.
      }
    }

    const response = await fetch(glbUrl, { cache: "force-cache" })
    if (!response.ok) {
      throw new Error(`Failed to load remote scene (${response.status})`)
    }

    const blob = await response.blob()
    const asset = { url: URL.createObjectURL(blob), source: "remote" as const }
    sceneObjectUrlCache.set(cacheKey, asset)
    return asset
  })()

  sceneAssetCache.set(cacheKey, promise)

  try {
    return await promise
  } finally {
    sceneAssetCache.delete(cacheKey)
  }
}

export function HomeSceneViewer({
  homeId,
  glbUrl,
  sceneVersion,
  objects,
  path,
  currentStepIndex,
  targetLabel,
  height = 400,
  className,
}: HomeSceneViewerProps) {
  const sceneKey = useMemo(
    () => buildSceneCacheKey(homeId, glbUrl, sceneVersion),
    [glbUrl, homeId, sceneVersion]
  )
  const [sceneState, setSceneState] = useState<{
    key: string
    asset: ResolvedSceneAsset | null
    failed: boolean
  }>({
    key: sceneKey,
    asset: null,
    failed: false,
  })
  const [vertexState, setVertexState] = useState({
    key: sceneKey,
    count: 0,
  })

  const navActive = !!path && path.length > 0
  const resolvedScene = sceneState.key === sceneKey ? sceneState.asset : null
  const glbFailed = sceneState.key === sceneKey ? sceneState.failed : false
  const vertexCount = vertexState.key === sceneKey ? vertexState.count : 0

  const handlePointCount = useCallback(
    (count: number) => {
      setVertexState((current) => {
        if (current.key === sceneKey && current.count === count) {
          return current
        }

        return { key: sceneKey, count }
      })
    },
    [sceneKey]
  )

  const handleGlbError = useCallback(() => {
    setSceneState((current) => {
      if (current.key !== sceneKey) return current
      if (current.failed) return current
      return { ...current, failed: true }
    })
  }, [sceneKey])

  useEffect(() => {
    let cancelled = false

    void resolveSceneAsset(homeId, glbUrl, sceneVersion)
      .then((asset) => {
        if (!cancelled) {
          setSceneState({
            key: sceneKey,
            asset,
            failed: false,
          })
          setVertexState((current) => (current.key === sceneKey ? current : { key: sceneKey, count: 0 }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSceneState({
            key: sceneKey,
            asset: null,
            failed: true,
          })
          setVertexState((current) => (current.key === sceneKey ? current : { key: sceneKey, count: 0 }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [glbUrl, homeId, sceneKey, sceneVersion])

  return (
    <div
      className={cn("relative", className)}
      style={{ width: "100%", height, position: "relative", borderRadius: 8, overflow: "hidden" }}
    >
      {resolvedScene?.url && (
        <Scene
          glbUrl={resolvedScene.url}
          objects={objects}
          path={path}
          currentStepIndex={currentStepIndex ?? 0}
          targetLabel={targetLabel}
          onPointCount={handlePointCount}
          onGlbError={handleGlbError}
        />
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/72 backdrop-blur-xl">
        {vertexCount > 0 ? `${vertexCount.toLocaleString()} verts` : glbFailed ? "scene unavailable" : "loading room mesh"}
        {" · "}
        {objects.length} annotations
        {navActive ? " · navigation" : " · orbit"}
      </div>
    </div>
  )
}
