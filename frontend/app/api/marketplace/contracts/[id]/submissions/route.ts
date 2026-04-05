import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { getSupabase } from "@/lib/supabase-server"
import type { Profile } from "@/lib/marketplace-types"

interface SubmissionWithConsumer {
  id: string
  contract_id: string
  consumer_id: string
  video_storage_path: string
  payout_cents: number
  platform_fee_cents: number
  created_at: string
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

  const { id: contractId } = await params
  const supabase = getSupabase()

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("clerk_id", userId)
    .maybeSingle<Pick<Profile, "id" | "role">>()

  if (!profile) {
    return NextResponse.json(
      { error: "Profile not found" },
      { status: 404 }
    )
  }

  const { data: contract } = await supabase
    .from("contracts")
    .select("business_id")
    .eq("id", contractId)
    .maybeSingle<{ business_id: string }>()

  if (!contract) {
    return NextResponse.json(
      { error: "Contract not found" },
      { status: 404 }
    )
  }

  if (profile.role === "business" && contract.business_id !== profile.id) {
    return NextResponse.json(
      { error: "You do not own this contract" },
      { status: 403 }
    )
  }

  const { data: submissions, error } = await supabase
    .from("contract_submissions")
    .select("*, profiles!consumer_id(display_name)")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false })
    .returns<SubmissionWithConsumer[]>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const withUrls = await Promise.all(
    (submissions ?? []).map(async (sub) => {
      const { data: signed } = await supabase.storage
        .from("marketplace-recordings")
        .createSignedUrl(sub.video_storage_path, 3600)
      return { ...sub, video_url: signed?.signedUrl ?? null }
    })
  )

  return NextResponse.json({ submissions: withUrls })
}
