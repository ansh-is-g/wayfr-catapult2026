import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase-server"

export async function POST() {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from("capture_sessions")
    .insert({})
    .select("id, status, expires_at")
    .single<{ id: string; status: string; expires_at: string }>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, expires_at: data.expires_at }, { status: 201 })
}
