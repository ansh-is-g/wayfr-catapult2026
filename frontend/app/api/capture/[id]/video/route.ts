import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase-server"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = getSupabase()

  const { data: session } = await supabase
    .from("capture_sessions")
    .select("status, video_storage_path")
    .eq("id", id)
    .maybeSingle<{ status: string; video_storage_path: string | null }>()

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }
  if (session.status !== "uploaded" || !session.video_storage_path) {
    return NextResponse.json({ error: "No video available" }, { status: 404 })
  }

  const { data, error } = await supabase.storage
    .from("capture-videos")
    .download(session.video_storage_path)

  if (error || !data) {
    return NextResponse.json(
      { error: `Download failed: ${error?.message}` },
      { status: 500 }
    )
  }

  const ext = session.video_storage_path.split(".").pop() || "mp4"
  const mimeType =
    ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : "video/mp4"

  return new NextResponse(data, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="recording.${ext}"`,
    },
  })
}
