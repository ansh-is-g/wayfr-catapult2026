import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase-server"

const MAX_VIDEO_MB = 500

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = getSupabase()

  const { data: session } = await supabase
    .from("capture_sessions")
    .select("id, status, expires_at")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string; expires_at: string }>()

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from("capture_sessions")
      .update({ status: "expired" } as never)
      .eq("id", id)
    return NextResponse.json({ error: "Session expired" }, { status: 410 })
  }

  if (session.status !== "waiting") {
    return NextResponse.json(
      { error: "Session already has an upload" },
      { status: 409 }
    )
  }

  const formData = await request.formData()
  const file = formData.get("video") as File | null

  if (!file) {
    return NextResponse.json({ error: "video file is required" }, { status: 400 })
  }
  if (!file.type.startsWith("video/")) {
    return NextResponse.json({ error: "File must be a video" }, { status: 400 })
  }
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `Video too large (max ${MAX_VIDEO_MB}MB)` },
      { status: 400 }
    )
  }

  const ext = file.name?.split(".").pop() || "mp4"
  const storagePath = `${id}/recording.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabase.storage
    .from("capture-videos")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    )
  }

  const { error: updateError } = await supabase
    .from("capture_sessions")
    .update({ status: "uploaded", video_storage_path: storagePath } as never)
    .eq("id", id)

  if (updateError) {
    await supabase.storage.from("capture-videos").remove([storagePath])
    return NextResponse.json(
      { error: `Update failed: ${updateError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
