export type Vec3 = [number, number, number]

export interface SimHome {
  homeId: string
  name: string
  status: string
  numObjects: number
  createdAt?: number
  updatedAt?: number
  error?: string | null
}

export interface SimTarget {
  id: string
  label: string
  trackId: number | null
  x: number
  y: number
  z: number
  bboxMin: Vec3 | null
  bboxMax: Vec3 | null
  confidence: number | null
  nObservations: number
  sizeM: Vec3
  hasHighlight: boolean
}

export interface ExactObjectHighlight {
  trackId: number
  label: string
  pointCount: number
  sampledPointCount: number
  sampledPoints: Vec3[]
  bbox3dMin: Vec3 | null
  bbox3dMax: Vec3 | null
  centroid3d: Vec3 | null
}

export interface OccupancyGrid {
  cellSizeM: number
  gridCells: number
  halfExtentM: number
  rows: boolean[][]
}

export interface PathPoint {
  x: number
  z: number
}

export interface NavigationPlanResult {
  homeId: string
  targetLabel: string
  target: {
    label: string
    x: number
    y: number
    z: number
    confidence: number | null
  } | null
  waypoints: Array<{
    x: number
    z: number
    distanceM: number
  }>
  instructions: string[]
  totalDistanceM: number
}

export interface TrainingEpisode {
  episode: number
  reward: number
  success: boolean
  collisions: number
  pathLengthM: number
  steps: number
  rollout: PathPoint[]
}

export interface TrainingPreview {
  target: SimTarget | null
  startPose: PathPoint
  teacherPath: PathPoint[]
  episodes: TrainingEpisode[]
  bestEpisode: TrainingEpisode
  summary: {
    successRate: number
    averageReward: number
    bestReward: number
    averageCollisions: number
  }
}

export interface Bounds3D {
  center: Vec3
  size: Vec3
  min: Vec3
  max: Vec3
}

export function getTargetBounds(target: SimTarget): Bounds3D {
  if (target.bboxMin && target.bboxMax) {
    const min = target.bboxMin
    const max = target.bboxMax
    return {
      min,
      max,
      size: [
        Math.max(0.08, Math.abs(max[0] - min[0])),
        Math.max(0.08, Math.abs(max[1] - min[1])),
        Math.max(0.08, Math.abs(max[2] - min[2])),
      ],
      center: [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ],
    }
  }

  const halfX = Math.max(0.15, target.sizeM[0] / 2)
  const halfY = Math.max(0.15, target.sizeM[1] / 2)
  const halfZ = Math.max(0.15, target.sizeM[2] / 2)
  return {
    center: [target.x, target.y, target.z],
    size: [halfX * 2, halfY * 2, halfZ * 2],
    min: [target.x - halfX, target.y - halfY, target.z - halfZ],
    max: [target.x + halfX, target.y + halfY, target.z + halfZ],
  }
}
