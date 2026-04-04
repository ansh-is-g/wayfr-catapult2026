"""
Home setup pipeline: orchestrates MapAnything + GSAM2 + HLoc + bridge
to build a 3D object map from a home walkthrough video.
"""

from __future__ import annotations

import asyncio
import json
import tempfile
from pathlib import Path
from typing import Any

from core.config import settings
from core.logging import get_logger
from db.repositories import homes as homes_repo
from models.home import ObjectPosition
from services.home_setup.bridge import build_scene_highlight_samples, compute_scene_objects
from services.home_setup.modal_clients import (
    call_annotate,
    call_build_reference,
    call_reconstruct,
)

logger = get_logger(__name__)

_REFERENCE_BUCKET = "home-references"
_SCENE_BUCKET = "home-scenes"

# ---------------------------------------------------------------------------
# Local disk storage (primary, always available)
# ---------------------------------------------------------------------------

def _scene_glb_local_path(home_id: str) -> Path:
    return Path(settings.scene_data_dir) / home_id / "scene.glb"


def _reference_local_path(home_id: str) -> Path:
    return Path(settings.reference_data_dir) / home_id / "reference.tar.gz"


def _scene_annotations_local_path(home_id: str) -> Path:
    return Path(settings.scene_data_dir) / home_id / "scene_annotations.json"


def _scene_evidence_manifest_local_path(home_id: str) -> Path:
    return Path(settings.scene_data_dir) / home_id / "object_evidence.json"


def _scene_evidence_frames_dir(home_id: str) -> Path:
    return Path(settings.scene_data_dir) / home_id / "object_evidence_frames"


def _scene_evidence_frame_local_path(home_id: str, track_id: int, sampled_frame_idx: int) -> Path:
    return _scene_evidence_frames_dir(home_id) / f"track-{track_id:04d}-sample-{sampled_frame_idx:05d}.jpg"


def _save_scene_glb_local(home_id: str, glb_bytes: bytes) -> None:
    """Write GLB to local disk. Raises on failure (pipeline gate)."""
    path = _scene_glb_local_path(home_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(glb_bytes)
    logger.info("scene_glb_saved_local", home_id=home_id, path=str(path), size_mb=round(len(glb_bytes) / 1e6, 1))


def _load_scene_glb_local(home_id: str) -> bytes | None:
    """Read GLB from local disk, or None if missing."""
    path = _scene_glb_local_path(home_id)
    if path.exists():
        return path.read_bytes()
    return None


def _save_scene_annotations_local(home_id: str, payload: dict[str, Any]) -> None:
    """Write lightweight object highlight data to local disk."""
    path = _scene_annotations_local_path(home_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    logger.info("scene_annotations_saved_local", home_id=home_id, path=str(path), n_objects=len(payload.get("objects", [])))


def _load_scene_annotations_local(home_id: str) -> dict[str, Any] | None:
    """Read local object highlight data, or None if missing."""
    path = _scene_annotations_local_path(home_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("scene_annotations_load_failed", home_id=home_id, error=str(exc))
        return None


def _save_scene_evidence_local(home_id: str, payload: dict[str, Any]) -> None:
    path = _scene_evidence_manifest_local_path(home_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    logger.info("scene_evidence_saved_local", home_id=home_id, path=str(path), n_tracks=len(payload.get("tracks", [])))


def _load_scene_evidence_local(home_id: str) -> dict[str, Any] | None:
    path = _scene_evidence_manifest_local_path(home_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("scene_evidence_load_failed", home_id=home_id, error=str(exc))
        return None


def _save_reference_local(home_id: str, tar_bytes: bytes) -> None:
    """Write HLoc reference tarball to local disk."""
    path = _reference_local_path(home_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(tar_bytes)
    logger.info("reference_saved_local", home_id=home_id, path=str(path), size_mb=round(len(tar_bytes) / 1e6, 1))


def _load_reference_local(home_id: str) -> bytes | None:
    """Read HLoc reference from local disk, or None if missing."""
    path = _reference_local_path(home_id)
    if path.exists():
        return path.read_bytes()
    return None

# ---------------------------------------------------------------------------
# Supabase cloud storage
# ---------------------------------------------------------------------------

async def _upload_scene_glb(home_id: str, glb_bytes: bytes) -> None:
    """Upload reconstructed GLB to Supabase Storage."""
    from db.client import get_supabase

    client = get_supabase()
    if client is None:
        raise RuntimeError("Supabase is not configured for scene GLB upload")
    path = f"{home_id}/scene.glb"
    client.storage.from_(_SCENE_BUCKET).upload(
        path,
        glb_bytes,
        {"content-type": "model/gltf-binary", "upsert": "true"},
    )
    logger.info("scene_glb_uploaded", home_id=home_id, size_mb=round(len(glb_bytes) / 1e6, 1))


async def _download_scene_glb(home_id: str) -> bytes | None:
    """Serve the scene GLB from local disk.

    The main home setup flow intentionally keeps scene GLBs local-only so large
    files do not fail against Supabase Storage size limits.
    """
    local = _load_scene_glb_local(home_id)
    if local is not None:
        logger.info("scene_glb_served_from_local", home_id=home_id)
        return local

    from db.client import get_supabase

    client = get_supabase()
    if client is not None:
        path = f"{home_id}/scene.glb"
        try:
            data = client.storage.from_(_SCENE_BUCKET).download(path)
            if data:
                return data
        except Exception as exc:
            logger.warning("scene_glb_cloud_download_failed", home_id=home_id, error=str(exc))

    return None


async def _upload_reference(home_id: str, tar_bytes: bytes) -> None:
    """Upload HLoc reference tarball to Supabase Storage (non-fatal cloud backup)."""
    from db.client import get_supabase

    client = get_supabase()
    if client is None:
        logger.warning("supabase_not_configured_skip_reference_upload")
        return
    path = f"{home_id}/reference.tar.gz"
    try:
        client.storage.from_(_REFERENCE_BUCKET).upload(
            path,
            tar_bytes,
            {"content-type": "application/gzip", "upsert": "true"},
        )
        logger.info("reference_uploaded", home_id=home_id, size_mb=round(len(tar_bytes) / 1e6, 1))
    except Exception as exc:
        logger.warning("reference_cloud_upload_failed", home_id=home_id, error=str(exc))


async def _download_reference(home_id: str) -> bytes | None:
    """Try Supabase first, fall back to local disk."""
    from db.client import get_supabase

    client = get_supabase()
    if client is not None:
        path = f"{home_id}/reference.tar.gz"
        try:
            data = client.storage.from_(_REFERENCE_BUCKET).download(path)
            if data:
                return data
        except Exception as exc:
            logger.warning("reference_cloud_download_failed", home_id=home_id, error=str(exc))

    local = _load_reference_local(home_id)
    if local is not None:
        logger.info("reference_served_from_local", home_id=home_id)
    return local


def _bridge_objects_to_positions(home_id: str, objects: list[dict]) -> list[ObjectPosition]:
    positions = []
    for obj in objects:
        cx, cy, cz = obj["centroid_3d"]
        positions.append(
            ObjectPosition(
                id="",  # DB generates UUID
                home_id=home_id,
                label=obj["label"],
                track_id=obj.get("track_id"),
                x=round(float(cx), 4),
                y=round(float(cy), 4),
                z=round(float(cz), 4),
                bbox_min=[round(v, 4) for v in obj["bbox_3d_min"]],
                bbox_max=[round(v, 4) for v in obj["bbox_3d_max"]],
                confidence=obj.get("confidence"),
                n_observations=obj.get("n_observations", 1),
            )
        )
    return positions


def _extract_video_frames(video_bytes: bytes, frame_indices: set[int]) -> dict[int, Any]:
    if not frame_indices:
        return {}

    import cv2

    ordered = sorted({int(idx) for idx in frame_indices if int(idx) >= 0})
    if not ordered:
        return {}

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_video:
        tmp_video.write(video_bytes)
        tmp_path = Path(tmp_video.name)

    frames: dict[int, Any] = {}
    try:
        cap = cv2.VideoCapture(str(tmp_path))
        for frame_idx in ordered:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ok, frame = cap.read()
            if ok and frame is not None:
                frames[frame_idx] = frame
        cap.release()
    finally:
        tmp_path.unlink(missing_ok=True)

    return frames


def _build_scene_evidence_payload(home_id: str, video_bytes: bytes, detections_json: dict[str, Any]) -> dict[str, Any]:
    import cv2

    tracks = detections_json.get("tracks")
    frames = detections_json.get("frames")
    if not isinstance(tracks, list) or not isinstance(frames, list):
        return {"version": 1, "tracks": []}

    frame_by_sample_idx: dict[int, dict[str, Any]] = {}
    detections_by_track: dict[int, list[dict[str, Any]]] = {}

    for frame_record in frames:
        if not isinstance(frame_record, dict):
            continue
        sampled_frame_idx = int(frame_record.get("sampled_frame_idx", -1))
        frame_by_sample_idx[sampled_frame_idx] = frame_record
        for detection in frame_record.get("detections", []) or []:
            if not isinstance(detection, dict) or detection.get("track_id") is None:
                continue
            track_id = int(detection["track_id"])
            detections_by_track.setdefault(track_id, []).append({
                "frame_record": frame_record,
                "detection": detection,
            })

    sampled_to_source: dict[int, int] = {}
    requested_source_frames: set[int] = set()
    for track in tracks:
        if not isinstance(track, dict) or track.get("track_id") is None:
            continue
        track_id = int(track["track_id"])
        candidate_sampled_frames = [
            int(frame_idx)
            for frame_idx in (track.get("best_frames") or [])
            if int(frame_idx) in frame_by_sample_idx
        ]
        if not candidate_sampled_frames:
            candidate_sampled_frames = [
                int(item["frame_record"].get("sampled_frame_idx", -1))
                for item in detections_by_track.get(track_id, [])
                if int(item["frame_record"].get("sampled_frame_idx", -1)) >= 0
            ]

        for sampled_frame_idx in candidate_sampled_frames[:3]:
            frame_record = frame_by_sample_idx.get(sampled_frame_idx)
            if not frame_record:
                continue
            source_frame_idx = int(frame_record.get("frame_idx", -1))
            if source_frame_idx < 0:
                continue
            sampled_to_source[sampled_frame_idx] = source_frame_idx
            requested_source_frames.add(source_frame_idx)

    source_frames = _extract_video_frames(video_bytes, requested_source_frames)
    frames_dir = _scene_evidence_frames_dir(home_id)
    frames_dir.mkdir(parents=True, exist_ok=True)

    tracks_payload: list[dict[str, Any]] = []
    for track in tracks:
        if not isinstance(track, dict) or track.get("track_id") is None:
            continue
        track_id = int(track["track_id"])
        label = str(track.get("canonical_label") or "unknown_object")
        evidence_frames: list[dict[str, Any]] = []

        candidate_sampled_frames = [
            int(frame_idx)
            for frame_idx in (track.get("best_frames") or [])
            if int(frame_idx) in frame_by_sample_idx
        ]
        if not candidate_sampled_frames:
            candidate_sampled_frames = [
                int(item["frame_record"].get("sampled_frame_idx", -1))
                for item in detections_by_track.get(track_id, [])
                if int(item["frame_record"].get("sampled_frame_idx", -1)) >= 0
            ]

        used_sampled_frames: set[int] = set()
        for sampled_frame_idx in candidate_sampled_frames:
            if sampled_frame_idx in used_sampled_frames or len(evidence_frames) >= 3:
                continue
            frame_record = frame_by_sample_idx.get(sampled_frame_idx)
            if not frame_record:
                continue

            detection = next(
                (
                    det
                    for det in frame_record.get("detections", []) or []
                    if isinstance(det, dict) and int(det.get("track_id", -1)) == track_id
                ),
                None,
            )
            if detection is None:
                continue

            source_frame_idx = sampled_to_source.get(sampled_frame_idx, int(frame_record.get("frame_idx", -1)))
            source_frame = source_frames.get(source_frame_idx)
            if source_frame is None:
                continue

            frame_image = source_frame.copy()
            bbox_raw = detection.get("bbox") or [0, 0, 0, 0]
            x1, y1, x2, y2 = [int(round(float(v))) for v in bbox_raw[:4]]
            x1 = max(0, min(x1, frame_image.shape[1] - 1))
            x2 = max(0, min(x2, frame_image.shape[1] - 1))
            y1 = max(0, min(y1, frame_image.shape[0] - 1))
            y2 = max(0, min(y2, frame_image.shape[0] - 1))
            if x2 > x1 and y2 > y1:
                overlay = frame_image.copy()
                cv2.rectangle(overlay, (x1, y1), (x2, y2), (35, 197, 94), thickness=-1)
                frame_image = cv2.addWeighted(overlay, 0.16, frame_image, 0.84, 0)
                cv2.rectangle(frame_image, (x1, y1), (x2, y2), (35, 197, 94), thickness=3)
            cv2.putText(
                frame_image,
                label.replace("_", " "),
                (max(12, x1), max(24, y1 - 10 if y1 > 24 else y1 + 24)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )

            asset_path = _scene_evidence_frame_local_path(home_id, track_id, sampled_frame_idx)
            cv2.imwrite(str(asset_path), frame_image, [int(cv2.IMWRITE_JPEG_QUALITY), 88])

            evidence_frames.append({
                "frame_idx": int(frame_record.get("frame_idx", source_frame_idx)),
                "sampled_frame_idx": sampled_frame_idx,
                "timestamp_sec": float(frame_record.get("timestamp_sec", 0.0)),
                "bbox": [float(v) for v in bbox_raw[:4]],
                "mask_quality": float(detection.get("mask_quality", 0.0)),
                "label_confidence": float(detection.get("score", track.get("label_confidence", 0.0)) or 0.0),
            })
            used_sampled_frames.add(sampled_frame_idx)

        tracks_payload.append({
            "track_id": track_id,
            "label": label,
            "label_confidence": float(track.get("label_confidence", 0.0) or 0.0),
            "frames_seen_count": int(track.get("frames_seen_count", 0) or 0),
            "evidence_strength": float(track.get("evidence_strength", 0.0) or 0.0),
            "frames": evidence_frames,
        })

    return {"version": 1, "tracks": tracks_payload}


async def run_home_setup(home_id: str, video_bytes: bytes) -> None:
    """
    Full home setup pipeline. Runs as a background task.
    Updates home_maps.status to 'ready' or 'failed' when done.
    """
    logger.info("home_setup_start", home_id=home_id, size_mb=round(len(video_bytes) / 1e6, 1))

    try:
        # Phase 1: run reconstruction + annotation in parallel
        recon_result, annot_result = await asyncio.gather(
            call_reconstruct(video_bytes),
            call_annotate(video_bytes),
        )

        # Phase 2: bridge 2D detections to 3D
        det_json_raw = annot_result.get("detections_json", "{}")
        if isinstance(det_json_raw, str):
            det_json: dict = json.loads(det_json_raw)
        else:
            det_json = det_json_raw

        objects = await asyncio.to_thread(
            compute_scene_objects,
            recon_result["glb"],
            recon_result["scene_data"],
            det_json,
        )
        logger.info("bridge_complete", home_id=home_id, n_objects=len(objects))

        # Phase 2b: persist GLB locally only. Scene files are too large for the
        # current Supabase Storage quota/limits on the free tier.
        _save_scene_glb_local(home_id, recon_result["glb"])
        _save_scene_annotations_local(
            home_id,
            build_scene_highlight_samples(recon_result["glb"], objects),
        )
        _save_scene_evidence_local(
            home_id,
            await asyncio.to_thread(_build_scene_evidence_payload, home_id, video_bytes, det_json),
        )

        # Phase 3: build HLoc reference (sequential — needs video)
        try:
            ref_result = await call_build_reference(video_bytes)
            _save_reference_local(home_id, ref_result["tar"])
            await _upload_reference(home_id, ref_result["tar"])
        except Exception as exc:
            logger.warning("hloc_reference_failed", home_id=home_id, error=str(exc))

        # Phase 4: persist to Supabase
        positions = _bridge_objects_to_positions(home_id, objects)
        await homes_repo.upsert_objects(home_id, positions)
        await homes_repo.update_status(home_id, "ready", num_objects=len(positions))
        logger.info("home_setup_complete", home_id=home_id, n_objects=len(positions))

    except Exception as exc:
        logger.error("home_setup_failed", home_id=home_id, error=str(exc))
        await homes_repo.update_status(home_id, "failed", error=str(exc))


async def get_reference_tar(home_id: str) -> bytes | None:
    """Retrieve the HLoc reference tar for a home (for localization)."""
    return await _download_reference(home_id)


async def get_scene_glb(home_id: str) -> bytes | None:
    """Retrieve the reconstructed GLB for a home (for 3D viewer)."""
    return await _download_scene_glb(home_id)


async def get_object_highlight(home_id: str, track_id: int, sample_limit: int = 768) -> dict[str, Any] | None:
    """Retrieve sampled exact object points for annotator highlighting."""
    payload = _load_scene_annotations_local(home_id)
    if payload is None:
        return None

    objects = payload.get("objects")
    if not isinstance(objects, list):
        return None

    for obj in objects:
        if int(obj.get("track_id", -1)) != int(track_id):
            continue

        sampled_points = obj.get("sampled_points") or []
        if sample_limit > 0 and len(sampled_points) > sample_limit:
            step = max(1, int(len(sampled_points) / sample_limit))
            sampled_points = sampled_points[::step][:sample_limit]

        return {
            "track_id": int(obj["track_id"]),
            "label": str(obj.get("label") or ""),
            "source": str(obj.get("source") or "bridge_point_indices"),
            "point_count": int(obj.get("point_count") or len(sampled_points)),
            "sampled_point_count": int(len(sampled_points)),
            "sample_limit": int(sample_limit),
            "bbox_3d_min": obj.get("bbox_3d_min"),
            "bbox_3d_max": obj.get("bbox_3d_max"),
            "centroid_3d": obj.get("centroid_3d"),
            "sampled_points": sampled_points,
        }

    return None


async def get_object_evidence(home_id: str, track_id: int) -> dict[str, Any] | None:
    payload = _load_scene_evidence_local(home_id)
    if payload is None:
        return None

    tracks = payload.get("tracks")
    if not isinstance(tracks, list):
        return None

    for track in tracks:
        if int(track.get("track_id", -1)) != int(track_id):
            continue

        frames_payload: list[dict[str, Any]] = []
        for frame in track.get("frames") or []:
            if not isinstance(frame, dict):
                continue
            sampled_frame_idx = int(frame.get("sampled_frame_idx", -1))
            if sampled_frame_idx < 0:
                continue
            asset_path = _scene_evidence_frame_local_path(home_id, track_id, sampled_frame_idx)
            frames_payload.append({
                "frame_idx": int(frame.get("frame_idx", -1)),
                "sampled_frame_idx": sampled_frame_idx,
                "timestamp_sec": float(frame.get("timestamp_sec", 0.0)),
                "bbox": frame.get("bbox"),
                "mask_quality": float(frame.get("mask_quality", 0.0)),
                "label_confidence": float(frame.get("label_confidence", 0.0)),
                "image_url": f"/api/homes/{home_id}/object-evidence/{track_id}/frames/{sampled_frame_idx}" if asset_path.exists() else None,
            })

        return {
            "track_id": int(track["track_id"]),
            "label": str(track.get("label") or ""),
            "label_confidence": float(track.get("label_confidence", 0.0)),
            "frames_seen_count": int(track.get("frames_seen_count", 0)),
            "evidence_strength": float(track.get("evidence_strength", 0.0)),
            "frames": frames_payload,
        }

    return None


def get_object_evidence_frame_path(home_id: str, track_id: int, sampled_frame_idx: int) -> Path | None:
    path = _scene_evidence_frame_local_path(home_id, track_id, sampled_frame_idx)
    if path.exists():
        return path
    return None
