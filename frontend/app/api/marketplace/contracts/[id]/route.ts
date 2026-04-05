import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { getSupabase } from "@/lib/supabase-server"
import type { Contract, Profile } from "@/lib/marketplace-types"

type ContractWithBusiness = Contract & {
  profiles: { display_name: string }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from("contracts")
    .select("*, profiles!business_id(display_name)")
    .eq("id", id)
    .maybeSingle<ContractWithBusiness>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("clerk_id", userId)
    .maybeSingle<Pick<Profile, "id" | "role">>()

  let userSubmission = null
  if (profile?.role === "consumer") {
    const { data: sub } = await supabase
      .from("contract_submissions")
      .select("id, created_at, payout_cents")
      .eq("contract_id", id)
      .eq("consumer_id", profile.id)
      .maybeSingle<{ id: string; created_at: string; payout_cents: number }>()
    userSubmission = sub
  }

  return NextResponse.json({
    contract: data,
    user_submission: userSubmission,
  })
}
