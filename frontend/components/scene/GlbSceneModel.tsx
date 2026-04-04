"use client"

import { useEffect, useMemo } from "react"
import { useLoader } from "@react-three/fiber"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

interface GlbSceneModelProps {
  url: string
  onLoad?: (vertexCount: number) => void
  onError?: (err: Error) => void
}

function buildMaterial(material: THREE.Material, hasVertexColors: boolean) {
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
    color: hasVertexColors ? 0xffffff : 0xd4cec4,
    vertexColors: hasVertexColors,
    roughness: 1,
    metalness: 0,
  })
}

function extractVertexCount(scene: THREE.Object3D) {
  let vertexCount = 0

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const geometry = child.geometry as THREE.BufferGeometry
    const positions = geometry.getAttribute("position")
    if (positions) {
      vertexCount += positions.count
    }
  })

  return vertexCount
}

export function GlbSceneModel({ url, onLoad, onError }: GlbSceneModelProps) {
  const gltf = useLoader(GLTFLoader, url, undefined, (event) => {
    if (event instanceof ErrorEvent && onError) {
      onError(new Error(event.message))
    }
  })

  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true)

    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return

      const geometry = child.geometry as THREE.BufferGeometry
      const hasVertexColors = !!geometry.getAttribute("color")

      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => buildMaterial(material, hasVertexColors))
      } else if (child.material) {
        child.material = buildMaterial(child.material, hasVertexColors)
      }

      child.castShadow = false
      child.receiveShadow = false
    })

    return clone
  }, [gltf])

  const vertexCount = useMemo(() => extractVertexCount(scene), [scene])

  useEffect(() => {
    if (vertexCount > 0) {
      onLoad?.(vertexCount)
    }
  }, [vertexCount, onLoad])

  return <primitive object={scene} />
}
