import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { getSupabase } from "@/lib/supabase-server"
import type { Transaction } from "@/lib/marketplace-types"

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabase()

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, balance_cents")
    .eq("clerk_id", userId)
    .maybeSingle<{ id: string; balance_cents: number }>()

  if (!profile) {
    return NextResponse.json(
      { error: "Profile not found" },
      { status: 404 }
    )
  }

  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<Transaction[]>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    balance_cents: profile.balance_cents,
    transactions: transactions ?? [],
  })
}
