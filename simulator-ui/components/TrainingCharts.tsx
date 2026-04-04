"use client"

import type { TrainingPreview } from "@/lib/types"

function buildPolyline(values: number[], width: number, height: number) {
  if (values.length === 0) return ""

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
      const y = height - ((value - min) / range) * (height - 18) - 9
      return `${x},${y}`
    })
    .join(" ")
}

export function TrainingCharts({ preview }: { preview: TrainingPreview | null }) {
  if (!preview) {
    return (
      <div className="notice">
        <strong>Training preview is idle.</strong> Plan a target, then run the simulated training loop to populate reward
        curves, success bars, and the best rollout replay.
      </div>
    )
  }

  const rewards = preview.episodes.map((episode) => episode.reward)
  const rewardPolyline = buildPolyline(rewards, 520, 120)

  return (
    <div className="stack">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Success rate</div>
          <div className="value">{preview.summary.successRate}%</div>
        </div>
        <div className="stat-card">
          <div className="label">Average reward</div>
          <div className="value">{preview.summary.averageReward}</div>
        </div>
        <div className="stat-card">
          <div className="label">Best reward</div>
          <div className="value">{preview.summary.bestReward}</div>
        </div>
        <div className="stat-card">
          <div className="label">Average collisions</div>
          <div className="value">{preview.summary.averageCollisions}</div>
        </div>
      </div>

      <div className="chart-block">
        <div className="panel-title">
          <h3>Reward trend</h3>
          <span className="pill mono">20 deterministic episodes</span>
        </div>
        <svg className="chart-svg" viewBox="0 0 520 120" preserveAspectRatio="none" aria-label="Reward trend">
          <defs>
            <linearGradient id="reward-line" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#58c5ff" />
              <stop offset="100%" stopColor="#2ee6a6" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="520" height="120" fill="rgba(255,255,255,0.02)" />
          <polyline
            fill="none"
            stroke="url(#reward-line)"
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={rewardPolyline}
          />
        </svg>
      </div>

      <div className="chart-block">
        <div className="panel-title">
          <h3>Success strip</h3>
          <span className="muted">Green episodes converged, red episodes failed</span>
        </div>
        <div className="success-strip">
          {preview.episodes.map((episode) => (
            <div
              className={`success-bar ${episode.success ? "success" : "fail"}`}
              key={episode.episode}
              title={`Episode ${episode.episode}: ${episode.success ? "success" : "fail"}`}
            />
          ))}
        </div>
      </div>

      <div className="chart-block">
        <div className="panel-title">
          <h3>Episode breakdown</h3>
          <span className="muted">Mock metrics, real teacher path</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ep</th>
                <th>Reward</th>
                <th>Success</th>
                <th>Collisions</th>
                <th>Path m</th>
                <th>Steps</th>
              </tr>
            </thead>
            <tbody>
              {preview.episodes.map((episode) => (
                <tr key={episode.episode}>
                  <td className="mono">{episode.episode}</td>
                  <td className="mono">{episode.reward}</td>
                  <td className={episode.success ? "success-text" : "fail-text"}>
                    {episode.success ? "success" : "fail"}
                  </td>
                  <td className="mono">{episode.collisions}</td>
                  <td className="mono">{episode.pathLengthM}</td>
                  <td className="mono">{episode.steps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
