"use client"

import { Bounds, Html, Line, OrbitControls } from "@react-three/drei"
import { Canvas, useLoader } from "@react-three/fiber"
import { Suspense, useEffect, useMemo } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

import { getTargetBounds } from "@/lib/types"
import type { ExactObjectHighlight, PathPoint, SimTarget } from "@/lib/types"

function cloneMaterial(material: THREE.Material, hasVertexColors: boolean) {
  if (material instanceof THREE.PointsMaterial) {
    const next = material.clone()
    next.vertexColors = hasVertexColors
    next.size = Math.max(next.size, 0.01)
    next.depthWrite = false
    return next
  }

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
    return next
  }

  return new THREE.MeshStandardMaterial({
    color: hasVertexColors ? 0xffffff : 0xbcc8d6,
    vertexColors: hasVertexColors,
    roughness: 1,
    metalness: 0,
  })
}

function LoadedScene({
  assetUrl,
  onStatsChange,
}: {
  assetUrl: string
  onStatsChange?: (stats: { vertexCount: number }) => void
}) {
  const gltf = useLoader(GLTFLoader, assetUrl)

  const prepared = useMemo(() => {
    const clone = gltf.scene.clone(true)
    let vertexCount = 0

    clone.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        const geometry = child.geometry as THREE.BufferGeometry
        const positions = geometry.getAttribute("position")
        if (positions) {
          vertexCount += positions.count
        }

        const hasVertexColors = Boolean(geometry.getAttribute("color"))
        if (Array.isArray(child.material)) {
          child.material = child.material.map((material) => cloneMaterial(material, hasVertexColors))
        } else if (child.material) {
          child.material = cloneMaterial(child.material, hasVertexColors)
        }
      }
    })

    return { object: clone, vertexCount }
  }, [gltf.scene])

  useEffect(() => {
    onStatsChange?.({ vertexCount: prepared.vertexCount })
  }, [onStatsChange, prepared.vertexCount])

  return <primitive object={prepared.object} />
}

function ObjectOverlays({
  targets,
  selectedTarget,
}: {
  targets: SimTarget[]
  selectedTarget: SimTarget | null
}) {
  return (
    <>
      {targets.map((target) => {
        const bounds = getTargetBounds(target)
        const isSelected = selectedTarget?.id === target.id
        const color = isSelected ? "#ffb15e" : "#6fc4ff"

        return (
          <group key={target.id}>
            <mesh position={bounds.center}>
              <boxGeometry args={bounds.size} />
              <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.38 : 0.12} wireframe />
            </mesh>
            {isSelected ? (
              <Html position={[bounds.center[0], bounds.max[1] + 0.24, bounds.center[2]]} center distanceFactor={10}>
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "rgba(8, 14, 20, 0.88)",
                    border: "1px solid rgba(255, 177, 94, 0.36)",
                    color: "#fff6e7",
                    fontSize: 11,
                    fontFamily: "monospace",
                    whiteSpace: "nowrap",
                  }}
                >
                  {target.label}
                </div>
              </Html>
            ) : null}
          </group>
        )
      })}
    </>
  )
}

function PathOverlay({
  points,
  color,
}: {
  points: PathPoint[]
  color: string
}) {
  if (points.length < 2) {
    return null
  }

  return (
    <Line
      color={color}
      lineWidth={2}
      points={points.map((point) => [point.x, 0.06, point.z] as [number, number, number])}
    />
  )
}

function HighlightPointCloud({ highlight }: { highlight: ExactObjectHighlight | null }) {
  const geometry = useMemo(() => {
    if (!highlight || highlight.sampledPoints.length === 0) {
      return null
    }

    const next = new THREE.BufferGeometry()
    const positions = new Float32Array(highlight.sampledPoints.flatMap((point) => point))
    next.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    return next
  }, [highlight])

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!geometry) {
    return null
  }

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#ffcf76" size={0.04} sizeAttenuation transparent opacity={0.95} depthWrite={false} />
    </points>
  )
}

function RobotMarker({ startPose }: { startPose: PathPoint }) {
  return (
    <group position={[startPose.x, 0.08, startPose.z]}>
      <mesh>
        <cylinderGeometry args={[0.18, 0.2, 0.12, 24]} />
        <meshStandardMaterial color="#2ee6a6" emissive="#2ee6a6" emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 0.12, 0.08]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color="#f6fffb" />
      </mesh>
    </group>
  )
}

export function SimulatorSceneInner({
  assetUrl,
  targets,
  selectedTarget,
  highlight,
  teacherPath,
  rolloutPath,
  startPose,
  onStatsChange,
}: {
  assetUrl: string
  targets: SimTarget[]
  selectedTarget: SimTarget | null
  highlight: ExactObjectHighlight | null
  teacherPath: PathPoint[]
  rolloutPath: PathPoint[]
  startPose: PathPoint
  onStatsChange?: (stats: { vertexCount: number }) => void
}) {
  return (
    <Canvas camera={{ position: [3.8, 3, 4.5], fov: 52 }}>
      <color attach="background" args={["#051018"]} />
      <ambientLight intensity={1.25} />
      <directionalLight position={[6, 8, 3]} intensity={1.4} />
      <directionalLight position={[-4, 4, -3]} intensity={0.4} color="#87c7ff" />
      <gridHelper args={[20, 40, "#17354a", "#0d1c29"]} position={[0, -0.01, 0]} />

      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.15}>
          <LoadedScene assetUrl={assetUrl} onStatsChange={onStatsChange} />
          <ObjectOverlays selectedTarget={selectedTarget} targets={targets} />
          <HighlightPointCloud highlight={highlight} />
          <PathOverlay color="#58c5ff" points={teacherPath} />
          <PathOverlay color="#ffb15e" points={rolloutPath} />
          <RobotMarker startPose={startPose} />
        </Bounds>
      </Suspense>

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  )
}
