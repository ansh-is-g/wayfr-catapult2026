"use client"

import { useEffect, useMemo } from "react"
import { useLoader } from "@react-three/fiber"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

export interface SceneFocusRegion {
  center: [number, number, number]
  bboxMin: [number, number, number]
  bboxMax: [number, number, number]
}

type SceneDisplayMode = "normal" | "ghost" | "isolate"

interface GlbSceneModelProps {
  url: string
  selectionRegion?: SceneFocusRegion | null
  hoverRegion?: SceneFocusRegion | null
  sceneDisplayMode?: SceneDisplayMode
  onLoad?: (vertexCount: number) => void
  onError?: (err: Error) => void
}

type AnnotatorUniforms = {
  uAnnotatorSelectionEnabled: { value: number }
  uAnnotatorSelectionMin: { value: THREE.Vector3 }
  uAnnotatorSelectionMax: { value: THREE.Vector3 }
  uAnnotatorSelectionCenter: { value: THREE.Vector3 }
  uAnnotatorSelectionColor: { value: THREE.Color }
  uAnnotatorContextDim: { value: number }
  uAnnotatorHoverEnabled: { value: number }
  uAnnotatorHoverMin: { value: THREE.Vector3 }
  uAnnotatorHoverMax: { value: THREE.Vector3 }
  uAnnotatorHoverCenter: { value: THREE.Vector3 }
  uAnnotatorHoverColor: { value: THREE.Color }
}

const DISABLED_MIN = new THREE.Vector3(1_000_000, 1_000_000, 1_000_000)
const DISABLED_MAX = new THREE.Vector3(-1_000_000, -1_000_000, -1_000_000)
const DISABLED_CENTER = new THREE.Vector3(0, 0, 0)
const SELECTED_COLOR = new THREE.Color("#f6b54c")
const HOVER_COLOR = new THREE.Color("#8fd8ff")

function createAnnotatorUniforms(): AnnotatorUniforms {
  return {
    uAnnotatorSelectionEnabled: { value: 0 },
    uAnnotatorSelectionMin: { value: DISABLED_MIN.clone() },
    uAnnotatorSelectionMax: { value: DISABLED_MAX.clone() },
    uAnnotatorSelectionCenter: { value: DISABLED_CENTER.clone() },
    uAnnotatorSelectionColor: { value: SELECTED_COLOR.clone() },
    uAnnotatorContextDim: { value: 0.56 },
    uAnnotatorHoverEnabled: { value: 0 },
    uAnnotatorHoverMin: { value: DISABLED_MIN.clone() },
    uAnnotatorHoverMax: { value: DISABLED_MAX.clone() },
    uAnnotatorHoverCenter: { value: DISABLED_CENTER.clone() },
    uAnnotatorHoverColor: { value: HOVER_COLOR.clone() },
  }
}

function applyAnnotatorPatch<T extends THREE.Material>(material: T): T {
  if (material.userData.__annotatorPatchApplied) {
    return material
  }

  const uniforms = createAnnotatorUniforms()
  material.userData.__annotatorPatchApplied = true
  material.userData.__annotatorUniforms = uniforms

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vAnnotatorWorldPosition;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvAnnotatorWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;"
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vAnnotatorWorldPosition;
uniform float uAnnotatorSelectionEnabled;
uniform vec3 uAnnotatorSelectionMin;
uniform vec3 uAnnotatorSelectionMax;
uniform vec3 uAnnotatorSelectionCenter;
uniform vec3 uAnnotatorSelectionColor;
uniform float uAnnotatorContextDim;
uniform float uAnnotatorHoverEnabled;
uniform vec3 uAnnotatorHoverMin;
uniform vec3 uAnnotatorHoverMax;
uniform vec3 uAnnotatorHoverCenter;
uniform vec3 uAnnotatorHoverColor;

float annotatorSoftBoxMask(vec3 p, vec3 bmin, vec3 bmax, float feather) {
  vec3 center = 0.5 * (bmin + bmax);
  vec3 halfSize = max(0.5 * (bmax - bmin), vec3(0.001));
  vec3 q = abs(p - center) - halfSize;
  float outside = length(max(q, 0.0));
  float inside = min(max(q.x, max(q.y, q.z)), 0.0);
  float sdf = outside + inside;
  return 1.0 - smoothstep(0.0, feather, sdf);
}

float annotatorEllipsoidMask(vec3 p, vec3 center, vec3 bmin, vec3 bmax, float expand) {
  vec3 radii = max(0.5 * (bmax - bmin) + vec3(expand), vec3(0.08));
  vec3 q = (p - center) / radii;
  float dist = dot(q, q);
  return 1.0 - smoothstep(1.0, 1.55, dist);
}

float annotatorRegionMask(vec3 p, vec3 center, vec3 bmin, vec3 bmax, float feather, float expand) {
  float boxMask = annotatorSoftBoxMask(p, bmin, bmax, feather);
  float ellipsoidMask = annotatorEllipsoidMask(p, center, bmin, bmax, expand);
  return clamp(max(boxMask, ellipsoidMask), 0.0, 1.0);
}
`
      )
      .replace(
        "gl_FragColor = vec4( outgoingLight, diffuseColor.a );",
        `
vec3 annotatorColor = outgoingLight;
float annotatorSelectionMask = 0.0;
float annotatorHoverMask = 0.0;

if (uAnnotatorSelectionEnabled > 0.5) {
  annotatorSelectionMask = annotatorRegionMask(
    vAnnotatorWorldPosition,
    uAnnotatorSelectionCenter,
    uAnnotatorSelectionMin,
    uAnnotatorSelectionMax,
    0.12,
    0.08
  );
}

if (uAnnotatorHoverEnabled > 0.5) {
  annotatorHoverMask = annotatorRegionMask(
    vAnnotatorWorldPosition,
    uAnnotatorHoverCenter,
    uAnnotatorHoverMin,
    uAnnotatorHoverMax,
    0.10,
    0.05
  ) * (1.0 - annotatorSelectionMask);
}

if (uAnnotatorSelectionEnabled > 0.5) {
  float annotatorKeep = max(annotatorSelectionMask, annotatorHoverMask * 0.35);
  annotatorColor *= mix(uAnnotatorContextDim, 1.0, annotatorKeep);
  annotatorColor = mix(
    annotatorColor,
    annotatorColor * 1.18 + uAnnotatorSelectionColor * 0.22,
    annotatorSelectionMask
  );
  annotatorColor += uAnnotatorSelectionColor * annotatorSelectionMask * 0.05;
} else if (uAnnotatorHoverEnabled > 0.5) {
  annotatorColor *= mix(0.82, 1.0, annotatorHoverMask);
}

annotatorColor = mix(
  annotatorColor,
  annotatorColor * 1.08 + uAnnotatorHoverColor * 0.12,
  annotatorHoverMask
);

gl_FragColor = vec4( annotatorColor, diffuseColor.a );
`
      )
  }

  material.customProgramCacheKey = () => `${material.type}-annotator-focus-v1`
  material.needsUpdate = true
  return material
}

function buildMeshMaterial(material: THREE.Material, hasVertexColors: boolean) {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshBasicMaterial
  ) {
    const next = material.clone() as
      | THREE.MeshStandardMaterial
      | THREE.MeshPhongMaterial
      | THREE.MeshLambertMaterial
      | THREE.MeshBasicMaterial

    if ("vertexColors" in next) {
      next.vertexColors = hasVertexColors
    }

    if ("metalness" in next) {
      next.metalness = 0
    }

    if ("roughness" in next) {
      next.roughness = 1
    }

    return applyAnnotatorPatch(next)
  }

  return applyAnnotatorPatch(
    new THREE.MeshStandardMaterial({
      color: hasVertexColors ? 0xffffff : 0xd4cec4,
      vertexColors: hasVertexColors,
      roughness: 1,
      metalness: 0,
    })
  )
}

function buildPointsMaterial(material: THREE.Material | undefined, hasVertexColors: boolean) {
  if (material instanceof THREE.PointsMaterial) {
    const next = material.clone()
    next.vertexColors = hasVertexColors
    next.depthWrite = false
    return applyAnnotatorPatch(next)
  }

  return applyAnnotatorPatch(
    new THREE.PointsMaterial({
      color: hasVertexColors ? 0xffffff : 0xd4cec4,
      vertexColors: hasVertexColors,
      size: 0.01,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })
  )
}

function extractVertexCount(scene: THREE.Object3D) {
  let vertexCount = 0

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Points)) return
    const geometry = child.geometry as THREE.BufferGeometry
    const positions = geometry.getAttribute("position")
    if (positions) {
      vertexCount += positions.count
    }
  })

  return vertexCount
}

function applyRegion(uniforms: AnnotatorUniforms, prefix: "Selection" | "Hover", region: SceneFocusRegion | null | undefined) {
  const enabledKey = `uAnnotator${prefix}Enabled` as const
  const minKey = `uAnnotator${prefix}Min` as const
  const maxKey = `uAnnotator${prefix}Max` as const
  const centerKey = `uAnnotator${prefix}Center` as const

  if (!region) {
    uniforms[enabledKey].value = 0
    uniforms[minKey].value.copy(DISABLED_MIN)
    uniforms[maxKey].value.copy(DISABLED_MAX)
    uniforms[centerKey].value.copy(DISABLED_CENTER)
    return
  }

  uniforms[enabledKey].value = 1
  uniforms[minKey].value.set(region.bboxMin[0], region.bboxMin[1], region.bboxMin[2])
  uniforms[maxKey].value.set(region.bboxMax[0], region.bboxMax[1], region.bboxMax[2])
  uniforms[centerKey].value.set(region.center[0], region.center[1], region.center[2])
}

function contextDimForMode(mode: SceneDisplayMode | undefined) {
  if (mode === "ghost") return 0.2
  if (mode === "isolate") return 0.045
  return 0.56
}

export function GlbSceneModel({
  url,
  selectionRegion,
  hoverRegion,
  sceneDisplayMode = "normal",
  onLoad,
  onError,
}: GlbSceneModelProps) {
  const gltf = useLoader(GLTFLoader, url, undefined, (event) => {
    if (event instanceof ErrorEvent && onError) {
      onError(new Error(event.message))
    }
  })

  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true)

    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geometry = child.geometry as THREE.BufferGeometry
        const hasVertexColors = !!geometry.getAttribute("color")

        if (Array.isArray(child.material)) {
          child.material = child.material.map((material) => buildMeshMaterial(material, hasVertexColors))
        } else if (child.material) {
          child.material = buildMeshMaterial(child.material, hasVertexColors)
        }

        child.castShadow = false
        child.receiveShadow = false
        return
      }

      if (child instanceof THREE.Points) {
        const geometry = child.geometry as THREE.BufferGeometry
        const hasVertexColors = !!geometry.getAttribute("color")
        child.material = buildPointsMaterial(child.material, hasVertexColors)
      }
    })

    return clone
  }, [gltf])

  const vertexCount = useMemo(() => extractVertexCount(scene), [scene])

  useEffect(() => {
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Points)) return

      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => {
        const uniforms = material.userData.__annotatorUniforms as AnnotatorUniforms | undefined
        if (!uniforms) return
        applyRegion(uniforms, "Selection", selectionRegion)
        applyRegion(uniforms, "Hover", hoverRegion)
        uniforms.uAnnotatorContextDim.value = contextDimForMode(sceneDisplayMode)
      })
    })
  }, [hoverRegion, scene, sceneDisplayMode, selectionRegion])

  useEffect(() => {
    if (vertexCount > 0) {
      onLoad?.(vertexCount)
    }
  }, [vertexCount, onLoad])

  return <primitive object={scene} />
}
