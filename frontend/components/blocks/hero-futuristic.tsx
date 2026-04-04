'use client'

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { FluidParticlesBackground } from "@/components/ui/fluid-particles-background"

function HeroBackdrop() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,166,35,0.16),transparent_28%),radial-gradient(circle_at_80%_30%,rgba(245,166,35,0.08),transparent_24%),linear-gradient(180deg,rgba(255,253,249,0.98),rgba(255,247,236,0.98))] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(245,166,35,0.18),transparent_28%),radial-gradient(circle_at_80%_30%,rgba(245,166,35,0.1),transparent_24%),linear-gradient(180deg,rgba(18,14,10,0.92),rgba(12,10,8,0.98))]" />
  )
}

export const HeroFuturistic = () => {
  return (
    <div className="relative overflow-hidden bg-background">
      <HeroBackdrop />
      <FluidParticlesBackground
        className="absolute inset-0"
        particleCount={980}
        noiseIntensity={0.0024}
        particleSize={{ min: 0.7, max: 2.6 }}
      />
      <div className="absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,rgba(255,253,249,0.92)_0%,rgba(255,253,249,0.84)_34%,rgba(255,253,249,0.42)_60%,rgba(255,253,249,0.08)_100%)] dark:bg-[linear-gradient(90deg,rgba(12,10,8,0.92)_0%,rgba(12,10,8,0.82)_34%,rgba(12,10,8,0.34)_60%,rgba(12,10,8,0.06)_100%)]" />

      <div className="relative mx-auto flex min-h-[88svh] max-w-6xl items-center px-6 pb-14 pt-28">
        <div className="relative z-10 max-w-2xl">
          <Badge className="rounded-full border-mango/20 bg-mango/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-mango shadow-none">
            3D Spatial Annotation
          </Badge>

          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.06em] text-foreground sm:text-5xl xl:text-[3.8rem]">
            Build one 3D scene. Let each persona read it differently.
          </h1>

          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
            wayfr turns walkthrough video into a shared spatial annotation layer, then adapts labels, guidance, and context per persona.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/setup"
              className="inline-flex items-center justify-center rounded-full bg-mango px-6 py-3 text-sm font-semibold text-background shadow-[0_18px_48px_rgba(245,166,35,0.18)] transition-colors hover:bg-mango/90"
            >
              Start mapping
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full border border-border/70 bg-card/65 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur-xl transition-colors hover:border-mango/35 hover:bg-mango/6"
            >
              Open dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HeroFuturistic
