"""
Scene Bridge MVP — connects 2D detections from the video annotator
with 3D reconstruction data to produce objects anchored in 3D space.

Auto-discovers the latest completed jobs from both sibling MVPs.
Renders the result in a Viser 3D viewer with click-to-select.
"""

from __future__ import annotations

import json
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
import trimesh
import viser
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from bridge import compute_scene_objects, load_glb_points, summarize_scene_objects
from config import Settings
from schemas import (
    BridgeRequest,
    BridgeStatus,
    DiscoverResponse,
    PipelineJob,
    SceneObject,
)

settings = Settings()
settings.ensure_dirs()

# ---------------------------------------------------------------------------
# Viser 3D viewer
# ---------------------------------------------------------------------------

viser_server = viser.ViserServer(host="0.0.0.0", port=settings.viser_port)

DIM_GRAY = np.array([60, 60, 60], dtype=np.uint8)

viewer_state: dict[str, Any] = {
    "points": None,
    "colors": None,
    "scene_objects": [],
    "selected_track_id": None,
    "centroid": None,
    "up": None,
    "init_cam_pos": None,
    "object_colors": {},
    "base_point_size": 0.005,
    "scene_diag": 1.0,
}

MARKER_COLORS = [
    (255, 80, 80), (80, 200, 80), (80, 120, 255), (255, 200, 50),
    (200, 80, 255), (50, 220, 220), (255, 140, 50), (255, 100, 200),
    (120, 255, 120), (255, 80, 180), (80, 255, 200), (200, 200, 80),
]


def _estimate_up(cam_positions: np.ndarray, scene_centroid: np.ndarray) -> np.ndarray:
    if len(cam_positions) < 3:
        return np.array([0.0, -1.0, 0.0])
    centered = cam_positions - cam_positions.mean(axis=0)
    cov = centered.T @ centered
    _, eigenvectors = np.linalg.eigh(cov)
    up = eigenvectors[:, 0]
    if np.dot(up, cam_positions.mean(axis=0) - scene_centroid) < 0:
        up = -up
    return up / (np.linalg.norm(up) + 1e-8)


def _cone_apex(mesh: trimesh.Trimesh) -> np.ndarray:
    from collections import Counter
    faces = np.array(mesh.faces)
    counts = Counter(faces.flatten().tolist())
    apex_idx = max(counts, key=counts.get)
    return np.array(mesh.vertices[apex_idx])


def _clear_object_nodes(scene_objects: list[dict[str, Any]]) -> None:
    """Remove all per-object scene nodes (from a prior selection or load)."""
    for obj in scene_objects:
        tid = int(obj["track_id"])
        base = f"/objects/obj_{tid}"
        for suffix in ("points", "sphere", "label", "box"):
            try:
                viser_server.scene.remove_by_name(f"{base}/{suffix}")
            except Exception:
                pass


def _bbox_line_segments(bbox_min: np.ndarray, bbox_max: np.ndarray) -> np.ndarray:
    x1, y1, z1 = bbox_min.astype(np.float32)
    x2, y2, z2 = bbox_max.astype(np.float32)
    corners = np.array([
        [x1, y1, z1], [x2, y1, z1], [x2, y2, z1], [x1, y2, z1],
        [x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2],
    ], dtype=np.float32)
    edges = [
        (0, 1), (1, 2), (2, 3), (3, 0),
        (4, 5), (5, 6), (6, 7), (7, 4),
        (0, 4), (1, 5), (2, 6), (3, 7),
    ]
    return np.array([[corners[a], corners[b]] for a, b in edges], dtype=np.float32)


def load_scene_into_viser(
    glb_bytes: bytes,
    scene_objects: list[dict[str, Any]],
    npz_bytes: bytes | None = None,
    downsample: int = 8,
) -> None:
    points, colors = load_glb_points(glb_bytes)

    loaded = trimesh.load(BytesIO(glb_bytes), file_type="glb")
    cam_positions = []
    if isinstance(loaded, trimesh.Scene):
        for name, geom in loaded.geometry.items():
            transform = loaded.graph.get(name)
            if transform is not None:
                matrix, _ = transform
                geom = geom.copy()
                geom.apply_transform(matrix)
            if isinstance(geom, trimesh.Trimesh):
                cam_positions.append(_cone_apex(geom))

    if downsample > 1:
        idx = np.arange(0, len(points), downsample)
        ds_points = points[idx]
        ds_colors = colors[idx]
    else:
        ds_points = points
        ds_colors = colors

    centroid = ds_points.mean(axis=0)
    up = _estimate_up(
        np.array(cam_positions) if cam_positions else np.zeros((0, 3)),
        centroid,
    )

    bbox_extent = ds_points.max(axis=0) - ds_points.min(axis=0)
    scene_diag = float(np.linalg.norm(bbox_extent))

    if cam_positions:
        first_cam = cam_positions[0]
        look_dir = centroid - first_cam
        look_dir /= np.linalg.norm(look_dir) + 1e-8
        init_cam_pos = first_cam - look_dir * 0.3
    else:
        cam_distance = scene_diag * 0.8
        init_cam_pos = centroid + up * cam_distance

    base_point_size = 0.004 * (downsample ** 0.5)

    # Render the full scene cloud (slightly dimmed so objects pop)
    dimmed = (ds_colors.astype(np.float32) * 0.45).astype(np.uint8)
    viser_server.scene.add_point_cloud(
        name="/point_cloud",
        points=ds_points,
        colors=dimmed,
        point_size=base_point_size,
        point_shape="rounded",
    )

    # Camera frustums from the GLB cone meshes
    for ci, cam_pos in enumerate(cam_positions):
        viser_server.scene.add_icosphere(
            f"/cameras/cam_{ci:03d}",
            radius=base_point_size * 4,
            color=(80, 80, 180),
            position=cam_pos.astype(np.float32),
        )

    # NPZ camera frustums (higher fidelity, from reconstruction)
    npz_cam_positions = []
    if npz_bytes is not None:
        try:
            npz = np.load(BytesIO(npz_bytes))
            camera_poses = npz.get("camera_poses")
            if camera_poses is not None:
                for ci, pose in enumerate(camera_poses):
                    cam_pos_npz = pose[:3, 3].astype(np.float32)
                    npz_cam_positions.append(cam_pos_npz)
        except Exception:
            pass

    # Stable colors per track (used when an object is selected in the UI).
    obj_colors_map: dict[int, np.ndarray] = {}
    for i, obj in enumerate(scene_objects):
        tid = int(obj["track_id"])
        obj_colors_map[tid] = np.array(MARKER_COLORS[i % len(MARKER_COLORS)], dtype=np.uint8)

    # Set client cameras
    for client in viser_server.get_clients().values():
        client.camera.position = tuple(init_cam_pos)
        client.camera.look_at = tuple(centroid)
        client.camera.up_direction = tuple(up)

    viewer_state.update({
        "points": points,
        "colors": colors,
        "scene_objects": scene_objects,
        "selected_track_id": None,
        "centroid": centroid,
        "up": up,
        "init_cam_pos": init_cam_pos,
        "object_colors": obj_colors_map,
        "base_point_size": base_point_size,
        "scene_diag": scene_diag,
    })

    # Default: scene only — no object points, boxes, labels, or markers until the user selects one.
    highlight_object(None)

    print(
        f"[viser] Scene loaded: {len(ds_points):,} display points, "
        f"{len(scene_objects)} objects (hidden until selected), {len(cam_positions)} camera cones"
    )


def highlight_object(track_id: int | None) -> bool:
    scene_objects = viewer_state.get("scene_objects", [])
    if not scene_objects:
        return False

    points = viewer_state["points"]
    object_colors = viewer_state.get("object_colors") or {}
    up = viewer_state.get("up", np.array([0.0, -1.0, 0.0]))
    base_ps = float(viewer_state.get("base_point_size", 0.005))
    scene_diag = float(viewer_state.get("scene_diag", 1.0))

    _clear_object_nodes(scene_objects)

    if track_id is None:
        viewer_state["selected_track_id"] = None
        return True

    target_obj = next((o for o in scene_objects if o["track_id"] == track_id), None)
    if target_obj is None:
        viewer_state["selected_track_id"] = None
        return False

    tid = int(target_obj["track_id"])
    base_color = np.array(object_colors.get(tid, [200, 200, 200]), dtype=np.uint8)

    obj_idx = np.array(target_obj["point_indices"], dtype=np.int64)
    obj_pts = points[obj_idx]
    if len(obj_pts) == 0:
        viewer_state["selected_track_id"] = None
        return False

    color_tile = np.tile(base_color, (len(obj_pts), 1))
    viser_server.scene.add_point_cloud(
        name=f"/objects/obj_{tid}/points",
        points=obj_pts,
        colors=color_tile,
        point_size=base_ps * 2.0,
        point_shape="rounded",
    )

    c3d = np.array(target_obj["centroid_3d"], dtype=np.float32)
    sphere_radius = min(0.06, scene_diag * 0.012)
    viser_server.scene.add_icosphere(
        f"/objects/obj_{tid}/sphere",
        radius=sphere_radius * 1.3,
        color=tuple(int(c) for c in base_color),
        position=c3d,
    )
    viser_server.scene.add_label(
        name=f"/objects/obj_{tid}/label",
        text=f"{target_obj['label']} ({target_obj['n_points']:,} pts)",
        position=tuple(c3d + up * sphere_radius * 2.5),
    )

    bbox_min_arr = np.array(target_obj["bbox_3d_min"], dtype=np.float32)
    bbox_max_arr = np.array(target_obj["bbox_3d_max"], dtype=np.float32)
    if np.all(np.isfinite(bbox_min_arr)) and np.all(np.isfinite(bbox_max_arr)) and np.all(bbox_max_arr > bbox_min_arr):
        segs = _bbox_line_segments(bbox_min_arr, bbox_max_arr)
        seg_colors = np.tile(base_color, (len(segs), 2, 1))
        viser_server.scene.add_line_segments(
            name=f"/objects/obj_{tid}/box",
            points=segs,
            colors=seg_colors,
            line_width=3.0,
        )

    cam_offset = up * 0.4 + np.array([0.25, 0.0, 0.25])
    for client in viser_server.get_clients().values():
        client.camera.position = tuple(c3d + cam_offset)
        client.camera.look_at = tuple(c3d)
        client.camera.up_direction = tuple(up)

    viewer_state["selected_track_id"] = track_id
    return True


@viser_server.on_client_connect
def _on_client_connect(client: viser.ClientHandle):
    if viewer_state["centroid"] is not None:
        client.camera.position = tuple(viewer_state["init_cam_pos"])
        client.camera.look_at = tuple(viewer_state["centroid"])
        client.camera.up_direction = tuple(viewer_state["up"])


# ---------------------------------------------------------------------------
# Auto-discovery helpers
# ---------------------------------------------------------------------------

def _scan_jobs(data_dir: Path, source_label: str) -> list[PipelineJob]:
    jobs_dir = data_dir / "jobs"
    if not jobs_dir.exists():
        return []

    results: list[PipelineJob] = []
    for jf in sorted(jobs_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(jf.read_text())
        except Exception:
            continue
        if data.get("status") != "completed":
            continue
        results.append(PipelineJob(
            job_id=data["job_id"],
            status=data["status"],
            updated_at=data.get("updated_at", ""),
            metadata=data.get("metadata", {}),
            source=source_label,
        ))
    return results


def _resolve_recon_paths(job_id: str) -> tuple[Path, Path]:
    outputs = settings.recon_data_dir / "outputs"
    glb = outputs / f"{job_id}.glb"
    npz = outputs / f"{job_id}_scene_data.npz"
    return glb, npz


def _resolve_annotator_path(job_id: str) -> Path:
    return settings.annotator_data_dir / "outputs" / f"{job_id}_detections.json"


# ---------------------------------------------------------------------------
# Bridge state
# ---------------------------------------------------------------------------

bridge_results: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="Scene Bridge MVP")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/discover", response_model=DiscoverResponse)
async def discover():
    recon_jobs = _scan_jobs(settings.recon_data_dir, "reconstruction")
    annotator_jobs = _scan_jobs(settings.annotator_data_dir, "annotation")
    return DiscoverResponse(
        recon_jobs=recon_jobs,
        annotator_jobs=annotator_jobs,
    )


@app.post("/api/bridge", response_model=BridgeStatus)
async def start_bridge(req: BridgeRequest, background_tasks: BackgroundTasks):
    glb_path, npz_path = _resolve_recon_paths(req.recon_job_id)
    det_path = _resolve_annotator_path(req.annotator_job_id)

    missing = []
    if not glb_path.exists():
        missing.append(f"GLB: {glb_path}")
    if not npz_path.exists():
        missing.append(f"NPZ: {npz_path}")
    if not det_path.exists():
        missing.append(f"Detections: {det_path}")
    if missing:
        raise HTTPException(status_code=404, detail=f"Missing files: {'; '.join(missing)}")

    bridge_id = uuid.uuid4().hex[:12]
    bridge_results[bridge_id] = {
        "bridge_id": bridge_id,
        "status": "processing",
        "progress": 5,
        "message": "Starting bridge computation...",
        "recon_job_id": req.recon_job_id,
        "annotator_job_id": req.annotator_job_id,
        "objects": [],
        "error": None,
    }

    background_tasks.add_task(
        _run_bridge, bridge_id, glb_path, npz_path, det_path,
    )

    return BridgeStatus(**bridge_results[bridge_id])


def _run_bridge(bridge_id: str, glb_path: Path, npz_path: Path, det_path: Path):
    try:
        state = bridge_results[bridge_id]

        state["progress"] = 10
        state["message"] = "Loading files..."
        glb_bytes = glb_path.read_bytes()
        npz_bytes = npz_path.read_bytes()
        det_json = json.loads(det_path.read_text())

        state["progress"] = 30
        state["message"] = "Running 2D→3D bridge..."
        scene_objects = compute_scene_objects(glb_bytes, npz_bytes, det_json)

        state["progress"] = 70
        state["message"] = "Loading 3D viewer..."
        load_scene_into_viser(glb_bytes, scene_objects, npz_bytes=npz_bytes)

        out_path = settings.media_root / "bridges" / f"{bridge_id}_scene_objects.json"
        out_path.write_text(json.dumps(summarize_scene_objects(scene_objects), indent=2))

        state["status"] = "completed"
        state["progress"] = 100
        state["message"] = f"Bridge complete: {len(scene_objects)} objects found"
        state["objects"] = [
            SceneObject(
                track_id=o["track_id"],
                label=o["label"],
                centroid_3d=o["centroid_3d"],
                bbox_3d_min=o["bbox_3d_min"],
                bbox_3d_max=o["bbox_3d_max"],
                confidence=o["confidence"],
                n_observations=o["n_observations"],
                n_points=o["n_points"],
            ).model_dump()
            for o in scene_objects
        ]

    except Exception as exc:
        bridge_results[bridge_id]["status"] = "failed"
        bridge_results[bridge_id]["progress"] = 100
        bridge_results[bridge_id]["message"] = "Bridge failed."
        bridge_results[bridge_id]["error"] = str(exc)
        import traceback
        traceback.print_exc()


@app.get("/api/bridge/{bridge_id}", response_model=BridgeStatus)
async def get_bridge(bridge_id: str):
    if bridge_id not in bridge_results:
        raise HTTPException(status_code=404, detail="Unknown bridge_id")
    return BridgeStatus(**bridge_results[bridge_id])


@app.post("/api/bridge/{bridge_id}/select/{track_id}")
async def select_object(bridge_id: str, track_id: int):
    if bridge_id not in bridge_results:
        raise HTTPException(status_code=404, detail="Unknown bridge_id")
    ok = highlight_object(track_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Scene not loaded")
    return {"status": "ok", "track_id": track_id}


@app.post("/api/bridge/{bridge_id}/deselect")
async def deselect_object(bridge_id: str):
    if bridge_id not in bridge_results:
        raise HTTPException(status_code=404, detail="Unknown bridge_id")
    highlight_object(None)
    return {"status": "ok"}


FRONTEND_DIR = settings.backend_dir.parent / "frontend"

if FRONTEND_DIR.exists():
    @app.get("/")
    async def serve_index():
        return FileResponse(FRONTEND_DIR / "index.html")

    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")


if __name__ == "__main__":
    import uvicorn

    print(f"Viser running on http://localhost:{settings.viser_port}")
    print(f"API running on http://localhost:{settings.api_port}")
    print(f"Frontend at http://localhost:{settings.api_port}/")
    print(f"Recon data dir: {settings.recon_data_dir}")
    print(f"Annotator data dir: {settings.annotator_data_dir}")
    uvicorn.run(app, host="0.0.0.0", port=settings.api_port, log_level="info")
