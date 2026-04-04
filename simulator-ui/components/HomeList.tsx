"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { fetchHomes, getApiUrl } from "@/lib/api"
import type { SimHome } from "@/lib/types"

function statusClass(status: string) {
  if (status === "ready") return "ready"
  if (status === "failed") return "failed"
  return "processing"
}

export function HomeList() {
  const [homes, setHomes] = useState<SimHome[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void fetchHomes()
      .then((data) => {
        if (!cancelled) {
          setHomes(data)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load mapped homes.")
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const sortedHomes = useMemo(() => {
    return [...homes].sort((left, right) => {
      if (left.status === right.status) {
        return (right.createdAt ?? 0) - (left.createdAt ?? 0)
      }
      if (left.status === "ready") return -1
      if (right.status === "ready") return 1
      return (right.createdAt ?? 0) - (left.createdAt ?? 0)
    })
  }, [homes])

  if (loading) {
    return <div className="loading-state">Loading homes from {getApiUrl()}…</div>
  }

  if (error) {
    return <div className="error-state">{error}</div>
  }

  if (sortedHomes.length === 0) {
    return (
      <div className="empty-state">
        No mapped homes are available yet. Run the existing wayfr home setup flow first, then reload this simulator app.
      </div>
    )
  }

  return (
    <section className="grid home-grid">
      {sortedHomes.map((home) => (
        <Link className="card-link" href={`/sim/${home.homeId}`} key={home.homeId}>
          <article className="panel home-card">
            <div className="topline">
              <span className={`pill ${statusClass(home.status)}`}>{home.status}</span>
              <span className="pill mono">{home.homeId.slice(0, 8)}</span>
            </div>

            <div className="stack">
              <div>
                <h2>{home.name}</h2>
                <p>
                  Robotics-style navigation preview built from the saved room scan, semantic targets, and existing
                  teacher planner.
                </p>
              </div>

              <div className="home-meta">
                <span className="pill">{home.numObjects} mapped objects</span>
                <span className="pill">teacher path ready</span>
                <span className="pill">simulated training</span>
              </div>
            </div>
          </article>
        </Link>
      ))}
    </section>
  )
}
