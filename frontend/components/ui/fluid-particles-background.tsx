"use client"

import React, { useEffect, useMemo, useRef } from "react"

import { cn } from "@/lib/utils"

interface FluidParticlesBackgroundProps {
  children?: React.ReactNode
  particleCount?: number
  noiseIntensity?: number
  particleSize?: { min: number; max: number }
  className?: string
}

function createNoise() {
  const permutation = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140,
    36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120,
    234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33,
    88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71,
    134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133,
    230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161,
    1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130,
    116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250,
    124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227,
    47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44,
    154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98,
    108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34,
    242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14,
    239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121,
    50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243,
    141, 128, 195, 78, 66, 215, 61, 156, 180,
  ]

  const p = new Array(512)
  for (let i = 0; i < 256; i++) p[256 + i] = p[i] = permutation[i]

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const lerp = (t: number, a: number, b: number) => a + t * (b - a)

  const grad = (hash: number, x: number, y: number, z: number) => {
    const h = hash & 15
    const u = h < 8 ? x : y
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
  }

  return {
    simplex3: (x: number, y: number, z: number) => {
      const X = Math.floor(x) & 255
      const Y = Math.floor(y) & 255
      const Z = Math.floor(z) & 255

      x -= Math.floor(x)
      y -= Math.floor(y)
      z -= Math.floor(z)

      const u = fade(x)
      const v = fade(y)
      const w = fade(z)

      const A = p[X] + Y
      const AA = p[A] + Z
      const AB = p[A + 1] + Z
      const B = p[X + 1] + Y
      const BA = p[B] + Z
      const BB = p[B + 1] + Z

      return lerp(
        w,
        lerp(
          v,
          lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)),
          lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z)),
        ),
        lerp(
          v,
          lerp(
            u,
            grad(p[AA + 1], x, y, z - 1),
            grad(p[BA + 1], x - 1, y, z - 1),
          ),
          lerp(
            u,
            grad(p[AB + 1], x, y - 1, z - 1),
            grad(p[BB + 1], x - 1, y - 1, z - 1),
          ),
        ),
      )
    },
  }
}

type Particle = {
  x: number
  y: number
  size: number
  velocity: { x: number; y: number }
  life: number
  maxLife: number
}

const COLOR_SCHEME = {
  light: {
    particle: "rgba(196, 122, 30, 0.26)",
    background: "rgba(255, 252, 247, 0.06)",
  },
  dark: {
    particle: "rgba(245, 166, 35, 0.22)",
    background: "rgba(18, 14, 10, 0.1)",
  },
} as const

export function FluidParticlesBackground({
  children,
  particleCount = 820,
  noiseIntensity = 0.0026,
  particleSize = { min: 0.5, max: 2 },
  className,
}: FluidParticlesBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number | null>(null)
  const noise = useMemo(() => createNoise(), [])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
    }

    resizeCanvas()

    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: Math.random() * container.clientWidth,
      y: Math.random() * container.clientHeight,
      size: Math.random() * (particleSize.max - particleSize.min) + particleSize.min,
      velocity: { x: 0, y: 0 },
      life: Math.random() * 100,
      maxLife: 100 + Math.random() * 50,
    }))

    const animate = () => {
      const isDark = document.documentElement.classList.contains("dark")
      const scheme = isDark ? COLOR_SCHEME.dark : COLOR_SCHEME.light
      const width = container.clientWidth
      const height = container.clientHeight
      const time = performance.now() * 0.00008

      ctx.fillStyle = scheme.background
      ctx.fillRect(0, 0, width, height)

      for (const particle of particles) {
        particle.life += 1

        if (particle.life > particle.maxLife) {
          particle.life = 0
          particle.x = Math.random() * width
          particle.y = Math.random() * height
        }

        const opacity = Math.sin((particle.life / particle.maxLife) * Math.PI) * 0.32
        const n = noise.simplex3(
          particle.x * noiseIntensity,
          particle.y * noiseIntensity,
          time
        )

        const angle = n * Math.PI * 4
        particle.velocity.x = Math.cos(angle) * 1.85
        particle.velocity.y = Math.sin(angle) * 1.85
        particle.x += particle.velocity.x
        particle.y += particle.velocity.y

        if (particle.x < 0) particle.x = width
        if (particle.x > width) particle.x = 0
        if (particle.y < 0) particle.y = height
        if (particle.y > height) particle.y = 0

        ctx.fillStyle = `rgba(245, 166, 35, ${opacity})`
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
      }

      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)

    const resizeObserver = new ResizeObserver(() => resizeCanvas())
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [noise, noiseIntensity, particleCount, particleSize.max, particleSize.min])

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full overflow-hidden bg-transparent", className)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="relative z-10 flex h-full w-full items-center justify-center">
        {children}
      </div>
    </div>
  )
}

export default FluidParticlesBackground
