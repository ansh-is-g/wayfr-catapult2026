"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { fetchHome, fetchObjectHighlight, fetchTargets, getSceneUrl, planNavigation } from "@/lib/api"
import { buildOccupancyGrid, findSafeStartPose } from "@/lib/occupancy"
import { generateTrainingPreview } from "@/lib/training"
import type {
  ExactObjectHighlight,
  NavigationPlanResult,
  PathPoint,
  SimHome,
  SimTarget,
  TrainingPreview,
} from "@/lib/types"
import { OccupancyMiniMap } from "./OccupancyMiniMap"
import { SimulatorSceneViewer } from "./SimulatorSceneViewer"
import { TrainingCharts } from "./TrainingCharts"

function statusClass(status: string) {
  if (status === "ready") return "ready"
  if (status === "failed") return "failed"
  return "processing"
}

function nearestTarget(plan: NavigationPlanResult, targets: SimTarget[]) {
  if (!plan.target) {
    const targetLabel = plan.targetLabel.toLowerCase()
    return targets.find((target) => target.label.toLowerCase().includes(targetLabel)) ?? null
  }

  const labelLower = plan.target.label.toLowerCase()
  const candidates = targets.filter((target) => target.label.toLowerCase().includes(labelLower))
  const pool = candidates.length > 0 ? candidates : targets
  return (
    pool.reduce<SimTarget | null>((best, current) => {
      const currentDistance = Math.hypot(current.x - plan.target!.x, current.z - plan.target!.z)
      if (!best) return current
      const bestDistance = Math.hypot(best.x - plan.target!.x, best.z - plan.target!.z)
      return currentDistance < bestDistance ? current : best
    }, null) ?? null
  )
}

function bundleDownload(filename: string, payload: object) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function SimulatorWorkspace({ homeId }: { homeId: string }) {
  const [home, setHome] = useState<SimHome | null>(null)
  const [targets, setTargets] = useState<SimTarget[]>([])
  const [query, setQuery] = useState("")
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<ExactObjectHighlight | null>(null)
  const [highlightError, setHighlightError] = useState<string | null>(null)
  const [plan, setPlan] = useState<NavigationPlanResult | null>(null)
  const [training, setTraining] = useState<TrainingPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [sceneStats, setSceneStats] = useState<{ vertexCount: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    void Promise.all([fetchHome(homeId), fetchTargets(homeId)])
      .then(([nextHome, nextTargets]) => {
        if (cancelled) return
        setHome(nextHome)
        setTargets(nextTargets)
        setSelectedTargetId((current) => current ?? nextTargets[0]?.id ?? null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unable to load simulator data.")
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [homeId])

  const occupancy = useMemo(() => buildOccupancyGrid(targets), [targets])
  const startPose = useMemo(() => findSafeStartPose(occupancy, 0, 0), [occupancy])
  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === selectedTargetId) ?? null,
    [selectedTargetId, targets]
  )
  const teacherPath = useMemo<PathPoint[]>(() => {
    if (!plan) return []
    return [{ x: startPose.x, z: startPose.z }, ...plan.waypoints.map((point) => ({ x: point.x, z: point.z }))]
  }, [plan, startPose.x, startPose.z])
  const rolloutPath = training?.bestEpisode.rollout ?? []

  const waypointSegmentLabel = useMemo(() => {
    if (!plan) return ""
    return plan.waypoints.length === 1 ? "1 segment" : `${plan.waypoints.length} segments`
  }, [plan])

  useEffect(() => {
    if (!selectedTarget || selectedTarget.trackId == null) {
      setHighlight(null)
      setHighlightError(null)
      return
    }

    let cancelled = false
    setHighlight(null)
    setHighlightError(null)

    void fetchObjectHighlight(homeId, selectedTarget.trackId)
      .then((data) => {
        if (!cancelled) {
          setHighlight(data)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHighlightError(err instanceof Error ? err.message : "Exact highlight unavailable.")
        }
      })

    return () => {
      cancelled = true
    }
  }, [homeId, selectedTarget])

  const executePlan = useCallback(
    async (targetLabel: string) => {
      setPlanning(true)
      setActionError(null)
      try {
        const trimmed = targetLabel.trim()
        if (!trimmed) {
          throw new Error("Pick a target object or enter a label first.")
        }

        const nextPlan = await planNavigation(homeId, trimmed, startPose.x, startPose.z)
        setPlan(nextPlan)
        setTraining(null)
        setActionError(null)
        setQuery(trimmed)

        const resolved = nearestTarget(nextPlan, targets)
        if (resolved) {
          setSelectedTargetId(resolved.id)
        }

        return nextPlan
      } finally {
        setPlanning(false)
      }
    },
    [homeId, startPose.x, startPose.z, targets]
  )

  const handlePlanRequest = useCallback(async () => {
    try {
      await executePlan(query || selectedTarget?.label || "")
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Unable to plan this task.")
    }
  }, [executePlan, query, selectedTarget])

  const handleObjectSelect = useCallback(
    async (target: SimTarget) => {
      setSelectedTargetId(target.id)
      setQuery(target.label)
      try {
        await executePlan(target.label)
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : "Unable to plan this task.")
      }
    },
    [executePlan]
  )

  const handleTrainingRun = useCallback(async () => {
    try {
      const activePlan = plan ?? (await executePlan(query || selectedTarget?.label || ""))
      const resolvedTarget = nearestTarget(activePlan, targets)
      const preview = generateTrainingPreview({
        homeId,
        targetLabel: activePlan.targetLabel,
        startPose,
        plan: activePlan,
        target: resolvedTarget,
      })
      setTraining(preview)
      setActionError(null)
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Unable to run simulated training.")
    }
  }, [executePlan, homeId, plan, query, selectedTarget, startPose, targets])

  const handleExport = useCallback(() => {
    if (!home || !plan) {
      setActionError("Plan a task first so the simulator can export a valid bundle.")
      return
    }

    bundleDownload(`${home.homeId}-sim-bundle.json`, {
      home,
      sceneUrl: getSceneUrl(home.homeId),
      occupancy,
      targets,
      startPose,
      selectedTask: plan.targetLabel,
      teacherPath,
      trainingSummary: training?.summary ?? null,
      bestRollout: training?.bestEpisode ?? null,
    })
  }, [home, occupancy, plan, startPose, targets, teacherPath, training])

  if (loading) {
    return <div className="loading-state">Loading simulator workspace…</div>
  }

  if (error || !home) {
    return <div className="error-state">{error ?? "Home data is unavailable."}</div>
  }

  return (
    <div className="stack">
      <div className="link-row">
        <Link className="back-link mono" href="/">
          ← back to mapped homes
        </Link>
        <span className={`pill ${statusClass(home.status)}`}>{home.status}</span>
      </div>

      <section className="hero" style={{ marginBottom: 0 }}>
        <div className="eyebrow mono">demo-only training preview</div>
        <h1 style={{ maxWidth: "14ch" }}>{home.name}</h1>
        <p>
          This console reuses the real wayfr room model, object dimensions, and existing navigation planner. The
          training curves are simulated on the client so the demo stays fast, honest, and easy to ship.
        </p>
      </section>

      <div className="grid workspace-grid">
        <aside className="panel">
          <div className="panel-inner stack">
            <div className="panel-title">
              <h2>Task console</h2>
              <span className="pill mono">{home.homeId.slice(0, 8)}</span>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <div className="label">Mapped objects</div>
                <div className="value">{targets.length}</div>
              </div>
              <div className="stat-card">
                <div className="label">GLB vertices</div>
                <div className="value">{sceneStats?.vertexCount?.toLocaleString() ?? "…"}</div>
              </div>
              <div className="stat-card">
                <div className="label">Grid cells</div>
                <div className="value">{occupancy.gridCells}²</div>
              </div>
              <div className="stat-card">
                <div className="label">Robot start</div>
                <div className="value mono">
                  {startPose.x.toFixed(2)}, {startPose.z.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="toolbar">
              <div className="input-row">
                <input
                  className="text-input"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="move to laptop"
                  value={query}
                />
                <button
                  className="primary-button"
                  disabled={planning}
                  onClick={() => void handlePlanRequest()}
                  type="button"
                >
                  {planning ? "Planning…" : "Plan"}
                </button>
              </div>
              {plan ? (
                <div className="notice mono" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <strong>Planner result.</strong> {plan.totalDistanceM.toFixed(2)}m total · {waypointSegmentLabel}
                  {plan.waypoints.length === 0
                    ? " — no polyline on map (start cell equals goal, or A* returned a trivial path)."
                    : null}
                </div>
              ) : null}
              <div className="button-row">
                <button
                  className="secondary-button"
                  disabled={planning}
                  onClick={() => void handleTrainingRun()}
                  type="button"
                >
                  Run simulated training
                </button>
                <button className="secondary-button" onClick={handleExport} type="button">
                  Export sim bundle
                </button>
              </div>
            </div>

            <div className="notice">
              <strong>Training note.</strong> This is a deterministic mock RL loop built on the real teacher path from{" "}
              <span className="mono">POST /api/navigation/plan</span>, not a full robotics stack.
            </div>

            {actionError ? <div className="error-state">{actionError}</div> : null}

            <div className="panel-title">
              <h3>Selected target</h3>
              <span className="muted">label-level selection</span>
            </div>

            <div className="detail-list">
              <div className="detail-item">
                <span className="muted">Label</span>
                <span>{selectedTarget?.label ?? "none"}</span>
              </div>
              <div className="detail-item">
                <span className="muted">World position</span>
                <span className="mono">
                  {selectedTarget ? `${selectedTarget.x.toFixed(2)}, ${selectedTarget.z.toFixed(2)}` : "—"}
                </span>
              </div>
              <div className="detail-item">
                <span className="muted">Size (m)</span>
                <span className="mono">
                  {selectedTarget
                    ? `${selectedTarget.sizeM[0].toFixed(2)} × ${selectedTarget.sizeM[1].toFixed(2)} × ${selectedTarget.sizeM[2].toFixed(2)}`
                    : "—"}
                </span>
              </div>
              <div className="detail-item">
                <span className="muted">Exact points</span>
                <span>{highlight ? `${highlight.sampledPointCount} loaded` : highlightError ? "bbox only" : "pending"}</span>
              </div>
            </div>

            {highlightError ? <div className="notice">{highlightError}</div> : null}

            <div className="panel-title">
              <h3>Semantic targets</h3>
              <span className="muted">{targets.length} available</span>
            </div>

            <div className="object-list">
              {targets.map((target) => (
                <button
                  className={`object-item ${target.id === selectedTargetId ? "selected" : ""}`}
                  key={target.id}
                  onClick={() => void handleObjectSelect(target)}
                  type="button"
                >
                  <strong>{target.label}</strong>
                  <small className="mono">
                    {target.x.toFixed(2)}, {target.y.toFixed(2)}, {target.z.toFixed(2)}
                  </small>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="panel">
          <div className="panel-inner">
            <div className="viewer-headline">
              <div>
                <div className="eyebrow mono">digital twin</div>
                <h2>3D scene with semantic overlays</h2>
              </div>
              <div className="home-meta">
                <span className="pill">teacher path</span>
                <span className="pill">best rollout</span>
                <span className="pill">bbox + exact points</span>
              </div>
            </div>

            <div className="panel viewer-shell">
              <SimulatorSceneViewer
                highlight={highlight}
                onStatsChange={setSceneStats}
                rolloutPath={rolloutPath}
                sceneUrl={getSceneUrl(homeId)}
                selectedTarget={selectedTarget}
                startPose={startPose}
                targets={targets}
                teacherPath={teacherPath}
              />
            </div>
          </div>
        </section>

        <aside className="stack">
          <section className="panel">
            <div className="panel-inner stack">
              <div className="panel-title">
                <h2>Top-down occupancy</h2>
                <span className="pill mono">
                  {startPose.shifted ? "start shifted" : "start at origin"}
                </span>
              </div>

              <OccupancyMiniMap
                grid={occupancy}
                rolloutPath={rolloutPath}
                selectedTarget={selectedTarget}
                startPose={startPose}
                teacherPath={teacherPath}
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-inner">
              <div className="panel-title">
                <h2>Training metrics</h2>
                <span className="muted">client-side preview</span>
              </div>
              <TrainingCharts preview={training} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
