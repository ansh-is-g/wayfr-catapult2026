import type {
  ExactObjectHighlight,
  NavigationPlanResult,
  SimHome,
  SimTarget,
  Vec3,
} from "@/lib/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

type HomeListResponse = {
  homes: Array<{
    home_id: string
    name: string
    status: string
    num_objects: number
    created_at?: number
  }>
}

type HomeResponse = {
  home_id: string
  name: string
  status: string
  num_objects: number
  created_at?: number
  updated_at?: number
  error?: string | null
}

type ObjectsResponse = {
  home_id: string
  objects: Array<{
    id: string
    label: string
    track_id?: number | null
    x: number
    y: number
    z: number
    bbox_min?: number[] | null
    bbox_max?: number[] | null
    confidence?: number | null
    n_observations?: number
  }>
}

type HighlightResponse = {
  track_id: number
  label: string
  point_count: number
  sampled_point_count: number
  sampled_points: number[][]
  bbox_3d_min?: number[] | null
  bbox_3d_max?: number[] | null
  centroid_3d?: number[] | null
}

type NavigationPlanResponse = {
  home_id: string
  target_label: string
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
    distance_m: number
  }>
  instructions: string[]
  total_distance_m: number
}

function toVec3(value: number[] | null | undefined): Vec3 | null {
  if (!value || value.length !== 3) {
    return null
  }

  return [Number(value[0]), Number(value[1]), Number(value[2])]
}

function deriveSizeM(bboxMin: Vec3 | null, bboxMax: Vec3 | null): Vec3 {
  if (bboxMin && bboxMax) {
    return [
      Math.max(0.08, Math.abs(bboxMax[0] - bboxMin[0])),
      Math.max(0.08, Math.abs(bboxMax[1] - bboxMin[1])),
      Math.max(0.08, Math.abs(bboxMax[2] - bboxMin[2])),
    ]
  }

  return [0.6, 0.6, 0.6]
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const body = (await res.json()) as { detail?: string }
      if (body?.detail) {
        detail = body.detail
      }
    } catch {
      // ignore parsing failure for non-JSON responses
    }
    throw new Error(detail)
  }

  return (await res.json()) as T
}

export function getApiUrl() {
  return API_URL
}

export function getSceneUrl(homeId: string) {
  return `${API_URL}/api/homes/${homeId}/scene`
}

export async function fetchHomes(): Promise<SimHome[]> {
  const data = await readJson<HomeListResponse>(await fetch(`${API_URL}/api/homes`, { cache: "no-store" }))
  return data.homes.map((home) => ({
    homeId: home.home_id,
    name: home.name,
    status: home.status,
    numObjects: home.num_objects,
    createdAt: home.created_at,
  }))
}

export async function fetchHome(homeId: string): Promise<SimHome> {
  const home = await readJson<HomeResponse>(await fetch(`${API_URL}/api/homes/${homeId}`, { cache: "no-store" }))
  return {
    homeId: home.home_id,
    name: home.name,
    status: home.status,
    numObjects: home.num_objects,
    createdAt: home.created_at,
    updatedAt: home.updated_at,
    error: home.error,
  }
}

export async function fetchTargets(homeId: string): Promise<SimTarget[]> {
  const data = await readJson<ObjectsResponse>(
    await fetch(`${API_URL}/api/homes/${homeId}/objects`, { cache: "no-store" })
  )

  return data.objects.map((obj) => {
    const bboxMin = toVec3(obj.bbox_min)
    const bboxMax = toVec3(obj.bbox_max)
    return {
      id: obj.id,
      label: obj.label,
      trackId: obj.track_id ?? null,
      x: Number(obj.x),
      y: Number(obj.y),
      z: Number(obj.z),
      bboxMin,
      bboxMax,
      confidence: obj.confidence ?? null,
      nObservations: obj.n_observations ?? 1,
      sizeM: deriveSizeM(bboxMin, bboxMax),
      hasHighlight: obj.track_id != null,
    }
  })
}

export async function fetchObjectHighlight(homeId: string, trackId: number): Promise<ExactObjectHighlight> {
  const data = await readJson<HighlightResponse>(
    await fetch(`${API_URL}/api/homes/${homeId}/object-highlights/${trackId}?sample_limit=1024`, {
      cache: "no-store",
    })
  )

  return {
    trackId: data.track_id,
    label: data.label,
    pointCount: data.point_count,
    sampledPointCount: data.sampled_point_count,
    sampledPoints: data.sampled_points
      .filter((point) => Array.isArray(point) && point.length === 3)
      .map((point) => [Number(point[0]), Number(point[1]), Number(point[2])] as Vec3),
    bbox3dMin: toVec3(data.bbox_3d_min),
    bbox3dMax: toVec3(data.bbox_3d_max),
    centroid3d: toVec3(data.centroid_3d),
  }
}

export async function planNavigation(
  homeId: string,
  targetLabel: string,
  currentX: number,
  currentZ: number
): Promise<NavigationPlanResult> {
  const data = await readJson<NavigationPlanResponse>(
    await fetch(`${API_URL}/api/navigation/plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        home_id: homeId,
        target_label: targetLabel,
        current_x: currentX,
        current_z: currentZ,
        heading_rad: 0,
      }),
    })
  )

  return {
    homeId: data.home_id,
    targetLabel: data.target_label,
    target: data.target,
    waypoints: data.waypoints.map((wp) => ({
      x: wp.x,
      z: wp.z,
      distanceM: wp.distance_m,
    })),
    instructions: data.instructions,
    totalDistanceM: data.total_distance_m,
  }
}
