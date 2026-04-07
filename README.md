# wayfr

wayfr is a full-stack app for building navigable 3D home maps from walkthrough videos, inspecting anchored scene objects in the browser, generating simple navigation plans to named objects, and experimenting with persona overlays, capture flows, and World ID-gated marketplace features.

This README is written from the code in `frontend/` and `backend/`, not from the design or planning docs.

## What Exists In This Repo

### Frontend (`frontend/`)

Next.js App Router application with these main user-facing flows:

- `/` landing page with hero and dashboard preview
- `/setup` upload or record a walkthrough, submit it to the backend, and poll reconstruction status
- `/dashboard` inspect saved homes, reconstructed GLBs, and anchored objects
- `/navigate` request a route to a named object inside a reconstructed home
- `/capture` record or upload a short video and run the lightweight `/api/scan` flow
- `/personas` open the persona console UI
- `/marketplace` World ID-gated marketplace flow with profiles, contracts, submissions, and balances
- `/report` annotation/report UI stub

The frontend also includes server routes under `frontend/app/api` for:

- local scene discovery
- persona logging / detection / annotation
- World ID verification helpers
- marketplace profile, contract, submission, and balance operations
- capture upload helpers

### Backend (`backend/`)

FastAPI service with:

- REST routes for health, sessions, scanning, homes, navigation, hazards, and World ID verification
- a WebSocket endpoint at `/ws/{session_id}` for live frame ingestion and audio responses
- home setup orchestration that kicks off reconstruction, annotation, and localization reference building
- session management, narration synthesis, hazard lookups, TTS, and 3D scene processing helpers

### Pipelines (`backend/pipelines/`)

The repo also contains standalone pipeline projects used by the backend home-setup flow, including reconstruction, video annotation, localization, and related MVP viewers.

## Current Product Capabilities

Based on the code today, the product supports these main workflows:

1. Create a home map from video.
   Upload a walkthrough on `/setup`, create a home record, run background processing, poll status, then fetch the reconstructed GLB and object list when ready.

2. Browse reconstructed homes.
   `/dashboard` loads saved homes, displays their status, fetches object metadata, and renders the scene with object inspection panels and evidence imagery.

3. Generate object-based navigation plans.
   `/navigate` calls `POST /api/navigation/plan` to create waypoint-based instructions to a target label in a mapped home.

4. Run a lightweight scan flow.
   `/capture` records or uploads a video, sends it to `POST /api/scan`, receives merged 3D-positioned detections, and stores the result in local storage for quick visualization.

5. Stream real-time guidance over WebSockets.
   The backend accepts frame messages over `/ws/{session_id}`, runs frame processing, sends detections, hazard alerts, and synthesized audio back to the client.

6. Support persona and marketplace experiments.
   The frontend includes persona APIs and UI, plus a World ID-gated marketplace with roles, contracts, submissions, and balances backed by Supabase.

## Tech Stack

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Clerk
- Supabase JS
- Three.js / React Three Fiber / Drei
- World ID Kit

### Backend

- FastAPI
- Pydantic Settings
- Uvicorn
- Supabase Python client
- Upstash Redis
- Modal
- OpenCV
- NumPy / SciPy / Trimesh
- Boto3
- Replicate
- Google Cloud Vision
- Google Generative AI

## Repo Layout

```text
.
├── backend/
│   ├── api/               # FastAPI routes and WebSocket handler
│   ├── core/              # config, logging, errors
│   ├── db/                # Supabase client, schema, repositories, migrations
│   ├── ml/                # RCAC client
│   ├── models/            # Pydantic models
│   ├── services/          # narration, navigation, setup, hazards, vision
│   ├── pipelines/         # standalone reconstruction / annotation / HLoc projects
│   ├── pyproject.toml
│   └── .env.example
├── frontend/
│   ├── app/               # App Router pages and API routes
│   ├── components/        # landing, scene, personas, marketplace, ui
│   ├── lib/
│   ├── package.json
│   └── .env.example
└── README.md
```

## Backend API Surface

These routes are wired into `backend/main.py`:

### General

- `GET /health`
- `POST /sessions`
- `GET /sessions/{session_id}`
- WebSocket `/ws/{session_id}`

### Homes

- `POST /api/homes`
- `GET /api/homes`
- `GET /api/homes/{home_id}`
- `GET /api/homes/{home_id}/objects`
- `GET /api/homes/{home_id}/scene`
- `GET /api/homes/{home_id}/object-highlights/{track_id}`
- `GET /api/homes/{home_id}/object-evidence/{track_id}`
- `GET /api/homes/{home_id}/object-evidence/{track_id}/frames/{sampled_frame_idx}`
- `GET /api/homes/{home_id}/objects/{track_id}/evidence-frame`
- `POST /api/homes/{home_id}/localize`

### Navigation

- `POST /api/navigation/plan`

### Scan

- `POST /api/scan`

### Hazards / Verification

- `POST /hazards`
- `GET /hazards/nearby`
- `POST /verify/world-id`

## Local Development

### 1. Backend

From the repo root:

```bash
cd backend
cp .env.example .env
uv sync
uv run uvicorn main:app --reload
```

The backend runs on `http://localhost:8000`.

Notes:

- `backend/core/config.py` loads `backend/.env` automatically.
- Local scene and reference data default to `backend/data/scenes` and `backend/data/references`.
- Some routes work without every external integration configured, but health capabilities and advanced flows depend on the relevant API keys and services.

### 2. Frontend

In a second terminal:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

The frontend runs on `http://localhost:3000`.

## Required Environment Variables

Only include what you need for the flows you want to exercise.

### Minimum frontend

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### Frontend integrations

`frontend/.env.example` also supports:

- Supabase browser keys
- Supabase service key for server routes
- RCAC GenAI config for persona routes
- World ID app ID, relying party ID, and RP signing key
- Mapbox token

### Backend integrations

`backend/.env.example` includes configuration for:

- Modal credentials and app names for reconstruction / annotation / HLoc
- RCAC endpoint and API key
- RCAC GenAI config
- Gemini and Google Cloud Vision
- Replicate
- Cartesia TTS
- Supabase
- Upstash Redis
- World ID
- optional S3 storage for scene GLBs

## How Home Setup Works

The code path for home creation is:

1. `POST /api/homes` accepts a video upload and creates a home record.
2. The backend schedules `run_home_setup(...)` as a background task.
3. The setup pipeline orchestrates reconstruction, object annotation, and localization reference generation.
4. Generated artifacts are saved locally under the backend data directories.
5. Scene GLBs can also be uploaded to S3 or Supabase Storage when configured.
6. The frontend polls `GET /api/homes/{home_id}` until the home is `ready`.
7. The dashboard and navigate flows then use the stored GLB and object metadata.

## WebSocket Flow

The live session protocol in code looks like this:

1. Client connects to `/ws/{session_id}`.
2. Client sends JSON messages such as `ping`, `command`, and `frame`.
3. Frame messages may include base64 image data and GPS coordinates.
4. The backend processes the frame, checks nearby hazards, and updates session state.
5. The backend may return:
   - `session_update`
   - `pong`
   - `detections`
   - `hazard_alert`
   - `audio`

## Data And Storage

From the code, the app stores or reads from:

- Supabase Postgres for homes, objects, profiles, contracts, submissions, transactions, and persona history
- Supabase Storage for scene artifacts when configured
- local backend data directories for scene GLBs, reference bundles, and evidence frames
- optional S3 storage for scene GLBs
- Upstash Redis for cache / session-related services when configured
- browser local storage for quick capture-session data in the frontend scan flow

## Useful Commands

### Frontend

```bash
cd frontend
npm run dev
npm run build
npm run lint
```

### Backend

```bash
cd backend
uv sync
uv run uvicorn main:app --reload
uv run pytest
```

## Current Caveats

These are visible from the codebase today:

- CORS is currently configured with `allow_origins=["*"]` in the FastAPI app.
- The report page is a UI stub and does not submit to the backend hazard route yet.
- Many advanced flows depend on external services being configured correctly.
- Pipeline projects under `backend/pipelines/` are separate runtime units and may need their own deployment or setup beyond starting FastAPI.

## Security Note

Do not commit `.env` files or live credentials. If any real cloud keys were exposed locally or in version control, rotate them immediately.
