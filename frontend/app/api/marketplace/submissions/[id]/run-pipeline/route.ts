import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { getSupabase } from "@/lib/supabase-server"
import type { Profile } from "@/lib/marketplace-types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: submissionId } = await params
  const supabase = getSupabase()

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("clerk_id", userId)
    .maybeSingle<Pick<Profile, "id" | "role">>()

  if (!profile || profile.role !== "business") {
    return NextResponse.json(
      { error: "Only business accounts can run the pipeline" },
      { status: 403 }
    )
  }

  const { data: submission } = await supabase
    .from("contract_submissions")
    .select("id, contract_id, video_storage_path")
    .eq("id", submissionId)
    .maybeSingle<{
      id: string
      contract_id: string
      video_storage_path: string
    }>()

  if (!submission) {
    return NextResponse.json(
      { error: "Submission not found" },
      { status: 404 }
    )
  }

  // Verify the business owns this contract
  const { data: contract } = await supabase
    .from("contracts")
    .select("business_id, title")
    .eq("id", submission.contract_id)
    .maybeSingle<{ business_id: string; title: string }>()

  if (!contract || contract.business_id !== profile.id) {
    return NextResponse.json(
      { error: "You do not own this contract" },
      { status: 403 }
    )
  }

  // Download the video from Supabase Storage
  const { data: fileData, error: dlError } = await supabase.storage
    .from("marketplace-recordings")
    .download(submission.video_storage_path)

  if (dlError || !fileData) {
    return NextResponse.json(
      { error: `Failed to download video: ${dlError?.message}` },
      { status: 500 }
    )
  }

  // Parse the optional name from the request body
  let name = contract.title
  try {
    const body = await request.json()
    if (body.name) name = body.name
  } catch {
    // No body or invalid JSON is fine — use default name
  }

  // Forward to the FastAPI setup pipeline (POST /api/homes)
  const ext = submission.video_storage_path.split(".").pop() || "webm"
  const mimeType =
    ext === "mp4" ? "video/mp4" : ext === "mov" ? "video/quicktime" : "video/webm"

  const form = new FormData()
  form.append("video", new Blob([fileData], { type: mimeType }), `recording.${ext}`)
  form.append("name", name)

  const pipelineRes = await fetch(`${API_URL}/api/homes`, {
    method: "POST",
    body: form,
  })

  if (!pipelineRes.ok) {
    const err = await pipelineRes.json().catch(() => ({}))
    return NextResponse.json(
      {
        error: `Pipeline error: ${(err as { detail?: string }).detail || pipelineRes.statusText}`,
      },
      { status: pipelineRes.status }
    )
  }

  const result = await pipelineRes.json()
  return NextResponse.json(result, { status: 201 })
}
