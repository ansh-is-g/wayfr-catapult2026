import { readFile } from "node:fs/promises"
import path from "node:path"

import { NextResponse } from "next/server"

export const runtime = "nodejs"

function getSceneRoot() {
  if (process.env.SCENE_DATA_DIR) {
    return process.env.SCENE_DATA_DIR
  }

  return path.resolve(process.cwd(), "..", "backend", "data", "scenes")
}

function isValidHomeId(homeId: string) {
  return /^[a-zA-Z0-9-]+$/.test(homeId)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ homeId: string }> }
) {
  const { homeId } = await params

  if (!isValidHomeId(homeId)) {
    return NextResponse.json({ detail: "Invalid home id" }, { status: 400 })
  }

  const filePath = path.join(getSceneRoot(), homeId, "scene.glb")

  try {
    const bytes = await readFile(filePath)

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    })
  } catch {
    return NextResponse.json({ detail: "Scene not found" }, { status: 404 })
  }
}
