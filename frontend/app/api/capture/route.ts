import { NextResponse } from "next/server"
import os from "os"
import { getSupabase } from "@/lib/supabase-server"

function getLanIp(): string | null {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address
      }
    }
  }
  return null
}

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

  return NextResponse.json(
    { id: data.id, expires_at: data.expires_at, lan_ip: getLanIp() },
    { status: 201 }
  )
}
