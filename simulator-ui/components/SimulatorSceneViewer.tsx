"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

import type { ExactObjectHighlight, PathPoint, SimTarget } from "@/lib/types"

const SceneInner = dynamic(() => import("./SimulatorSceneInner").then((mod) => mod.SimulatorSceneInner), {
  ssr: false,
  loading: () => <div className="viewer-loading">Loading digital twin…</div>,
})

export function SimulatorSceneViewer({
  sceneUrl,
  targets,
  selectedTarget,
  highlight,
  teacherPath,
  rolloutPath,
  startPose,
  onStatsChange,
}: {
  sceneUrl: string
  targets: SimTarget[]
  selectedTarget: SimTarget | null
  highlight: ExactObjectHighlight | null
  teacherPath: PathPoint[]
  rolloutPath: PathPoint[]
  startPose: PathPoint
  onStatsChange?: (stats: { vertexCount: number }) => void
}) {
  const [assetUrl, setAssetUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    setAssetUrl(null)
    setError(null)

    void fetch(sceneUrl, { cache: "force-cache" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load scene (${res.status})`)
        }
        const blob = await res.blob()
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) {
          setAssetUrl(objectUrl)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Scene load failed.")
        }
      })

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [sceneUrl])

  if (error) {
    return <div className="viewer-error">{error}</div>
  }

  if (!assetUrl) {
    return <div className="viewer-loading">Loading digital twin…</div>
  }

  return (
    <SceneInner
      assetUrl={assetUrl}
      highlight={highlight}
      onStatsChange={onStatsChange}
      rolloutPath={rolloutPath}
      selectedTarget={selectedTarget}
      startPose={startPose}
      targets={targets}
      teacherPath={teacherPath}
    />
  )
}
