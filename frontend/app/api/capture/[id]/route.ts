import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase-server"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from("capture_sessions")
    .select("id, status, expires_at, video_storage_path")
    .eq("id", id)
    .maybeSingle<{
      id: string
      status: string
      expires_at: string
      video_storage_path: string | null
    }>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  const expired = new Date(data.expires_at) < new Date()
  if (expired && data.status === "waiting") {
    await supabase
      .from("capture_sessions")
      .update({ status: "expired" } as never)
      .eq("id", id)
    return NextResponse.json({ id: data.id, status: "expired" })
  }

  return NextResponse.json({ id: data.id, status: data.status })
}
