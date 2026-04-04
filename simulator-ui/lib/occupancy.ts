import type { OccupancyGrid, PathPoint, SimTarget } from "@/lib/types"
import { getTargetBounds } from "@/lib/types"

export const CELL_SIZE = 0.25
export const GRID_CELLS = 80
export const HALF_M = (CELL_SIZE * GRID_CELLS) / 2
export const OBSTACLE_PADDING = 1

export interface GridPosition {
  row: number
  col: number
}

export function worldToGrid(x: number, z: number): GridPosition {
  const col = Math.max(0, Math.min(GRID_CELLS - 1, Math.floor((x + HALF_M) / CELL_SIZE)))
  const row = Math.max(0, Math.min(GRID_CELLS - 1, Math.floor((z + HALF_M) / CELL_SIZE)))
  return { row, col }
}

export function gridToWorld(row: number, col: number): PathPoint {
  return {
    x: col * CELL_SIZE - HALF_M + CELL_SIZE / 2,
    z: row * CELL_SIZE - HALF_M + CELL_SIZE / 2,
  }
}

export function buildOccupancyGrid(targets: SimTarget[]): OccupancyGrid {
  const rows = Array.from({ length: GRID_CELLS }, () => Array.from({ length: GRID_CELLS }, () => false))

  for (const target of targets) {
    const bounds = getTargetBounds(target)
    const minCell = worldToGrid(bounds.min[0], bounds.min[2])
    const maxCell = worldToGrid(bounds.max[0], bounds.max[2])

    const rowStart = Math.max(0, minCell.row - OBSTACLE_PADDING)
    const rowEnd = Math.min(GRID_CELLS - 1, maxCell.row + OBSTACLE_PADDING)
    const colStart = Math.max(0, minCell.col - OBSTACLE_PADDING)
    const colEnd = Math.min(GRID_CELLS - 1, maxCell.col + OBSTACLE_PADDING)

    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        rows[row][col] = true
      }
    }
  }

  return {
    cellSizeM: CELL_SIZE,
    gridCells: GRID_CELLS,
    halfExtentM: HALF_M,
    rows,
  }
}

export function isOccupied(grid: OccupancyGrid, row: number, col: number) {
  return grid.rows[row]?.[col] ?? false
}

export function findSafeStartPose(
  grid: OccupancyGrid,
  startX = 0,
  startZ = 0,
  maxRing = 5
): PathPoint & { shifted: boolean } {
  const start = worldToGrid(startX, startZ)
  if (!isOccupied(grid, start.row, start.col)) {
    return { x: startX, z: startZ, shifted: false }
  }

  for (let ring = 1; ring <= maxRing; ring += 1) {
    for (let dr = -ring; dr <= ring; dr += 1) {
      for (let dc = -ring; dc <= ring; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) {
          continue
        }

        const row = start.row + dr
        const col = start.col + dc
        if (row < 0 || row >= grid.gridCells || col < 0 || col >= grid.gridCells) {
          continue
        }

        if (!isOccupied(grid, row, col)) {
          const world = gridToWorld(row, col)
          return { ...world, shifted: true }
        }
      }
    }
  }

  const fallback = gridToWorld(start.row, start.col)
  return { ...fallback, shifted: true }
}
