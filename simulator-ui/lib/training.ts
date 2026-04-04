import type {
  NavigationPlanResult,
  PathPoint,
  SimTarget,
  TrainingEpisode,
  TrainingPreview,
} from "@/lib/types"

function hashSeed(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits))
}

function polylineDistance(path: PathPoint[]) {
  let total = 0
  for (let index = 1; index < path.length; index += 1) {
    const prev = path[index - 1]
    const next = path[index]
    total += Math.hypot(next.x - prev.x, next.z - prev.z)
  }
  return total
}

function buildTeacherPath(startPose: PathPoint, plan: NavigationPlanResult): PathPoint[] {
  return [
    { x: round(startPose.x), z: round(startPose.z) },
    ...plan.waypoints.map((waypoint) => ({
      x: round(waypoint.x),
      z: round(waypoint.z),
    })),
  ]
}

function buildRollout(
  teacherPath: PathPoint[],
  noiseAmplitude: number,
  rng: () => number
): PathPoint[] {
  return teacherPath.map((point, index) => {
    if (index === 0) {
      return point
    }

    const taper = index === teacherPath.length - 1 ? 0.25 : 1
    const jitterX = (rng() - 0.5) * 2 * noiseAmplitude * taper
    const jitterZ = (rng() - 0.5) * 2 * noiseAmplitude * taper
    return {
      x: round(point.x + jitterX),
      z: round(point.z + jitterZ),
    }
  })
}

export function generateTrainingPreview({
  homeId,
  targetLabel,
  startPose,
  plan,
  target,
}: {
  homeId: string
  targetLabel: string
  startPose: PathPoint
  plan: NavigationPlanResult
  target: SimTarget | null
}): TrainingPreview {
  const teacherPath = buildTeacherPath(startPose, plan)
  const seed = hashSeed(`${homeId}|${targetLabel}|${round(startPose.x, 3)}|${round(startPose.z, 3)}`)
  const rng = mulberry32(seed)
  const episodeCount = 20
  const episodes: TrainingEpisode[] = []
  const denominator = Math.max(episodeCount - 1, 1)

  for (let index = 0; index < episodeCount; index += 1) {
    const progress = index / denominator
    const noiseAmplitude = 0.8 + (0.08 - 0.8) * progress
    const rollout = buildRollout(teacherPath, noiseAmplitude, rng)
    const collisions = Math.round(Math.max(0, 3 * (1 - progress) + rng() * 0.5 - 0.25))
    const successScore = 0.3 + 0.7 * progress + (rng() - 0.5) * 0.2
    const pathLengthM = round(polylineDistance(rollout))
    const steps = Math.max(8, Math.round(pathLengthM / 0.35))
    const success = collisions <= 1 && successScore >= 0.55
    const reward = round((success ? 120 : 20) - 12 * collisions - 1.8 * pathLengthM - 0.15 * steps)

    episodes.push({
      episode: index + 1,
      reward,
      success,
      collisions,
      pathLengthM,
      steps,
      rollout,
    })
  }

  const successfulEpisodes = episodes.filter((episode) => episode.success)
  const bestEpisode =
    successfulEpisodes.sort((left, right) => right.reward - left.reward)[0] ??
    [...episodes].sort((left, right) => right.reward - left.reward)[0]

  const successRate = round((episodes.filter((episode) => episode.success).length / episodes.length) * 100)
  const averageReward = round(
    episodes.reduce((total, episode) => total + episode.reward, 0) / Math.max(episodes.length, 1)
  )
  const averageCollisions = round(
    episodes.reduce((total, episode) => total + episode.collisions, 0) / Math.max(episodes.length, 1)
  )

  return {
    target,
    startPose,
    teacherPath,
    episodes,
    bestEpisode,
    summary: {
      successRate,
      averageReward,
      bestReward: bestEpisode.reward,
      averageCollisions,
    },
  }
}
