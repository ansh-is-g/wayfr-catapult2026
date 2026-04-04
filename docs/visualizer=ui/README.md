# Visualizer UI Notes

The final persona visualizer is still undecided. This folder documents the current frontend viewer stack that already exists in the app, so future UI work can integrate with the right components instead of rebuilding the renderer path from scratch.

## Current GLB viewer entrypoint

The current shared GLB visualizer is a React component:

- `frontend/components/scene/HomeSceneViewer.tsx`

This is the page-facing component used when the app wants to render a saved `scene.glb` with annotation boxes on top.

## Component chain

The current call chain is:

1. page or feature component
2. `HomeSceneViewer`
3. `HomeSceneInner`
4. `GlbSceneModel`

Supporting components are used depending on mode:

- `NavigationPath` renders the route line when navigation data exists.
- `ChaseCamera` is used when a path is active.
- `SceneAnnotationPanel` is not part of the render chain. It is a sibling UI control surface used by the dashboard.

## What each component does

### `frontend/components/scene/HomeSceneViewer.tsx`

This is the wrapper that pages import directly.

Responsibilities:

- accepts `homeId`, `glbUrl`, `sceneVersion`, `objects`, and optional path props
- resolves the actual scene asset URL
- prefers the local frontend route first when `homeId` is known
- falls back to the backend scene URL if local loading fails
- caches resolved scene assets in memory and in the browser Cache API
- passes the resolved `blob:` URL into the actual renderer

Important note:

- the renderer does not work directly on the raw backend URL after resolution
- both local and remote loads are converted to object URLs before rendering

### `frontend/components/scene/HomeSceneInner.tsx`

This owns the actual React Three Fiber scene.

Responsibilities:

- creates the `Canvas`
- configures lighting
- chooses orbit camera vs. chase camera
- renders object boxes and object labels
- overlays navigation visuals when `path` is present
- mounts `GlbSceneModel`

### `frontend/components/scene/GlbSceneModel.tsx`

This is the actual GLB loader.

Responsibilities:

- uses `GLTFLoader`
- clones the loaded scene
- normalizes materials
- counts mesh vertices
- renders the loaded scene through a Three primitive

## Local scene route

The local-first scene route is:

- `frontend/app/api/local-scenes/[homeId]/route.ts`

It reads:

- `SCENE_DATA_DIR/<homeId>/scene.glb`, if `SCENE_DATA_DIR` is defined
- otherwise `../backend/data/scenes/<homeId>/scene.glb`

This is why the frontend can render the locally stored GLB without always depending on the backend scene endpoint.

## Current pages using the visualizer

Today, the shared GLB viewer is used from:

- `frontend/app/dashboard/page.tsx`
- `frontend/app/setup/page.tsx`
- `frontend/app/navigate/page.tsx`

The persona page is now intentionally a mock chat surface and does not call the visualizer directly.

## When to use this stack

Use `HomeSceneViewer` when the UI needs:

- a saved room `scene.glb`
- the existing annotation boxes from `objects`
- optional navigation overlays

Do not use this stack for the capture preview flow. Capture uses a separate non-GLB scene path built around:

- `frontend/components/scene/World3DViewer.tsx`
- `frontend/components/scene/Scene3DInner.tsx`

That stack is point-cloud oriented and not the saved-room GLB viewer.

## Recommendation for future persona work

When the persona visualizer is finalized, the cleanest integration point is still `HomeSceneViewer`.

Two likely options:

1. pass persona-filtered `objects` into `HomeSceneViewer`
2. add a persona-specific wrapper around `HomeSceneViewer` that maps agent output into viewer props

That keeps the renderer shared while allowing the persona workflow to evolve independently.
