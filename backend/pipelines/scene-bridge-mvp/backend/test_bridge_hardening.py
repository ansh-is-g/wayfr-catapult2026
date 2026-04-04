from __future__ import annotations

import os
import sys
import unittest
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path

import numpy as np
import trimesh

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import bridge


def _mask_to_rle(mask: np.ndarray) -> dict[str, list[int]]:
    flat = mask.flatten(order="F").astype(np.uint8)
    diffs = np.diff(flat, prepend=0, append=0)
    starts = np.where(diffs != 0)[0]
    lengths = np.diff(starts)
    if flat[0] == 0:
        counts = lengths.tolist()
    else:
        counts = [0] + lengths.tolist()
    return {"size": [int(mask.shape[0]), int(mask.shape[1])], "counts": counts}


@contextmanager
def _temporary_env(**updates: str):
    original = {key: os.environ.get(key) for key in updates}
    try:
        for key, value in updates.items():
            os.environ[key] = value
        yield
    finally:
        for key, value in original.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


class BridgeHardeningTests(unittest.TestCase):
    def test_project_points_uses_inverse_world_transform(self) -> None:
        world_points = np.array([
            [0.0, 0.0, 2.0],
            [1.0, 0.0, 2.0],
        ], dtype=np.float64)
        transform = np.array([
            [0.0, -1.0, 0.0, 3.0],
            [1.0, 0.0, 0.0, -2.0],
            [0.0, 0.0, 1.0, 0.5],
            [0.0, 0.0, 0.0, 1.0],
        ], dtype=np.float64)
        world_h = np.column_stack([world_points, np.ones(len(world_points))])
        glb_points = (transform @ world_h.T).T[:, :3]

        intrinsics = np.array([
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0],
        ], dtype=np.float64)
        camera_pose = np.eye(4, dtype=np.float64)

        proj_u, proj_v, depth = bridge._project_points_to_frame(
            glb_points,
            camera_pose,
            intrinsics,
            transform,
        )

        np.testing.assert_allclose(depth, world_points[:, 2], atol=1e-6)
        np.testing.assert_allclose(proj_u, world_points[:, 0] / world_points[:, 2], atol=1e-6)
        np.testing.assert_allclose(proj_v, world_points[:, 1] / world_points[:, 2], atol=1e-6)

    def test_mask_bridge_prefers_mask_pixels_over_large_bbox(self) -> None:
        object_points = np.array([
            [0.0, 0.0, 2.0],
            [1.0, 0.0, 2.0],
            [0.0, 1.0, 2.0],
            [1.0, 1.0, 2.0],
        ], dtype=np.float32)
        background_points = np.array([
            [-3.0, -3.0, 4.0],
            [3.0, -3.0, 4.0],
            [-3.0, 3.0, 4.0],
            [3.0, 3.0, 4.0],
        ], dtype=np.float32)
        points = np.vstack([object_points, background_points])
        colors = np.tile(np.array([[255, 255, 255, 255]], dtype=np.uint8), (len(points), 1))

        scene = trimesh.Scene()
        scene.add_geometry(trimesh.PointCloud(vertices=points, colors=colors), geom_name="point_cloud")
        glb_bytes = scene.export(file_type="glb")

        depth_map = np.full((4, 4), 4.0, dtype=np.float32)
        depth_map[1:3, 1:3] = 2.0
        camera_pose = np.eye(4, dtype=np.float32)
        intrinsics = np.array([
            [2.0, 0.0, 1.5],
            [0.0, 2.0, 1.5],
            [0.0, 0.0, 1.0],
        ], dtype=np.float32)

        npz_buf = BytesIO()
        np.savez_compressed(
            npz_buf,
            depth_maps=np.stack([depth_map]),
            camera_poses=np.stack([camera_pose]),
            intrinsics=np.stack([intrinsics]),
            source_frame_indices=np.array([0], dtype=np.int32),
            world_transform=np.eye(4, dtype=np.float32),
            conf_percentile=np.array(25.0, dtype=np.float32),
        )

        mask = np.zeros((4, 4), dtype=np.uint8)
        mask[1:3, 1:3] = 1
        detections_json = {
            "frame_width": 4,
            "frame_height": 4,
            "tracks": [
                {
                    "track_id": 7,
                    "canonical_label": "chair",
                    "label_confidence": 0.91,
                    "bridge_eligible": True,
                }
            ],
            "frames": [
                {
                    "frame_idx": 0,
                    "detections": [
                        {
                            "track_id": 7,
                            "label": "chair",
                            "canonical_label": "chair",
                            "score": 0.91,
                            "bbox": [0, 0, 3, 3],
                            "mask_rle": _mask_to_rle(mask),
                        }
                    ],
                }
            ],
        }

        with _temporary_env(
            BRIDGE_MIN_OBSERVATIONS="1",
            BRIDGE_MIN_POINTS_PER_OBSERVATION="1",
            BRIDGE_MIN_POINTS_PER_OBJECT="1",
            BRIDGE_MAX_SCENE_FRACTION="1.0",
            BRIDGE_HARD_REJECT_SCENE_FRACTION="1.0",
        ):
            scene_objects = bridge.compute_scene_objects(
                glb_bytes,
                npz_buf.getvalue(),
                detections_json,
            )

        self.assertEqual(len(scene_objects), 1)
        self.assertEqual(scene_objects[0]["track_id"], 7)
        self.assertEqual(scene_objects[0]["label"], "chair")
        point_indices = set(scene_objects[0]["point_indices"])
        self.assertTrue(point_indices.issubset({0, 1, 2, 3}))
        self.assertGreaterEqual(len(point_indices), 3)

    def test_summary_strips_point_indices(self) -> None:
        summary = bridge.summarize_scene_objects([
            {
                "track_id": 1,
                "label": "chair",
                "centroid_3d": [0.0, 0.0, 0.0],
                "bbox_3d_min": [0.0, 0.0, 0.0],
                "bbox_3d_max": [1.0, 1.0, 1.0],
                "confidence": 0.9,
                "n_observations": 3,
                "n_points": 42,
                "point_indices": [1, 2, 3],
            }
        ])
        self.assertEqual(len(summary), 1)
        self.assertNotIn("point_indices", summary[0])


if __name__ == "__main__":
    unittest.main()
