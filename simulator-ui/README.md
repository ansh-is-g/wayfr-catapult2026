# simulator-ui

Standalone Next.js app for the robotics-style MVP demo built on top of the existing wayfr home APIs.

## What it does

- Loads mapped homes from the main backend
- Renders the saved `scene.glb` as a digital twin
- Overlays semantic object boxes and exact sampled highlight points when available
- Reuses `POST /api/navigation/plan` as the teacher path
- Runs a deterministic client-side training preview with reward and success metrics
- Exports a JSON sim bundle for demos

## Environment

Create `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Open `http://localhost:3001` or whichever port Next assigns.

## Notes

- This app intentionally avoids simulator-specific backend changes.
- The training loop is mocked for demo credibility and speed.
- Physics, USD, ROS, Habitat, and Isaac export are out of scope for this MVP.
