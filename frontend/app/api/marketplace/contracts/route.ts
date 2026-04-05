import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

import { getSupabase } from "@/lib/supabase-server"
import type { Contract, Profile } from "@/lib/marketplace-types"

const VALID_TYPES = [
  "house",
  "apartment",
  "office",
  "warehouse",
  "retail",
  "restaurant",
  "outdoor",
  "other",
]

type ContractWithBusiness = Contract & {
  profiles: { display_name: string }
}

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabase()
  const mine = request.nextUrl.searchParams.get("mine") === "true"

  if (mine) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_id", userId)
      .maybeSingle<{ id: string }>()

    if (!profile) {
      return NextResponse.json({ contracts: [] })
    }

    const { data, error } = await supabase
      .from("contracts")
      .select("*, profiles!business_id(display_name)")
      .eq("business_id", profile.id)
      .order("created_at", { ascending: false })
      .returns<ContractWithBusiness[]>()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ contracts: data })
  }

  const { data, error } = await supabase
    .from("contracts")
    .select("*, profiles!business_id(display_name)")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .returns<ContractWithBusiness[]>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ contracts: data })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabase()

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("clerk_id", userId)
    .maybeSingle<Pick<Profile, "id" | "role">>()

  if (!profile || profile.role !== "business") {
    return NextResponse.json(
      { error: "Only business accounts can create contracts" },
      { status: 403 }
    )
  }

  const body = await request.json()
  const {
    title,
    description,
    recording_type,
    total_slots,
    price_per_recording_cents,
  } = body as {
    title?: string
    description?: string
    recording_type?: string
    total_slots?: number
    price_per_recording_cents?: number
  }

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 })
  }
  if (!recording_type || !VALID_TYPES.includes(recording_type)) {
    return NextResponse.json(
      { error: `recording_type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    )
  }
  if (!total_slots || total_slots < 1 || !Number.isInteger(total_slots)) {
    return NextResponse.json(
      { error: "total_slots must be a positive integer" },
      { status: 400 }
    )
  }
  if (
    !price_per_recording_cents ||
    price_per_recording_cents < 100 ||
    !Number.isInteger(price_per_recording_cents)
  ) {
    return NextResponse.json(
      { error: "price_per_recording_cents must be at least 100 (i.e. $1.00)" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("contracts")
    .insert({
      business_id: profile.id,
      title: title.trim(),
      description: description?.trim() || "",
      recording_type,
      total_slots,
      price_per_recording_cents,
    } as never)
    .select()
    .single<Contract>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ contract: data }, { status: 201 })
}
