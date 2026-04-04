# Persona Annotation Implementation Plan

## Goal

Ship persona-specific annotation as an additive system on top of the existing reconstructed home model.

The base outputs remain:

- `scene.glb`
- `scene_data`
- `object_positions`

The new system adds:

- persona profiles
- agentic annotation generation jobs
- normalized persona overlay bundles
- frontend persona rendering

---

## Phase 0: Lock The Current Seam

### Objective

Use the existing home setup output as the stable input contract for persona generation.

### Current seam

- `backend/services/home_setup/pipeline.py`
- `backend/services/home_setup/bridge.py`
- `backend/api/routes/homes.py`
- `frontend/components/scene/HomeSceneViewer.tsx`

### Deliverables

- document the canonical snapshot shape
- define a deterministic `source_hash`
- do not change the current base setup contract

### Done when

- persona generation can be discussed entirely in terms of post-setup artifacts

---

## Phase 1: Data Model + Storage

### Objective

Create durable storage for persona profiles, jobs, and renderable annotations.

### Backend work

1. Add `backend/models/persona.py`
2. Add repository accessors under `backend/db/repositories/`
3. Add Supabase tables:
   - `persona_profiles`
   - `persona_annotation_jobs`
   - `persona_annotations`
4. Optionally add a denormalized bundle cache table

### Schema requirements

- `persona_profiles` linked to `home_id`
- `persona_annotations` linked to both `home_id` and `persona_id`
- `persona_annotations.object_position_id` nullable
- JSONB fields for `preferences`, `ui_style`, `evidence`

### Done when

- a persona can be created and fetched
- a persona annotation job record can be created and tracked
- annotations can be stored and queried without touching `object_positions`

---

## Phase 2: Agentic Annotation Pipeline

### Objective

Generate persona-specific annotations from the final model snapshot.

### New service module

- `backend/services/persona_annotations/orchestrator.py`

### Suggested submodules

- `agents/spatial_parser.py`
- `agents/safety_agent.py`
- `agents/navigation_agent.py`
- `agents/narrative_agent.py`
- `agents/caregiver_agent.py`
- `quality_gate.py`
- `normalizer.py`

### Execution flow

1. Load:
   - GLB bytes
   - `scene_data`
   - `object_positions`
   - persona profile
2. Build `source_hash`
3. Fan out specialist agents
4. Merge proposals
5. Validate proposals
6. Normalize into `PersonaAnnotation[]`
7. Persist results

### Hard rules

- never mutate `scene.glb`
- never overwrite canonical object rows
- every annotation must include evidence
- deduplicate semantically equivalent outputs

### Done when

- one persona can generate a stable annotation bundle from an existing home

---

## Phase 3: Background Job Integration

### Objective

Run persona generation automatically without blocking the base pipeline.

### Integration point

At the end of `run_home_setup(...)`:

1. persist base scene and objects
2. mark home `ready`
3. enqueue persona annotation jobs

### Job behavior

- default profile can be created automatically for the primary user
- additional personas can be generated on demand
- regeneration should be supported when:
  - profile changes
  - base scene changes
  - prompt pack or pipeline version changes

### Done when

- a finished home can trigger one or more persona jobs in the background

---

## Phase 4: API Layer

### Objective

Expose persona state and annotation bundles cleanly to the frontend.

### Endpoints

1. `POST /api/homes/{home_id}/personas`
2. `GET /api/homes/{home_id}/personas`
3. `GET /api/homes/{home_id}/personas/{persona_id}`
4. `POST /api/homes/{home_id}/personas/{persona_id}/annotations/regenerate`
5. `GET /api/homes/{home_id}/personas/{persona_id}/annotations`
6. `GET /api/homes/{home_id}/personas/{persona_id}/annotations/status`

### Optional

- SSE or WebSocket progress updates for long-running annotation jobs

### Done when

- the frontend can fetch persona bundles without accessing raw agent traces

---

## Phase 5: Frontend Scene Integration

### Objective

Render persona overlays in the existing 3D viewer.

### Existing viewer seam

- `HomeSceneViewer.tsx`
- `HomeSceneInner.tsx`

### New components

- `PersonaSwitcher`
- `PersonaAnnotationLayer`
- `PersonaAnnotationLegend`
- `PersonaAnnotationPanel`

### UI behavior

1. Fetch base GLB and objects as today.
2. Fetch persona bundle separately.
3. Render persona overlay as a layer above the canonical scene.
4. Toggle between:
   - canonical view
   - persona view

### Supported overlay types in first release

- pins
- halos
- focus panels
- safe / unsafe zones

### Done when

- the same home renders differently for two different personas without changing the base scene

---

## Phase 6: Product Surfaces

### `/setup`

Add:

- persona preview after processing
- selector for primary user / caregiver / trainer
- annotation legend and summary counts

### `/navigate`

Add:

- persona-aware route emphasis
- persona-specific highlighted landmarks
- persona-specific instruction framing

### `/dashboard`

Add:

- caregiver annotation lens
- risk cluster summaries
- repeated issue zones

### Done when

- persona annotation is visible in at least setup preview and navigation

---

## Phase 7: Visual Direction

### Objective

Make the frontend feel explicitly agentic and visually coherent with the persona system.

### Visual rules

- dark warm base
- mango as intelligence/accent color
- glowing mango “eyes” motif in the landing hero
- restrained status chips for agent roles
- overlays should feel precise, not noisy

### First concrete frontend pass

- update hero copy to describe persona-specific agentic annotation
- add glowing mango eye motif behind the hero scene
- add agent-role chips or panels

### Done when

- the landing hero communicates the product direction without adding runtime instability

---

## Phase 8: Evaluation + QA

### Objective

Validate that persona-specific output is useful, stable, and render-safe.

### Test strategy

#### Backend

- unit tests for normalization
- source-hash determinism tests
- deduplication tests
- evidence requirement tests

#### Frontend

- bundle parsing tests
- overlay rendering snapshots
- empty / failed persona fallback state tests

#### End-to-end

- process home
- create persona
- generate annotations
- fetch bundle
- render overlays

### Manual review checklist

- same object gets different persona-specific messaging
- no unanchored annotations
- no duplicate overlays
- canonical viewer still works without persona data
- failed persona job does not break the page

---

## Rollout Strategy

### Milestone 1

- profile storage
- job table
- static seeded persona bundle for one home
- frontend overlay rendering

### Milestone 2

- real orchestrator + subagents
- regeneration endpoint
- setup page persona preview

### Milestone 3

- navigate integration
- caregiver dashboard integration
- evaluation fixtures and prompt tuning

---

## Risks And Mitigations

## Risk: LLM output is too inconsistent

Mitigation:

- normalize into strict schema
- use quality gate
- store only validated outputs

## Risk: UI gets noisy

Mitigation:

- layer budget per persona
- merge nearby annotations
- visibility rules by mode

## Risk: Pipeline latency grows too much

Mitigation:

- generate persona layers asynchronously after `ready`
- cache by `source_hash`

## Risk: Persona data conflicts with canonical objects

Mitigation:

- canonical objects remain immutable
- persona layers reference canonical objects, never replace them

---

## Definition Of Complete

This initiative is complete when:

1. A finished home can spawn persona-specific annotation jobs.
2. Each persona has its own agent team and independent annotation bundle.
3. Bundles render as overlays on the existing GLB viewer.
4. Setup and navigation both expose persona-aware views.
5. The landing experience communicates the agentic/persona direction.
6. The frontend builds successfully with the new UI.
