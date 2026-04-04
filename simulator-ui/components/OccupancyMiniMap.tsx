"use client"

import { useEffect, useRef } from "react"

import { worldToGrid } from "@/lib/occupancy"
import type { OccupancyGrid, PathPoint, SimTarget } from "@/lib/types"

function toCanvasPoint(point: PathPoint, size: number, halfExtentM: number) {
  const x = ((point.x + halfExtentM) / (halfExtentM * 2)) * size
  const y = size - ((point.z + halfExtentM) / (halfExtentM * 2)) * size
  return { x, y }
}

export function OccupancyMiniMap({
  grid,
  startPose,
  selectedTarget,
  teacherPath,
  rolloutPath,
}: {
  grid: OccupancyGrid
  startPose: PathPoint
  selectedTarget: SimTarget | null
  teacherPath: PathPoint[]
  rolloutPath: PathPoint[]
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const size = canvas.width
    const cellPx = size / grid.gridCells

    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = "#061018"
    ctx.fillRect(0, 0, size, size)

    for (let row = 0; row < grid.gridCells; row += 1) {
      for (let col = 0; col < grid.gridCells; col += 1) {
        ctx.fillStyle = grid.rows[row][col] ? "#233545" : "#0c1b29"
        ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx)
      }
    }

    ctx.strokeStyle = "rgba(111, 196, 255, 0.08)"
    ctx.lineWidth = 1
    for (let index = 0; index <= grid.gridCells; index += 10) {
      const offset = index * cellPx
      ctx.beginPath()
      ctx.moveTo(offset, 0)
      ctx.lineTo(offset, size)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, offset)
      ctx.lineTo(size, offset)
      ctx.stroke()
    }

    const drawPath = (points: PathPoint[], strokeStyle: string, width: number) => {
      if (points.length < 2) return
      ctx.beginPath()
      points.forEach((point, index) => {
        const canvasPoint = toCanvasPoint(point, size, grid.halfExtentM)
        if (index === 0) {
          ctx.moveTo(canvasPoint.x, canvasPoint.y)
        } else {
          ctx.lineTo(canvasPoint.x, canvasPoint.y)
        }
      })
      ctx.strokeStyle = strokeStyle
      ctx.lineWidth = width
      ctx.stroke()
    }

    drawPath(teacherPath, "#58c5ff", 3)
    drawPath(rolloutPath, "#ffb15e", 2)

    const startCanvas = toCanvasPoint(startPose, size, grid.halfExtentM)
    ctx.fillStyle = "#2ee6a6"
    ctx.beginPath()
    ctx.arc(startCanvas.x, startCanvas.y, 5, 0, Math.PI * 2)
    ctx.fill()

    const startCell = worldToGrid(startPose.x, startPose.z)
    ctx.strokeStyle = "rgba(46, 230, 166, 0.28)"
    ctx.lineWidth = 2
    ctx.strokeRect(startCell.col * cellPx, startCell.row * cellPx, cellPx, cellPx)

    if (selectedTarget) {
      const targetCanvas = toCanvasPoint({ x: selectedTarget.x, z: selectedTarget.z }, size, grid.halfExtentM)
      ctx.fillStyle = "#ff758a"
      ctx.beginPath()
      ctx.arc(targetCanvas.x, targetCanvas.y, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [grid, rolloutPath, selectedTarget, startPose, teacherPath])

  return (
    <div className="compact-stack">
      <canvas ref={canvasRef} className="mini-map" width={440} height={440} />
      <div className="legend">
        <span>
          <i className="legend-dot" style={{ background: "#2ee6a6" }} />
          robot start
        </span>
        <span>
          <i className="legend-dot" style={{ background: "#ff758a" }} />
          target
        </span>
        <span>
          <i className="legend-dot" style={{ background: "#58c5ff" }} />
          teacher path
        </span>
        <span>
          <i className="legend-dot" style={{ background: "#ffb15e" }} />
          best rollout
        </span>
      </div>
    </div>
  )
}
