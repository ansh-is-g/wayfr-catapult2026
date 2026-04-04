"use client"

import { useState, useCallback, useMemo, useRef, useEffect, Suspense } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, Html } from "@react-three/drei"
import * as THREE from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"

import { GlbSceneModel, type SceneFocusRegion } from "./GlbSceneModel"
import { NavigationPath } from "./NavigationPath"
import { ChaseCamera } from "./ChaseCamera"
import { ObjectPointHighlight } from "./ObjectPointHighlight"
import type { ExactObjectHighlight, ObjectItem, SceneDebugOptions } from "./HomeSceneViewer"

const BG = "#0a0a0f"
const BOX_COLORS = [
  0x4da6ff, 0xff6b6b, 0x51cf66, 0xfcc419, 0xcc5de8,
  0xff922b, 0x20c997, 0xf06595, 0x5c7cfa, 0x94d82d,
]
const SELECTED_ACCENT = 0xf6b54c
const HOVER_ACCENT = 0x8fd8ff

type Vec3Triple = [number, number, number]

type ObjectFocusMeta = {
  anchor: Vec3Triple
  center: Vec3Triple
  size: Vec3Triple
  bboxMin: Vec3Triple
  bboxMax: Vec3Triple
  floorY: number
  labelPosition: Vec3Triple
}

function getObjectSize(label: string): [number, number, number] {
  const sizes: Record<string, [number, number, number]> = {
    table: [1.2, 0.75, 0.8], chair: [0.5, 0.9, 0.5], couch: [2.0, 0.85, 0.9],
    sofa: [2.0, 0.85, 0.9], desk: [1.2, 0.75, 0.6], bed: [2.0, 0.6, 1.5],
    bench: [1.5, 0.45, 0.4], shelf: [0.8, 1.5, 0.35], cabinet: [0.8, 1.0, 0.5],
    stove: [0.7, 0.9, 0.6], refrigerator: [0.7, 1.7, 0.7], fridge: [0.7, 1.7, 0.7],
    sink: [0.6, 0.85, 0.5], door: [0.9, 2.0, 0.1], window: [1.0, 1.0, 0.1],
    tv: [1.0, 0.6, 0.1], person: [0.5, 1.7, 0.4], microwave: [0.5, 0.35, 0.4],
    dishwasher: [0.6, 0.85, 0.6], oven: [0.6, 0.9, 0.6], counter: [1.5, 0.9, 0.6],
    "coffee table": [1.0, 0.45, 0.6], "trash can": [0.3, 0.6, 0.3],
    "light switch": [0.08, 0.12, 0.03],
  }
  return sizes[label.toLowerCase()] ?? [0.5, 0.6, 0.5]
}

function getObjectFocusMeta(obj: ObjectItem): ObjectFocusMeta {
  if (obj.bbox_min?.length === 3 && obj.bbox_max?.length === 3) {
    const bboxMin: Vec3Triple = [obj.bbox_min[0], obj.bbox_min[1], obj.bbox_min[2]]
    const bboxMax: Vec3Triple = [obj.bbox_max[0], obj.bbox_max[1], obj.bbox_max[2]]
    const size: Vec3Triple = [
      Math.max(0.08, Math.abs(bboxMax[0] - bboxMin[0])),
      Math.max(0.08, Math.abs(bboxMax[1] - bboxMin[1])),
      Math.max(0.08, Math.abs(bboxMax[2] - bboxMin[2])),
    ]
    const center: Vec3Triple = [
      (bboxMin[0] + bboxMax[0]) / 2,
      (bboxMin[1] + bboxMax[1]) / 2,
      (bboxMin[2] + bboxMax[2]) / 2,
    ]

    return {
      anchor: [obj.x, obj.y, obj.z],
      center,
      size,
      bboxMin,
      bboxMax,
      floorY: bboxMin[1],
      labelPosition: [center[0], bboxMax[1] + 0.24, center[2]],
    }
  }

  const size = getObjectSize(obj.label)
  const center: Vec3Triple = [obj.x, (obj.y || 0) + size[1] / 2, obj.z]
  const bboxMin: Vec3Triple = [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2]
  const bboxMax: Vec3Triple = [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2]

  return {
    anchor: [obj.x, obj.y, obj.z],
    center,
    size,
    bboxMin,
    bboxMax,
    floorY: bboxMin[1],
    labelPosition: [center[0], bboxMax[1] + 0.24, center[2]],
  }
}

function toFocusRegion(meta: ObjectFocusMeta): SceneFocusRegion {
  return {
    center: meta.center,
    bboxMin: meta.bboxMin,
    bboxMax: meta.bboxMax,
  }
}

function FocusCallout({
  obj,
  meta,
  color,
  tone,
}: {
  obj: ObjectItem
  meta: ObjectFocusMeta
  color: number
  tone: "selected" | "hover"
}) {
  const hex = `#${color.toString(16).padStart(6, "0")}`

  return (
    <Html
      center
      position={meta.labelPosition}
      distanceFactor={11}
      occlude={false}
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: tone === "selected" ? "6px 12px" : "5px 10px",
          borderRadius: "999px",
          border: `1px solid ${hex}55`,
          background:
            tone === "selected"
              ? `linear-gradient(180deg, rgba(8,10,15,0.88), ${hex}2f)`
              : `linear-gradient(180deg, rgba(8,10,15,0.72), ${hex}1b)`,
          boxShadow: "0 18px 46px rgba(0,0,0,0.34)",
          backdropFilter: "blur(18px)",
          whiteSpace: "nowrap",
          fontFamily: "monospace",
          fontSize: tone === "selected" ? "12px" : "10px",
          lineHeight: "1.4",
          color: "#fff7ea",
        }}
      >
        <span style={{ fontWeight: 700 }}>{obj.label}</span>
        {obj.confidence != null && (
          <span style={{ opacity: 0.68, fontSize: "9px" }}>
            {Math.round(obj.confidence * 100)}%
          </span>
        )}
        {tone === "selected" ? <span style={{ fontSize: "9px", opacity: 0.78 }}>SELECTED</span> : null}
      </div>
    </Html>
  )
}

function SelectionAura({
  meta,
  color,
  strength = "selected",
}: {
  meta: ObjectFocusMeta
  color: number
  strength?: "selected" | "hover"
}) {
  const shellRef = useRef<THREE.Group>(null)
  const baseOpacity = strength === "selected" ? 0.16 : 0.08
  const ringOpacity = strength === "selected" ? 0.55 : 0.28
  const shellScale = strength === "selected" ? 0.62 : 0.56
  const outerScale = strength === "selected" ? 0.76 : 0.68
  const ringOuter = Math.max(meta.size[0], meta.size[2]) * (strength === "selected" ? 0.7 : 0.62)

  useFrame(({ clock }) => {
    if (!shellRef.current) return
    const pulse = strength === "selected" ? 1 + Math.sin(clock.elapsedTime * 2.4) * 0.035 : 1 + Math.sin(clock.elapsedTime * 1.8) * 0.02
    shellRef.current.scale.setScalar(pulse)
  })

  return (
    <group>
      <group ref={shellRef} position={meta.center}>
        <mesh scale={[meta.size[0] * shellScale, meta.size[1] * shellScale, meta.size[2] * shellScale]}>
          <sphereGeometry args={[1, 28, 20]} />
          <meshBasicMaterial color={color} transparent opacity={baseOpacity} depthWrite={false} />
        </mesh>
        <mesh scale={[meta.size[0] * outerScale, meta.size[1] * outerScale, meta.size[2] * outerScale]}>
          <sphereGeometry args={[1, 24, 18]} />
          <meshBasicMaterial color={color} transparent opacity={baseOpacity * 0.55} depthWrite={false} side={THREE.BackSide} />
        </mesh>
      </group>

      <mesh position={[meta.center[0], meta.floorY + 0.03, meta.center[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ringOuter * 0.62, ringOuter, 48]} />
        <meshBasicMaterial color={color} transparent opacity={ringOpacity} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function ApproximateRegionDebug({
  meta,
  color,
}: {
  meta: ObjectFocusMeta
  color: number
}) {
  return (
    <group position={meta.center}>
      <mesh scale={[meta.size[0] * 0.55, meta.size[1] * 0.55, meta.size[2] * 0.55]}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} wireframe />
      </mesh>
    </group>
  )
}

function CentroidDebug({ obj }: { obj: ObjectItem }) {
  return (
    <mesh position={[obj.x, obj.y, obj.z]}>
      <sphereGeometry args={[0.05, 14, 14]} />
      <meshBasicMaterial color={0xffffff} transparent opacity={0.9} />
    </mesh>
  )
}

function LegacyObjectBox({
  obj,
  index,
  isSelected,
  isDimmed,
  isTarget,
  onClick,
}: {
  obj: ObjectItem
  index: number
  isSelected: boolean
  isDimmed: boolean
  isTarget: boolean
  onClick: () => void
}) {
  const boxRef = useRef<THREE.Group>(null)
  const color = BOX_COLORS[index % BOX_COLORS.length]
  const meta = useMemo(() => getObjectFocusMeta(obj), [obj])
  const distance = Math.sqrt(obj.x ** 2 + obj.z ** 2)
  const activeColor = isTarget ? 0x22c55e : color

  useFrame(({ clock }) => {
    if (!boxRef.current) return
    if (isSelected || isTarget) {
      const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.03
      boxRef.current.scale.set(s, s, s)
    } else {
      boxRef.current.scale.set(1, 1, 1)
    }
  })

  const opacity = isDimmed ? 0.08 : isSelected ? 0.6 : isTarget ? 0.5 : 0.35
  const lineOpacity = isDimmed ? 0.1 : isSelected ? 0.9 : isTarget ? 0.85 : 0.5

  return (
    <group
      ref={boxRef}
      position={meta.center}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(meta.size[0], meta.size[1], meta.size[2])]} />
        <lineBasicMaterial color={activeColor} transparent opacity={lineOpacity} />
      </lineSegments>

      <mesh>
        <boxGeometry args={[meta.size[0], meta.size[1], meta.size[2]]} />
        <meshBasicMaterial
          color={activeColor}
          transparent
          opacity={opacity * 0.3}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {!isDimmed && (
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[
                new Float32Array([
                  0,
                  -meta.size[1] / 2,
                  0,
                  0,
                  meta.floorY - meta.center[1],
                  0,
                ]),
                3,
              ]}
              count={2}
            />
          </bufferGeometry>
          <lineBasicMaterial color={activeColor} transparent opacity={0.25} />
        </line>
      )}

      {!isDimmed && (
        <Html
          center
          position={[0, meta.size[1] / 2 + 0.2, 0]}
          distanceFactor={10}
          occlude={false}
          style={{ pointerEvents: "auto" }}
        >
          <div
            onClick={(event) => {
              event.stopPropagation()
              onClick()
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "5px 10px",
              borderRadius: "999px",
              border: isSelected || isTarget
                ? `1px solid #${activeColor.toString(16).padStart(6, "0")}66`
                : "1px solid rgba(255,255,255,0.14)",
              background: isSelected || isTarget
                ? `linear-gradient(180deg, rgba(10,10,15,0.82), #${activeColor.toString(16).padStart(6, "0")}22)`
                : "rgba(10,10,15,0.52)",
              backdropFilter: "blur(18px)",
              boxShadow: isSelected || isTarget
                ? "0 18px 42px rgba(0,0,0,0.28)"
                : "0 10px 28px rgba(0,0,0,0.18)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontFamily: "monospace",
              fontSize: isSelected || isTarget ? "12px" : "10px",
              lineHeight: "1.4",
              color: isSelected || isTarget ? "#f8efe2" : "rgba(248,239,226,0.92)",
              transition: "all 0.15s",
            }}
          >
            <span style={{ fontWeight: 600 }}>{obj.label}</span>
            {obj.confidence != null && (
              <span style={{ opacity: 0.6, fontSize: "9px" }}>
                {Math.round(obj.confidence * 100)}%
              </span>
            )}
            <span style={{ opacity: 0.5, fontSize: "9px" }}>{distance.toFixed(1)}m</span>
            {isTarget && <span style={{ fontSize: "9px" }}>TARGET</span>}
          </div>
        </Html>
      )}
    </group>
  )
}

function SceneGrid({ objects }: { objects: ObjectItem[] }) {
  const size = useMemo(() => {
    if (objects.length === 0) return 10
    const xs = objects.map((o) => Math.abs(o.x))
    const zs = objects.map((o) => Math.abs(o.z))
    return Math.ceil(Math.max(...xs, ...zs) * 2 + 4)
  }, [objects])

  return (
    <gridHelper
      args={[size, size, 0x333333, 0x1a1a1a]}
      position={[0, 0.001, size / 4]}
      visible={objects.length > 0}
    />
  )
}

function ExploreCamera({ objects }: { objects: ObjectItem[] }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const idleTimer = useRef(0)
  const interacting = useRef(false)
  const { camera } = useThree()

  const { target, dist } = useMemo(() => {
    if (objects.length === 0) return { target: new THREE.Vector3(0, 0.5, 3), dist: 6 }
    const xs = objects.map((o) => getObjectFocusMeta(o).center[0])
    const zs = objects.map((o) => getObjectFocusMeta(o).center[2])
    const cx = xs.reduce((sum, value) => sum + value, 0) / xs.length
    const cz = zs.reduce((sum, value) => sum + value, 0) / zs.length
    const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
    return { target: new THREE.Vector3(cx, 0.8, cz), dist: Math.max(spread * 0.85, 5) }
  }, [objects])

  useEffect(() => {
    camera.position.set(target.x - dist * 0.4, dist * 0.55, target.z - dist * 0.5)
    camera.lookAt(target)
  }, [camera, target, dist])

  useFrame((_, delta) => {
    if (!controlsRef.current) return
    if (interacting.current) {
      idleTimer.current = 0
      controlsRef.current.autoRotate = false
    } else {
      idleTimer.current += delta
      if (idleTimer.current > 3) {
        controlsRef.current.autoRotate = true
        controlsRef.current.autoRotateSpeed = 0.8
      }
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      target={[target.x, target.y, target.z]}
      enableDamping
      dampingFactor={0.05}
      minPolarAngle={Math.PI * 0.05}
      maxPolarAngle={Math.PI * 0.48}
      minDistance={1.5}
      maxDistance={dist * 3}
      autoRotate
      autoRotateSpeed={0.8}
      onStart={() => {
        interacting.current = true
      }}
      onEnd={() => {
        interacting.current = false
      }}
    />
  )
}

function AnnotatorSelectionLayer({
  objects,
  selectedObjectId,
  hoveredObjectId,
  onObjectSelect,
  onObjectHover,
  debugOptions,
  exactHighlight,
}: {
  objects: ObjectItem[]
  selectedObjectId: string | null
  hoveredObjectId: string | null
  onObjectSelect?: (objectId: string | null) => void
  onObjectHover?: (objectId: string | null) => void
  debugOptions: SceneDebugOptions
  exactHighlight: ExactObjectHighlight | null
}) {
  const objectById = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects])
  const selectedObject = selectedObjectId ? objectById.get(selectedObjectId) ?? null : null
  const hoveredObject =
    hoveredObjectId && hoveredObjectId !== selectedObjectId ? objectById.get(hoveredObjectId) ?? null : null
  const selectedMeta = useMemo(() => (selectedObject ? getObjectFocusMeta(selectedObject) : null), [selectedObject])
  const hoveredMeta = useMemo(() => (hoveredObject ? getObjectFocusMeta(hoveredObject) : null), [hoveredObject])

  return (
    <>
      {objects.map((obj) => {
        const meta = getObjectFocusMeta(obj)
        return (
          <mesh
            key={`hit-${obj.id}`}
            position={meta.center}
            scale={[meta.size[0] * 0.62, meta.size[1] * 0.62, meta.size[2] * 0.62]}
            onPointerOver={(event) => {
              event.stopPropagation()
              onObjectHover?.(obj.id)
            }}
            onPointerOut={(event) => {
              event.stopPropagation()
              onObjectHover?.(null)
            }}
            onClick={(event) => {
              event.stopPropagation()
              onObjectSelect?.(obj.id)
            }}
            renderOrder={-10}
          >
            <sphereGeometry args={[1, 16, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        )
      })}

      {hoveredObject && hoveredMeta ? (
        <>
          <SelectionAura meta={hoveredMeta} color={HOVER_ACCENT} strength="hover" />
          <FocusCallout obj={hoveredObject} meta={hoveredMeta} color={HOVER_ACCENT} tone="hover" />
        </>
      ) : null}

      {selectedObject && selectedMeta ? (
        <>
          <SelectionAura meta={selectedMeta} color={SELECTED_ACCENT} strength="selected" />
          <FocusCallout obj={selectedObject} meta={selectedMeta} color={SELECTED_ACCENT} tone="selected" />
        </>
      ) : null}

      {debugOptions.showApproxRegion && hoveredMeta ? (
        <ApproximateRegionDebug meta={hoveredMeta} color={HOVER_ACCENT} />
      ) : null}
      {debugOptions.showApproxRegion && selectedMeta ? (
        <ApproximateRegionDebug meta={selectedMeta} color={SELECTED_ACCENT} />
      ) : null}

      {debugOptions.showCentroids && hoveredObject ? <CentroidDebug obj={hoveredObject} /> : null}
      {debugOptions.showCentroids && selectedObject ? <CentroidDebug obj={selectedObject} /> : null}

      {debugOptions.showBBoxes && hoveredObject ? (
        <LegacyObjectBox
          obj={hoveredObject}
          index={0}
          isSelected={false}
          isDimmed={false}
          isTarget={false}
          onClick={() => onObjectSelect?.(hoveredObject.id)}
        />
      ) : null}
      {debugOptions.showBBoxes && selectedObject ? (
        <LegacyObjectBox
          obj={selectedObject}
          index={1}
          isSelected
          isDimmed={false}
          isTarget={false}
          onClick={() => onObjectSelect?.(selectedObject.id)}
        />
      ) : null}

      {debugOptions.showExactPoints && exactHighlight && exactHighlight.sampledPoints.length > 0 ? (
        <ObjectPointHighlight points={exactHighlight.sampledPoints} />
      ) : null}
    </>
  )
}

function SceneContent({
  glbUrl,
  objects,
  mode,
  path,
  currentStepIndex,
  targetLabel,
  selectedObjectId,
  hoveredObjectId,
  onObjectSelect,
  onObjectHover,
  debugOptions,
  exactHighlight,
  onPointCount,
  onGlbError,
}: {
  glbUrl: string
  objects: ObjectItem[]
  mode: "default" | "annotator"
  path?: { x: number; z: number }[]
  currentStepIndex: number
  targetLabel?: string
  selectedObjectId: string | null
  hoveredObjectId: string | null
  onObjectSelect?: (objectId: string | null) => void
  onObjectHover?: (objectId: string | null) => void
  debugOptions: SceneDebugOptions
  exactHighlight: ExactObjectHighlight | null
  onPointCount: (n: number) => void
  onGlbError: () => void
}) {
  const [legacySelected, setLegacySelected] = useState<number | null>(null)
  const navActive = !!path && path.length > 0
  const targetLower = targetLabel?.toLowerCase()
  const objectById = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects])
  const shaderSelectionRegion = useMemo(() => {
    if (mode !== "annotator" || !selectedObjectId) return null
    const obj = objectById.get(selectedObjectId)
    return obj ? toFocusRegion(getObjectFocusMeta(obj)) : null
  }, [mode, objectById, selectedObjectId])
  const shaderHoverRegion = useMemo(() => {
    if (mode !== "annotator" || !hoveredObjectId || hoveredObjectId === selectedObjectId) return null
    const obj = objectById.get(hoveredObjectId)
    return obj ? toFocusRegion(getObjectFocusMeta(obj)) : null
  }, [hoveredObjectId, mode, objectById, selectedObjectId])

  const handleLegacyClick = useCallback(
    (index: number) => setLegacySelected((prev) => (prev === index ? null : index)),
    []
  )

  return (
    <>
      {navActive ? (
        <ChaseCamera path={path!} currentStepIndex={currentStepIndex} />
      ) : (
        <ExploreCamera objects={objects} />
      )}

      <ambientLight intensity={0.35} color={0xffffff} />
      <hemisphereLight intensity={0.65} color={0xf6efe6} groundColor={0x4c4338} />
      <directionalLight position={[6, 8, 4]} intensity={0.65} color={0xffffff} />
      <fog attach="fog" args={[BG, 12, 30]} />

      <SceneGrid objects={objects} />

      <Suspense fallback={null}>
        <GlbSceneModel
          url={glbUrl}
          selectionRegion={shaderSelectionRegion}
          hoverRegion={shaderHoverRegion}
          onLoad={onPointCount}
          onError={onGlbError}
        />
      </Suspense>

      {mode === "annotator" ? (
        <AnnotatorSelectionLayer
          objects={objects}
          selectedObjectId={selectedObjectId}
          hoveredObjectId={hoveredObjectId}
          onObjectSelect={onObjectSelect}
          onObjectHover={onObjectHover}
          debugOptions={debugOptions}
          exactHighlight={exactHighlight}
        />
      ) : (
        <>
          {objects.map((obj, index) => (
            <LegacyObjectBox
              key={obj.id || `${obj.label}-${index}`}
              obj={obj}
              index={index}
              isSelected={legacySelected === index}
              isDimmed={legacySelected !== null && legacySelected !== index}
              isTarget={!!targetLower && obj.label.toLowerCase() === targetLower}
              onClick={() => handleLegacyClick(index)}
            />
          ))}
        </>
      )}

      {navActive && (
        <NavigationPath
          path={path!}
          currentStepIndex={currentStepIndex}
        />
      )}

      <mesh
        onClick={() => {
          if (mode === "annotator") {
            onObjectSelect?.(null)
            onObjectHover?.(null)
            return
          }
          setLegacySelected(null)
        }}
      >
        <sphereGeometry args={[50, 8, 8]} />
        <meshBasicMaterial side={THREE.BackSide} transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      {objects.length === 0 && (
        <Html center position={[0, 1.5, 2]}>
          <div style={{ fontFamily: "monospace", fontSize: 13, color: "#F5A62350" }}>
            Loading scene...
          </div>
        </Html>
      )}

      {mode === "annotator" && !selectedObjectId && !hoveredObjectId && objects.length > 0 ? (
        <Html center position={[0, 1.4, 2]}>
          <div
            style={{
              padding: "8px 14px",
              borderRadius: "999px",
              background: "rgba(8,10,15,0.56)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,247,234,0.88)",
              backdropFilter: "blur(14px)",
              fontFamily: "monospace",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Select an annotation to inspect the mesh
          </div>
        </Html>
      ) : null}
    </>
  )
}

interface HomeSceneInnerProps {
  glbUrl: string
  objects: ObjectItem[]
  mode?: "default" | "annotator"
  path?: { x: number; z: number }[]
  currentStepIndex: number
  targetLabel?: string
  selectedObjectId?: string | null
  hoveredObjectId?: string | null
  onObjectSelect?: (objectId: string | null) => void
  onObjectHover?: (objectId: string | null) => void
  debugOptions?: SceneDebugOptions
  exactHighlight?: ExactObjectHighlight | null
  onPointCount: (n: number) => void
  onGlbError: () => void
}

export function HomeSceneInner({
  glbUrl,
  objects,
  mode = "default",
  path,
  currentStepIndex,
  targetLabel,
  selectedObjectId = null,
  hoveredObjectId = null,
  onObjectSelect,
  onObjectHover,
  debugOptions = {
    showBBoxes: false,
    showCentroids: false,
    showApproxRegion: false,
    showExactPoints: false,
  },
  exactHighlight = null,
  onPointCount,
  onGlbError,
}: HomeSceneInnerProps) {
  return (
    <Canvas
      style={{ width: "100%", height: "100%", background: BG }}
      camera={{ fov: 60, near: 0.01, far: 1000, position: [0, 3, 8] }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
    >
      <Suspense
        fallback={
          <Html center>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#F5A62350" }}>
              Loading...
            </span>
          </Html>
        }
      >
        <SceneContent
          glbUrl={glbUrl}
          objects={objects}
          mode={mode}
          path={path}
          currentStepIndex={currentStepIndex}
          targetLabel={targetLabel}
          selectedObjectId={selectedObjectId}
          hoveredObjectId={hoveredObjectId}
          onObjectSelect={onObjectSelect}
          onObjectHover={onObjectHover}
          debugOptions={debugOptions}
          exactHighlight={exactHighlight}
          onPointCount={onPointCount}
          onGlbError={onGlbError}
        />
      </Suspense>
    </Canvas>
  )
}
