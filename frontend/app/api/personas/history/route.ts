import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import { supabaseServer } from "@/lib/supabase-server"
import type { AnnotationPlan, PersonaProfile } from "@/lib/persona-types"

export const runtime = "nodejs"

export interface HistorySession {
  sessionId: string
  createdAt: string
  homeId: string
  homeName: string | null
  plan: AnnotationPlan
  persona: PersonaProfile | null
}

function getSceneRoot() {
  if (process.env.SCENE_DATA_DIR) return process.env.SCENE_DATA_DIR
  return path.resolve(process.cwd(), "..", "backend", "data", "scenes")
}

async function getLocalHomeIds(): Promise<Set<string>> {
  const root = getSceneRoot()
  const ids = new Set<string>()
  try {
    const entries = await readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (!/^[a-zA-Z0-9-]+$/.test(entry.name)) continue
      try {
        const st = await stat(path.join(root, entry.name, "scene.glb"))
        if (st.isFile()) ids.add(entry.name)
      } catch {
        /* no glb */
      }
    }
  } catch {
    /* missing root */
  }
  return ids
}

export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ sessions: [] })
  }

  const [{ data: plans, error }, localIds] = await Promise.all([
    supabaseServer
      .from("persona_annotation_plans")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    getLocalHomeIds(),
  ])

  if (error || !plans?.length) {
    return NextResponse.json({ sessions: [] })
  }

  // Keep only sessions where the home has a local GLB
  const filtered = plans.filter((p) => localIds.has(p.home_id as string))
  if (!filtered.length) return NextResponse.json({ sessions: [] })

  const sessionIds = [...new Set(filtered.map((p) => p.session_id as string))]

  const { data: profiles } = await supabaseServer
    .from("persona_profiles")
    .select("*")
    .in("session_id", sessionIds)

  const profileBySession = new Map(profiles?.map((p) => [p.session_id as string, p]) ?? [])

  const sessions: HistorySession[] = filtered.map((plan) => {
    const profile = profileBySession.get(plan.session_id as string) ?? null

    const annotationPlan: AnnotationPlan = {
      personaRole: plan.persona_role as string,
      summary: (plan.plan_summary as string) ?? "",
      annotations: (plan.annotations as AnnotationPlan["annotations"]) ?? [],
    }

    const persona: PersonaProfile | null = profile
      ? {
          role: profile.role as string,
          summary: (profile.summary as string) ?? "",
          primaryNeeds: (profile.primary_needs as string[]) ?? [],
          annotationFocus: (profile.annotation_focus as string[]) ?? [],
          derivedAnnotations: (profile.derived_annotations as PersonaProfile["derivedAnnotations"]) ?? [],
          colorScheme: (profile.color_scheme as PersonaProfile["colorScheme"]) ?? {
            primary: "#F5A623",
            secondary: "#4A90E2",
            danger: "#D0021B",
          },
          narrativeStyle: (profile.narrative_style as string) ?? "",
        }
      : null

    return {
      sessionId: plan.session_id as string,
      createdAt: plan.created_at as string,
      homeId: plan.home_id as string,
      homeName: (plan.home_name as string) ?? null,
      plan: annotationPlan,
      persona,
    }
  })

  return NextResponse.json({ sessions })
}
