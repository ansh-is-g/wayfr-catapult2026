# Persona-Specific Annotation System

## Purpose

This document specifies how wayfr should generate and render persona-specific annotations **after** the final annotated home model exists.

The core idea is:

1. Keep the reconstructed `.glb` and current 3D object map as the canonical spatial base layer.
2. Run a **persona-specific agent team** over that final model.
3. Persist the output as **annotation layers**, not as destructive edits to the base GLB.
4. Render those layers differently depending on the active persona in the frontend.

This preserves the current architecture while adding personalized, agentic interpretation on top of the same spatial truth.

---

## Current System Baseline

The current home setup flow already gives us the correct insertion point for persona annotations.

### Existing backend output

`backend/services/home_setup/pipeline.py` currently does this:

1. `call_reconstruct(video_bytes)` returns:
   - `glb`
   - `scene_data`
   - `num_frames`
   - `num_points`
   - `source_fps`
2. `call_annotate(video_bytes)` returns:
   - `detections_json`
   - optional annotated video artifacts
3. `compute_scene_objects(glb, scene_data, detections_json)` converts 2D detections into 3D scene objects.
4. `_bridge_objects_to_positions(...)` persists those 3D objects into `object_positions`.
5. The GLB is persisted as `scene.glb`.

### Existing persisted artifacts

The current final model state is split across two artifacts:

1. Base geometry:
   - `scene.glb`
   - Served by `GET /api/homes/{home_id}/scene`
2. Structured 3D objects:
   - `object_positions` rows
   - Served by `GET /api/homes/{home_id}/objects`

### Existing frontend consumption

`frontend/components/scene/HomeSceneViewer.tsx` and `HomeSceneInner.tsx` already render:

1. The GLB point cloud.
2. Anchored object boxes and labels.
3. Optional route/path overlays.

That means persona-specific annotation should be added as a **third render layer**:

1. Base point cloud
2. Canonical object anchors
3. Persona overlay bundle

---

## What The Persona Layer Should Do

The persona layer should answer:

- What matters to this user?
- How should the same object be described for this user?
- What should be emphasized, hidden, simplified, or expanded?
- What visual annotation should appear in the 3D scene for this persona?

Examples:

- A blind primary user may need direct obstacle/hazard callouts and route-safe regions.
- A caregiver may need monitoring summaries, blind spots, and escalation markers.
- An orientation and mobility trainer may want training cues and decision points.
- A low-vision persona may want high-contrast labels and room landmarks.

The same sofa, stove, doorway, or stair edge can produce different annotations depending on persona.

---

## Design Principles

### 1. The GLB stays immutable

Do not rewrite the final `.glb` for each persona.

Instead:

- Treat `scene.glb` as the base spatial artifact.
- Generate persona-specific annotations as metadata and overlay geometry.
- Version persona output independently from the base reconstruction.

### 2. Persona output is a separate bundle

Each persona gets an annotation bundle derived from:

- `scene.glb`
- `scene_data.npz`
- persisted `object_positions`
- optional route graph / hazard map / history

### 3. Agent outputs must reconcile into deterministic UI data

Subagents can propose annotations, but the final stored output must be normalized into a stable schema so the frontend can render it without running LLM logic in the browser.

### 4. Canonical spatial truth, personalized semantic interpretation

Spatial coordinates should remain shared.
Interpretation should vary by persona.

---

## Proposed Persona Agent Team

Each persona gets a dedicated orchestration job plus a small team of specialized subagents.

### Orchestrator Agent

Responsibilities:

- Load the final model context.
- Select the correct prompt pack for the persona.
- Fan out work to specialist subagents.
- Merge, rank, and normalize results.
- Reject low-confidence or contradictory annotations.

### Spatial Parsing Agent

Responsibilities:

- Understand the geometry and anchored object layout.
- Group nearby objects into landmarks, passages, and zones.
- Produce candidate annotation anchors and regions.

Inputs:

- `scene.glb`
- `scene_data`
- `object_positions`

Outputs:

- landmark candidates
- zone boundaries
- occlusion/blind-spot hypotheses

### Safety Agent

Responsibilities:

- Identify hazards, tight passages, drop-offs, heat sources, collision zones.
- Rank urgency per persona.

Outputs:

- `hazard`
- `caution`
- `safe-zone`
- `do-not-route`

### Navigation Agent

Responsibilities:

- Convert spatial layout into travel guidance semantics.
- Tag route decision points and transition zones.

Outputs:

- `decision-point`
- `turn-anchor`
- `route-landmark`
- `orientation-cue`

### Persona Narrative Agent

Responsibilities:

- Rewrite the same scene into persona-specific language.
- Control tone, density, reading level, confidence framing, and verbosity.

Outputs:

- short label
- expanded explanation
- voice-safe narration variant

### Caregiver / Support Agent

Used only for support-oriented personas.

Responsibilities:

- Identify supervision blind spots.
- Highlight objects likely to generate repeated navigation problems.
- Surface intervention and escalation summaries.

### Quality Gate Agent

Responsibilities:

- Check for duplicates, contradictions, unsupported claims, or annotations with no spatial anchor.
- Enforce UI-safe output schema.

This agent is the last step before persistence.

---

## Proposed Data Model

The current `home_maps` + `object_positions` model is not enough for persona layers.

Add the following logical entities.

## 1. `persona_profiles`

One row per persona per home.

Suggested fields:

```ts
type PersonaProfile = {
  id: string
  home_id: string
  name: string
  role: "primary_user" | "caregiver" | "trainer" | "guest" | "custom"
  mobility_mode: "blind" | "low_vision" | "sighted_support" | "custom"
  verbosity: "low" | "medium" | "high"
  risk_tolerance: "low" | "medium" | "high"
  tone: "direct" | "calm" | "technical" | "supportive"
  preferences: Record<string, unknown>
  created_at: string
  updated_at: string
}
```

## 2. `persona_annotation_jobs`

Tracks generation status.

```ts
type PersonaAnnotationJob = {
  id: string
  home_id: string
  persona_id: string
  source_hash: string
  status: "queued" | "running" | "ready" | "failed"
  model_version: string
  agent_trace: Record<string, unknown>
  error?: string | null
  created_at: string
  updated_at: string
}
```

## 3. `persona_annotations`

Normalized renderable annotation records.

```ts
type PersonaAnnotation = {
  id: string
  home_id: string
  persona_id: string
  object_position_id?: string | null
  layer:
    | "hazard"
    | "landmark"
    | "route"
    | "caregiver"
    | "training"
    | "context"
  kind:
    | "pin"
    | "halo"
    | "zone"
    | "path-segment"
    | "panel"
    | "ambient-signal"
  title: string
  summary: string
  narration_text?: string | null
  anchor_xyz: [number, number, number]
  extent_xyz?: [number, number, number] | null
  severity?: "info" | "low" | "medium" | "high" | "critical" | null
  confidence?: number | null
  visibility_rule?: "always" | "focused" | "navigation_only" | "caregiver_only"
  ui_style?: {
    color_token?: string
    icon?: string
    glow?: boolean
    pulse?: boolean
  }
  evidence?: {
    source_agents: string[]
    object_ids: string[]
    notes?: string[]
  }
  created_at: string
  updated_at: string
}
```

## 4. `persona_annotation_bundles`

Optional denormalized cache for fast frontend loading.

```ts
type PersonaAnnotationBundle = {
  persona_id: string
  home_id: string
  source_hash: string
  annotations: PersonaAnnotation[]
  stats: {
    total: number
    hazards: number
    landmarks: number
    routes: number
  }
}
```

---

## Backend Integration Point

## Recommended insertion point

Add persona generation after the current home setup pipeline has produced:

- `scene.glb`
- `scene_data`
- persisted `object_positions`

In practice, hook it at the end of `run_home_setup(...)`, after:

1. `_save_scene_glb_local(...)`
2. `_upload_scene_glb(...)`
3. `homes_repo.upsert_objects(...)`
4. `homes_repo.update_status(..., "ready")`

Then enqueue persona annotation generation as a background task.

### Why after `ready`

This is important:

- Reconstruction should not be blocked on persona generation.
- The base home should remain usable even if persona annotation fails.
- Persona layers should be refreshable independently from the base model.

---

## Proposed Backend Pipeline

```text
video
  -> reconstruct
  -> annotate
  -> bridge
  -> persist base GLB + object_positions
  -> home status = ready
  -> enqueue persona jobs
        -> orchestrator loads base model snapshot
        -> specialist subagents produce proposals
        -> quality gate normalizes output
        -> persist persona_annotations
        -> mark persona job ready
```

### Source hash

Every persona job should be tied to a deterministic source hash computed from:

- GLB bytes hash
- `scene_data` hash
- ordered object list hash
- persona profile hash
- annotation pipeline version

This guarantees:

- idempotent regeneration
- cacheability
- auditability

---

## API Additions

Keep the existing home endpoints unchanged.
Add persona endpoints alongside them.

### Persona management

`POST /api/homes/{home_id}/personas`

- create a persona profile

`GET /api/homes/{home_id}/personas`

- list personas for a home

`GET /api/homes/{home_id}/personas/{persona_id}`

- get a single persona profile

### Annotation generation

`POST /api/homes/{home_id}/personas/{persona_id}/annotations/regenerate`

- enqueue regeneration

`GET /api/homes/{home_id}/personas/{persona_id}/annotations`

- return normalized annotation bundle

`GET /api/homes/{home_id}/personas/{persona_id}/annotations/status`

- return job status and metadata

### Optional realtime channel

Use WebSocket or SSE to stream:

- `queued`
- `running`
- `agent_step_complete`
- `ready`
- `failed`

---

## Frontend Integration

The frontend should not parse raw agent output directly.
It should render the normalized bundle.

## Extend `HomeSceneViewer`

Add optional props:

```ts
type HomeSceneViewerProps = {
  glbUrl: string
  objects: ObjectItem[]
  personaAnnotations?: PersonaAnnotation[]
  activePersonaId?: string
  annotationMode?: "canonical" | "persona"
}
```

### Viewer rendering order

1. Base GLB point cloud
2. Canonical object boxes
3. Persona-specific overlays
4. Focus panel / sidecar HUD

### Persona overlay primitives

The current viewer already supports anchored labels.
Add persona-specific primitives:

- `pin`: anchored marker with label
- `halo`: glow around a key object or anchor
- `zone`: translucent 3D volume
- `path-segment`: colored route overlay
- `panel`: hover/focus detail card
- `ambient-signal`: low-opacity scene hint for caregiver mode

### Current pages that should consume persona data

#### `/setup`

After a home finishes processing:

- show the base scene
- default to canonical objects first
- allow selecting a persona to preview its annotation layer

#### `/navigate`

Use persona selection to affect:

- which labels are emphasized
- which hazards get priority
- how route instructions are phrased

#### `/dashboard`

Caregiver persona should show:

- blind spots
- repeated risk zones
- high-risk objects
- intervention notes

---

## Frontend Visual Direction

The persona system should feel explicitly agentic, not like a generic dashboard.

### Visual principles

- Warm dark surfaces with mango as the active intelligence color.
- High-contrast annotation halos and route ribbons.
- Agent status chips and orchestration traces should feel alive but restrained.
- Persona mode should feel like switching interpretive lenses over the same world model.

### Recommended hero / landing treatment

For the main landing surface:

- Use a mango-hued "glowing eyes" background motif.
- Present the system as a team of annotation agents over a 3D vector space.
- Use stacked status chips for agent roles like:
  - spatial parser
  - safety
  - route planner
  - caregiver lens

This is a visual framing device for the product direction.
It should not leak implementation complexity into the core workflow UI.

---

## Rendering Rules

Persona overlays must obey these constraints.

### Rule 1: Canonical truth wins

Persona annotations may reinterpret objects.
They may not invent unsupported geometry.

### Rule 2: Every annotation must have evidence

Each annotation must reference one or more of:

- object IDs
- anchor coordinates
- route segments
- hazard sources

### Rule 3: No duplicate noise

If five nearby obstacles produce the same practical advice, merge them into one higher-level annotation.

### Rule 4: The persona overlay must degrade gracefully

If persona generation fails:

- show the canonical scene
- show the base objects
- hide persona controls or mark them unavailable

---

## Example Persona Outputs

## Primary blind user

The stove may render as:

- title: `Hot surface`
- summary: `Keep right when passing this counter edge.`
- layer: `hazard`
- kind: `halo`
- severity: `high`

## Caregiver

The same stove may render as:

- title: `Frequent collision / burn risk`
- summary: `High-risk area near cooking zone. Check if path guidance should route wider here.`
- layer: `caregiver`
- kind: `panel`

## Mobility trainer

The same kitchen region may render as:

- title: `Training turn reference`
- summary: `Use counter edge as a right-hand landmark before the doorway.`
- layer: `training`
- kind: `pin`

---

## Recommended Implementation Sequence

### Phase 1

- Add persona profile storage.
- Add persona job status storage.
- Add persona annotation storage schema.

### Phase 2

- Build the orchestrator and specialist subagent pipeline.
- Normalize outputs into a stable `PersonaAnnotation` schema.

### Phase 3

- Add persona endpoints.
- Add regeneration and status flows.

### Phase 4

- Extend `HomeSceneViewer` with persona overlays.
- Add persona selector to `/setup`, `/navigate`, and caregiver surfaces.

### Phase 5

- Tune prompt packs and merge logic for each persona type.
- Add evaluation fixtures using a fixed GLB + object snapshot.

---

## Acceptance Criteria

The feature is complete when all of the following are true:

1. A home can be processed into the existing base GLB and object map without persona logic.
2. A persona can be created independently after the home is ready.
3. A persona annotation job can run on the final model snapshot without mutating the GLB.
4. The frontend can request and render persona annotations as an overlay layer.
5. Different personas render different annotation bundles over the same spatial model.
6. Failed persona generation does not break setup, navigation, or the base viewer.

---

## Recommended File / Module Additions

Backend:

- `backend/models/persona.py`
- `backend/services/persona_annotations/`
- `backend/services/persona_annotations/orchestrator.py`
- `backend/services/persona_annotations/agents/`
- `backend/api/routes/personas.py`

Frontend:

- `frontend/components/personas/PersonaSwitcher.tsx`
- `frontend/components/personas/PersonaAnnotationLegend.tsx`
- `frontend/components/scene/PersonaAnnotationLayer.tsx`
- `frontend/lib/personas.ts`

Docs:

- `docs/personas/PERSONA_ANNOTATION_SPEC.md`
- `docs/personas/PERSONA_ANNOTATION_IMPLEMENTATION_PLAN.md`

---

## Final Recommendation

Implement persona-specific annotation as a **versioned overlay system** on top of the final annotated model, not as persona-specific GLB generation.

That approach fits the current architecture best because:

- the current backend already produces the correct canonical artifacts
- the current frontend viewer already supports layered scene rendering
- persona generation can be asynchronous, repeatable, and independently evolvable
- multiple personas can share the same spatial truth while receiving different semantic guidance
