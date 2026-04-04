"""
MapAnything on Modal — Video to 3D point cloud reconstruction.

Uses MapAnything (Meta/CMU) for feed-forward metric 3D reconstruction
from video frames. Outputs a GLB file with a colored point cloud and
camera cone meshes.

Deploy:  modal deploy reconstruction/app.py
Run:     modal run reconstruction/app.py --video-path ~/Desktop/video.mov
Batch:   modal run reconstruction/run_batch.py::batch --fps 5 --conf 20
"""

from __future__ import annotations

import pathlib
from typing import Any

import modal

APP_NAME = "scene-reconstructor"

app = modal.App(APP_NAME)

cuda_version = "12.4.0"
flavor = "devel"
os_version = "ubuntu22.04"
tag = f"{cuda_version}-{flavor}-{os_version}"

HF_MODEL_ID = "facebook/map-anything-apache"

mapanything_image = (
    modal.Image.from_registry(f"nvidia/cuda:{tag}", add_python="3.11")
    .apt_install("git", "ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.5.1",
        "torchvision==0.20.1",
        extra_index_url="https://download.pytorch.org/whl/cu124",
    )
    .pip_install(
        "numpy<2",
        "Pillow",
        "opencv-python",
        "tqdm",
        "huggingface_hub",
        "trimesh",
        "scipy",
    )
    .run_commands(
        "git clone https://github.com/facebookresearch/map-anything.git /opt/map-anything",
    )
    .run_commands(
        "cd /opt/map-anything && pip install -e .",
    )
    .env({
        "HF_HOME": "/opt/hf_cache",
        "TORCH_HOME": "/opt/torch_cache",
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
    })
    .run_commands(
        "python -c \""
        "from mapanything.models import MapAnything; "
        f"MapAnything.from_pretrained('{HF_MODEL_ID}'); "
        "print('MapAnything model downloaded OK')\"",
    )
    .run_commands(
        "python -c \""
        "import torch; "
        "from mapanything.models import MapAnything; "
        f"model = MapAnything.from_pretrained('{HF_MODEL_ID}').to('cuda'); "
        "print('MapAnything loaded on GPU OK')\"",
        gpu="any",
    )
)

with mapanything_image.imports():
    import json
    import os
    import tempfile


def _curate_frames(
    video_bytes: bytes,
    tmpdir: str,
    target_fps: int,
    max_frames: int = 120,
    blur_threshold: float = 50.0,
    novelty_threshold: float = 0.01,
):
    """Extract and curate frames for reconstruction quality.

    Two-stage approach:
      1. Decode at coarse interval, compute sharpness + color histogram per frame
      2. Greedy diverse selection: pick frames maximizing viewpoint novelty
         while rejecting blurry frames

    Returns (image_paths, source_fps, source_indices, curation_stats).
    """
    import cv2
    import numpy as np

    video_path = os.path.join(tmpdir, "input.mp4")
    with open(video_path, "wb") as f:
        f.write(video_bytes)

    images_dir = os.path.join(tmpdir, "images")
    os.makedirs(images_dir)

    cap = cv2.VideoCapture(video_path)
    source_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    frame_interval = max(1, int(source_fps / target_fps))

    # --- Stage A: decode candidate frames and compute quality metadata ---
    candidates = []
    raw_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if raw_idx % frame_interval == 0:
            small = cv2.resize(frame, (160, 120))
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            hist = cv2.calcHist([small], [0, 1, 2], None, [8, 8, 8], [0, 256] * 3)
            hist_norm = cv2.normalize(hist, None).flatten()
            candidates.append({
                "raw_idx": raw_idx,
                "frame": frame,
                "blur_score": blur_score,
                "hist": hist_norm,
            })
        raw_idx += 1
    cap.release()

    if not candidates:
        print(f"No frames decoded from {raw_idx} total")
        return [], source_fps, [], {"total_decoded": 0}

    # --- Stage B: curate via blur rejection + greedy diversity ---
    rejected_blur = 0
    rejected_dup = 0

    blur_scores = [c["blur_score"] for c in candidates]
    median_blur = float(np.median(blur_scores))
    adaptive_blur_thresh = min(blur_threshold, median_blur * 0.4)

    selected_indices: list[int] = []
    selected_hists: list[np.ndarray] = []

    # Always include first and last candidate
    bookend_ids = {0, len(candidates) - 1}

    for cid in bookend_ids:
        c = candidates[cid]
        if c["blur_score"] >= adaptive_blur_thresh:
            selected_indices.append(cid)
            selected_hists.append(c["hist"])

    remaining = max_frames - len(selected_indices)

    if remaining > 0:
        scored: list[tuple[float, int]] = []
        for cid, c in enumerate(candidates):
            if cid in bookend_ids:
                continue
            if c["blur_score"] < adaptive_blur_thresh:
                rejected_blur += 1
                continue
            blur_ok = 1.0 if c["blur_score"] > blur_threshold else 0.5
            scored.append((c["blur_score"] * blur_ok, cid))

        # Greedy diverse selection
        while len(selected_indices) < max_frames and scored:
            best_idx = -1
            best_score = -1.0

            for rank, (blur_s, cid) in enumerate(scored):
                c = candidates[cid]
                if selected_hists:
                    min_dist = min(
                        1.0 - float(np.dot(c["hist"], sh))
                        for sh in selected_hists
                    )
                else:
                    min_dist = 1.0

                combined = min_dist * (1.0 if c["blur_score"] > blur_threshold else 0.5)
                if combined > best_score:
                    best_score = combined
                    best_idx = rank

            if best_idx < 0 or best_score < novelty_threshold:
                rejected_dup += len(scored)
                break

            _, cid = scored.pop(best_idx)
            selected_indices.append(cid)
            selected_hists.append(candidates[cid]["hist"])

    selected_indices.sort()

    # --- Write selected frames to disk ---
    image_paths = []
    source_indices = []
    for out_idx, cid in enumerate(selected_indices):
        c = candidates[cid]
        path = os.path.join(images_dir, f"{out_idx:06d}.png")
        cv2.imwrite(path, c["frame"])
        image_paths.append(path)
        source_indices.append(c["raw_idx"])

    curation_stats = {
        "total_decoded": raw_idx,
        "candidates_at_fps": len(candidates),
        "rejected_blur": rejected_blur,
        "rejected_duplicate": rejected_dup,
        "selected": len(image_paths),
        "blur_threshold_used": round(adaptive_blur_thresh, 1),
    }
    print(
        f"Frame curation: {len(candidates)} candidates -> {len(image_paths)} selected "
        f"(blur_reject={rejected_blur}, dup_reject={rejected_dup}, "
        f"from {raw_idx} total at {source_fps:.1f} fps)"
    )
    return image_paths, source_fps, source_indices, curation_stats


def _build_camera_cone(position, look_dir, up, scale=0.08):
    """Build a small camera-cone mesh at the given position."""
    import numpy as np
    import trimesh

    forward = look_dir / (np.linalg.norm(look_dir) + 1e-8)
    right = np.cross(forward, up)
    right = right / (np.linalg.norm(right) + 1e-8)
    up_ortho = np.cross(right, forward)

    hw = scale * 0.6
    hh = scale * 0.45
    d = scale

    apex = position
    corners = np.array([
        position + forward * d + right * hw + up_ortho * hh,
        position + forward * d - right * hw + up_ortho * hh,
        position + forward * d - right * hw - up_ortho * hh,
        position + forward * d + right * hw - up_ortho * hh,
    ])

    vertices = np.vstack([apex, corners])
    faces = np.array([
        [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1],
        [1, 3, 2], [1, 4, 3],
    ])

    return trimesh.Trimesh(
        vertices=vertices, faces=faces,
        face_colors=[180, 180, 60, 200],
        process=False,
    )


def _fix_orientation(
    points: "np.ndarray",
    camera_poses: list["np.ndarray"],
) -> tuple["np.ndarray", "np.ndarray"]:
    """Compute a scene-adaptive orientation transform.

    Strategy:
      1. PCA on camera positions to find the thinnest spread axis (up direction)
      2. RANSAC-style floor plane detection on the lowest point stratum
      3. Build a 4x4 transform aligning the estimated up to +Y
      4. Falls back to 180-degree X rotation if fewer than 3 cameras

    Returns (orientation_transform_4x4, method_name).
    """
    import numpy as np

    fallback = np.eye(4)
    fallback[1, 1] = fallback[2, 2] = -1.0  # 180-deg X rotation

    if len(camera_poses) < 3:
        return fallback, "fallback_pi_rotation"

    cam_positions = np.array([p[:3, 3] for p in camera_poses])

    # PCA on camera positions: thinnest axis = up
    centered = cam_positions - cam_positions.mean(axis=0)
    cov = centered.T @ centered
    eigenvalues, eigenvectors = np.linalg.eigh(cov)
    pca_up = eigenvectors[:, 0].copy()

    # Orient up to point from scene centroid toward cameras
    scene_centroid = points.mean(axis=0)
    cam_mean = cam_positions.mean(axis=0)
    if np.dot(pca_up, cam_mean - scene_centroid) < 0:
        pca_up = -pca_up
    pca_up /= np.linalg.norm(pca_up) + 1e-8

    # Refine with RANSAC floor plane on lowest 20% of points
    method = "pca"
    if len(points) > 100:
        heights = points @ pca_up
        h_thresh = np.percentile(heights, 20)
        floor_candidates = points[heights <= h_thresh]

        if len(floor_candidates) >= 50:
            best_inliers = 0
            best_normal = pca_up.copy()
            rng = np.random.RandomState(42)
            n_iter = min(200, max(50, len(floor_candidates) // 10))
            inlier_dist = 0.02 * (heights.max() - heights.min() + 1e-6)

            for _ in range(n_iter):
                idx = rng.choice(len(floor_candidates), 3, replace=False)
                p0, p1, p2 = floor_candidates[idx]
                n = np.cross(p1 - p0, p2 - p0)
                norm_len = np.linalg.norm(n)
                if norm_len < 1e-10:
                    continue
                n = n / norm_len
                if np.dot(n, pca_up) < 0:
                    n = -n
                dists = np.abs((floor_candidates - p0) @ n)
                n_inliers = int((dists < inlier_dist).sum())
                if n_inliers > best_inliers:
                    best_inliers = n_inliers
                    best_normal = n.copy()

            if best_inliers > len(floor_candidates) * 0.3:
                pca_up = best_normal / (np.linalg.norm(best_normal) + 1e-8)
                method = "ransac_floor"

    # Build rotation matrix: align pca_up -> +Y
    target_up = np.array([0.0, 1.0, 0.0])
    v = np.cross(pca_up, target_up)
    c = float(np.dot(pca_up, target_up))

    if np.linalg.norm(v) < 1e-8:
        R = np.eye(3) if c > 0 else -np.eye(3)
    else:
        vx = np.array([
            [0, -v[2], v[1]],
            [v[2], 0, -v[0]],
            [-v[1], v[0], 0],
        ])
        R = np.eye(3) + vx + vx @ vx / (1.0 + c + 1e-10)

    transform = np.eye(4)
    transform[:3, :3] = R

    print(f"  Orientation fix: method={method}, up_est=[{pca_up[0]:.3f}, {pca_up[1]:.3f}, {pca_up[2]:.3f}]")
    return transform, method


def _densify_and_clean(
    points: "np.ndarray",
    colors: "np.ndarray",
    confidences: "np.ndarray",
    *,
    outlier_k: int = 20,
    outlier_std_ratio: float = 2.0,
    voxel_size: float = 0.0,
    conf_floor_percentile: float = 5.0,
) -> tuple["np.ndarray", "np.ndarray", dict]:
    """Post-reconstruction point cloud cleanup for showcase quality.

    Steps:
      1. Confidence-weighted filtering (remove lowest-confidence points)
      2. Statistical outlier removal via KDTree k-NN distance
      3. Voxel deduplication (keep highest-confidence point per voxel cell)

    Returns (cleaned_points, cleaned_colors, cleanup_stats).
    """
    import numpy as np
    from scipy.spatial import KDTree

    n_input = len(points)
    stats: dict = {"input_points": n_input}

    # --- 1. Confidence floor ---
    if len(confidences) == n_input and conf_floor_percentile > 0:
        floor = float(np.percentile(confidences, conf_floor_percentile))
        conf_mask = confidences >= floor
        points = points[conf_mask]
        colors = colors[conf_mask]
        confidences = confidences[conf_mask]
        stats["conf_floor_removed"] = int(n_input - len(points))
    else:
        stats["conf_floor_removed"] = 0

    # --- 2. Statistical outlier removal ---
    if len(points) > outlier_k + 1:
        tree = KDTree(points)
        dists, _ = tree.query(points, k=outlier_k + 1)
        mean_nn_dist = dists[:, 1:].mean(axis=1)
        mu = mean_nn_dist.mean()
        sigma = mean_nn_dist.std()
        threshold = mu + outlier_std_ratio * sigma
        inlier_mask = mean_nn_dist < threshold
        n_before = len(points)
        points = points[inlier_mask]
        colors = colors[inlier_mask]
        confidences = confidences[inlier_mask]
        stats["outliers_removed"] = int(n_before - len(points))
    else:
        stats["outliers_removed"] = 0

    # --- 3. Voxel deduplication ---
    if voxel_size > 0 and len(points) > 0:
        voxel_keys = np.floor(points / voxel_size).astype(np.int64)
        # Unique voxel cells; keep the highest-confidence point in each
        seen: dict[tuple, int] = {}
        for i in range(len(voxel_keys)):
            key = tuple(voxel_keys[i])
            if key not in seen or confidences[i] > confidences[seen[key]]:
                seen[key] = i
        keep_idx = np.array(sorted(seen.values()), dtype=np.int64)
        n_before = len(points)
        points = points[keep_idx]
        colors = colors[keep_idx]
        stats["voxel_dedup_removed"] = int(n_before - len(points))
    else:
        stats["voxel_dedup_removed"] = 0

    stats["output_points"] = len(points)
    print(
        f"  Cleanup: {n_input:,} -> {len(points):,} points "
        f"(conf={stats['conf_floor_removed']}, outlier={stats['outliers_removed']}, "
        f"voxel={stats['voxel_dedup_removed']})"
    )
    return points, colors, stats


def _extract_raw_points(predictions, conf_percentile: float):
    """Extract raw points, colors, confidences, and camera data from predictions.

    Returns (points, colors, confidences, camera_poses_np, camera_meshes, num_points_raw).
    """
    import numpy as np
    from mapanything.utils.geometry import depthmap_to_world_frame

    all_points = []
    all_colors = []
    all_confs = []
    camera_meshes = []
    camera_poses_np = []

    for view_idx, pred in enumerate(predictions):
        depthmap = pred["depth_z"][0].squeeze(-1)
        intrinsics = pred["intrinsics"][0]
        camera_pose = pred["camera_poses"][0]

        pts3d, valid_mask = depthmap_to_world_frame(depthmap, intrinsics, camera_pose)
        mask = pred["mask"][0].squeeze(-1).cpu().numpy().astype(bool)
        mask = mask & valid_mask.cpu().numpy()
        conf = pred["conf"][0].cpu().numpy()

        if conf_percentile > 0:
            valid_conf = conf[mask]
            if len(valid_conf) > 0:
                threshold = np.percentile(valid_conf, conf_percentile)
                mask = mask & (conf >= threshold)

        pts_np = pts3d.cpu().numpy()[mask]
        img_np = pred["img_no_norm"][0].cpu().numpy()[mask]
        colors = (img_np * 255).clip(0, 255).astype(np.uint8)
        conf_masked = conf[mask]

        all_points.append(pts_np)
        all_colors.append(colors)
        all_confs.append(conf_masked)

        pose_np = camera_pose.cpu().numpy()
        camera_poses_np.append(pose_np)
        cam_pos = pose_np[:3, 3]
        cam_forward = pose_np[:3, 2]
        cam_up = -pose_np[:3, 1]
        cone = _build_camera_cone(cam_pos, cam_forward, cam_up)
        camera_meshes.append(cone)

        if view_idx % 10 == 0:
            print(f"  View {view_idx}: {mask.sum():,} valid points")

    points = np.concatenate(all_points, axis=0)
    colors = np.concatenate(all_colors, axis=0)
    confidences = np.concatenate(all_confs, axis=0)
    print(f"Total raw: {len(points):,} points from {len(predictions)} views")

    return points, colors, confidences, camera_poses_np, camera_meshes


def _assemble_glb(points, colors, camera_meshes, orientation_transform):
    """Build a trimesh Scene and export as GLB bytes."""
    import numpy as np
    import trimesh

    scene = trimesh.Scene()
    colors_rgba = np.column_stack([colors, np.full(len(colors), 255, dtype=np.uint8)])
    pc = trimesh.PointCloud(vertices=points, colors=colors_rgba)
    scene.add_geometry(pc, geom_name="point_cloud")

    for i, cone in enumerate(camera_meshes):
        scene.add_geometry(cone, geom_name=f"camera_{i:04d}")

    scene.apply_transform(orientation_transform)
    return scene.export(file_type="glb")


def _build_glb_bridge(predictions, conf_percentile: float):
    """Build a bridge-safe GLB: exact geometry, minimal processing.

    Returns (glb_bytes, num_points, orientation_transform, camera_poses_np, method).
    """
    import numpy as np

    points, colors, confidences, camera_poses_np, camera_meshes = _extract_raw_points(
        predictions, conf_percentile,
    )

    orientation_transform, method = _fix_orientation(points, camera_poses_np)

    glb_bytes = _assemble_glb(points, colors, camera_meshes, orientation_transform)
    print(f"Bridge GLB: {len(points):,} points, {len(glb_bytes) / 1024 / 1024:.1f} MB")

    return glb_bytes, len(points), orientation_transform, camera_poses_np, method


def _build_glb_showcase(predictions, conf_percentile: float, voxel_size: float = 0.005):
    """Build a showcase GLB: cleaned, deduplicated, visually smooth.

    Returns (glb_bytes, num_points, cleanup_stats, orientation_transform, camera_poses_np, method).
    """
    import numpy as np

    points, colors, confidences, camera_poses_np, camera_meshes = _extract_raw_points(
        predictions, conf_percentile,
    )
    num_raw = len(points)

    orientation_transform, method = _fix_orientation(points, camera_poses_np)

    points, colors, cleanup_stats = _densify_and_clean(
        points, colors, confidences,
        outlier_k=20,
        outlier_std_ratio=2.0,
        voxel_size=voxel_size,
        conf_floor_percentile=5.0,
    )
    cleanup_stats["num_points_raw"] = num_raw

    glb_bytes = _assemble_glb(points, colors, camera_meshes, orientation_transform)
    print(f"Showcase GLB: {len(points):,} points, {len(glb_bytes) / 1024 / 1024:.1f} MB")

    return glb_bytes, len(points), cleanup_stats, orientation_transform, camera_poses_np, method


def _extract_scene_data(predictions, source_indices, conf_percentile, orientation_transform):
    """Collect depth maps, poses, intrinsics as compressed NPZ bytes."""
    import numpy as np
    from io import BytesIO

    depth_maps = []
    camera_poses = []
    intrinsics_list = []

    for pred in predictions:
        depth_maps.append(pred["depth_z"][0].squeeze(-1).cpu().numpy())
        camera_poses.append(pred["camera_poses"][0].cpu().numpy())
        intrinsics_list.append(pred["intrinsics"][0].cpu().numpy())

    buf = BytesIO()
    np.savez_compressed(
        buf,
        depth_maps=np.stack(depth_maps),
        camera_poses=np.stack(camera_poses),
        intrinsics=np.stack(intrinsics_list),
        source_frame_indices=np.array(source_indices, dtype=np.int32),
        world_transform=orientation_transform,
        conf_percentile=np.array(conf_percentile),
    )
    scene_bytes = buf.getvalue()
    print(f"Scene data NPZ: {len(scene_bytes) / 1024 / 1024:.1f} MB")
    return scene_bytes


@app.function(
    image=mapanything_image,
    gpu="A100-80GB",
    timeout=60 * 60,
    memory=65536,
)
def predict_video(
    video_bytes: bytes,
    fps: int = 2,
    conf_percentile: float = 25.0,
    export_mode: str = "both",
) -> dict[str, Any]:
    """
    Full MapAnything 3D reconstruction pipeline: video -> point cloud GLB(s).

    Args:
        video_bytes: Raw video file bytes.
        fps: Frames to extract per second (upper bound; curation may select fewer).
        conf_percentile: Confidence percentile cutoff (lower = more points, more noise).
        export_mode: "bridge" (geometry-faithful), "showcase" (cleaned/smooth),
                     or "both" (default).

    Returns:
        dict with glb, showcase_glb (optional), num_frames, num_points,
        scene_data, source_fps, curation_stats, cleanup_stats, orientation_method.
    """
    import torch
    from mapanything.models import MapAnything
    from mapanything.utils.image import load_images

    with tempfile.TemporaryDirectory() as tmpdir:
        print("Curating frames...")
        image_paths, source_fps, source_indices, curation_stats = _curate_frames(
            video_bytes, tmpdir, fps,
        )

        if len(image_paths) == 0:
            raise ValueError("No frames extracted from video")

        print(f"Loading MapAnything model...")
        model = MapAnything.from_pretrained(HF_MODEL_ID).to("cuda")

        print(f"Loading {len(image_paths)} images...")
        views = load_images(image_paths)

        print(f"Running inference on {len(views)} views...")
        predictions = model.infer(
            views,
            memory_efficient_inference=True,
            minibatch_size=1,
            use_amp=True,
            amp_dtype="bf16",
            apply_mask=True,
            mask_edges=True,
            apply_confidence_mask=False,
        )

        del model
        torch.cuda.empty_cache()

        # --- Build GLB(s) based on export_mode ---
        result: dict[str, Any] = {
            "num_frames": len(image_paths),
            "source_fps": source_fps,
            "curation_stats": curation_stats,
        }

        orientation_transform = None
        cleanup_stats: dict = {}

        if export_mode in ("bridge", "both"):
            print(f"Building bridge GLB (conf_percentile={conf_percentile})...")
            glb_bytes, num_points, orientation_transform, cam_poses, method = (
                _build_glb_bridge(predictions, conf_percentile)
            )
            result["glb"] = glb_bytes
            result["num_points"] = num_points
            result["orientation_method"] = method

        if export_mode in ("showcase", "both"):
            print(f"Building showcase GLB (conf_percentile={conf_percentile})...")
            sc_glb, sc_points, cleanup_stats, sc_orient, sc_cam_poses, sc_method = (
                _build_glb_showcase(predictions, conf_percentile)
            )
            result["showcase_glb"] = sc_glb
            result["showcase_num_points"] = sc_points
            result["cleanup_stats"] = cleanup_stats
            if orientation_transform is None:
                orientation_transform = sc_orient
                result["orientation_method"] = sc_method

        if export_mode == "showcase" and "glb" not in result:
            result["glb"] = result["showcase_glb"]
            result["num_points"] = result["showcase_num_points"]

        if orientation_transform is None:
            import numpy as np
            orientation_transform = np.eye(4)
            orientation_transform[1, 1] = orientation_transform[2, 2] = -1.0
            result["orientation_method"] = "fallback_pi_rotation"

        print("Extracting scene data...")
        scene_data_bytes = _extract_scene_data(
            predictions, source_indices, conf_percentile, orientation_transform,
        )
        result["scene_data"] = scene_data_bytes

    torch.cuda.empty_cache()

    glb_size = len(result.get("glb", b""))
    sc_size = len(result.get("showcase_glb", b""))
    print(
        f"Output: bridge={glb_size / 1024 / 1024:.1f}MB, "
        f"showcase={sc_size / 1024 / 1024:.1f}MB, "
        f"{result['num_frames']} frames, {result.get('num_points', 0):,} points"
    )

    return result


@app.function(
    image=mapanything_image,
    gpu="A100-80GB",
    timeout=60 * 60,
    memory=65536,
)
def reconstruct_scene(
    video_bytes: bytes,
    fps: int = 2,
    conf_percentile: float = 25.0,
    export_mode: str = "both",
) -> dict[str, Any]:
    """Alias for predict_video so the web backend can call by this name."""
    return predict_video.local(video_bytes, fps, conf_percentile, export_mode)


@app.local_entrypoint()
def main(
    video_path: str,
    fps: int = 2,
    conf: float = 25.0,
    outdir: str = "",
    export_mode: str = "both",
):
    """
    Run MapAnything 3D reconstruction on a local video.

    Usage:
      modal run reconstruction/app.py \\
        --video-path data/IMG_4723.MOV --fps 3 --conf 20 --export-mode both
    """
    video_p = pathlib.Path(video_path).expanduser().resolve()
    if not video_p.exists():
        print(f"File not found: {video_p}")
        return

    out_dir = pathlib.Path(outdir or ".").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Video: {video_p.name} ({video_p.stat().st_size / 1024 / 1024:.1f} MB)")
    print(f"FPS: {fps}, Confidence percentile: {conf}, Export mode: {export_mode}")

    result = predict_video.remote(video_p.read_bytes(), fps, conf, export_mode)

    out_glb = out_dir / f"{video_p.stem}.glb"
    out_glb.write_bytes(result["glb"])

    if result.get("showcase_glb"):
        out_showcase = out_dir / f"{video_p.stem}_showcase.glb"
        out_showcase.write_bytes(result["showcase_glb"])
        print(f"Showcase GLB: {out_showcase.name} ({len(result['showcase_glb']) / 1024 / 1024:.1f} MB)")

    if result.get("scene_data"):
        out_npz = out_dir / f"{video_p.stem}_scene_data.npz"
        out_npz.write_bytes(result["scene_data"])
        print(f"Scene data: {out_npz.name} ({len(result['scene_data']) / 1024 / 1024:.1f} MB)")

    if result.get("curation_stats"):
        stats = result["curation_stats"]
        print(f"Curation: {stats.get('candidates_at_fps', '?')} candidates -> "
              f"{stats.get('selected', '?')} selected")

    if result.get("cleanup_stats"):
        cs = result["cleanup_stats"]
        print(f"Cleanup: {cs.get('num_points_raw', '?')} raw -> {cs.get('output_points', '?')} cleaned")

    print(
        f"\n{video_p.name} -> {out_glb.name} "
        f"({len(result['glb']) / 1024 / 1024:.1f} MB, "
        f"{result['num_frames']} frames, "
        f"{result.get('num_points', 0):,} points, "
        f"orient={result.get('orientation_method', 'unknown')})"
    )
