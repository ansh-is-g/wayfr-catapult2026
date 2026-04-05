import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { getSupabase } from "@/lib/supabase-server"
import type { Profile } from "@/lib/marketplace-types"

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("clerk_id", userId)
    .maybeSingle<Profile>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { role, display_name } = body as {
    role?: string
    display_name?: string
  }

  if (!role || !["business", "consumer"].includes(role)) {
    return NextResponse.json(
      { error: "role must be 'business' or 'consumer'" },
      { status: 400 }
    )
  }

  const supabase = getSupabase()

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_id", userId)
    .maybeSingle<{ id: string }>()

  if (existing) {
    return NextResponse.json(
      { error: "Profile already exists" },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      clerk_id: userId,
      role,
      display_name: display_name || "",
    } as never)
    .select()
    .single<Profile>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile: data }, { status: 201 })
}
