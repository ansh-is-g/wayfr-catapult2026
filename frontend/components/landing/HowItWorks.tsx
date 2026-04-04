"use client"

import React, { forwardRef, useRef } from "react"
import { AnimatedBeam } from "@/components/ui/animated-beam"
import { MagicCard } from "@/components/ui/magic-card"
import { BlurFade } from "@/components/ui/blur-fade"
import { TextAnimate } from "@/components/ui/text-animate"
import { HyperText } from "@/components/ui/hyper-text"
import { Camera, Brain, Volume2, Users } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

interface NodeProps {
  icon: React.ReactNode
  label: string
  sublabel?: string
  highlight?: boolean
}

const Node = forwardRef<HTMLDivElement, NodeProps>(
  ({ icon, label, sublabel, highlight }, ref) => (
    <div ref={ref} className="flex flex-col items-center gap-3">
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-2xl border transition-all",
          highlight
            ? "border-mango/40 bg-mango/10 text-mango shadow-[0_0_30px_oklch(0.735_0.152_71/15%)]"
            : "border-border/40 bg-card/60 text-muted-foreground backdrop-blur"
        )}
      >
        {icon}
      </div>
      <div className="text-center">
        <p className={cn("text-sm font-medium", highlight ? "text-mango" : "text-foreground")}>
          {label}
        </p>
        {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
      </div>
    </div>
  )
)
Node.displayName = "Node"

const steps = [
  { step: "01", title: "Capture \u2192 3D", body: "Each frame becomes a shared scene layer, then back-projected into a persistent 3D map updated continuously." },
  { step: "02", title: "Annotate", body: "Novel 2D views rendered from the 3D scene are turned into anchored objects, labels, and spatial context." },
  { step: "03", title: "Persona layer", body: "Annotations are filtered into persona-specific guidance. A short spoken summary can be generated on top." },
]

export function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null)
  const glassesRef = useRef<HTMLDivElement>(null)
  const aiRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLDivElement>(null)
  const communityRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()

  return (
    <section id="how-it-works" className="py-28">
      <div className="mx-auto max-w-6xl px-6">
        <BlurFade delay={0.1}>
          <div className="mb-16 text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-mango">
              How it works
            </p>
            <TextAnimate
              as="h2"
              className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
              animation="blurInUp"
              by="word"
            >
              2D in. 3D understood. Audio out.
            </TextAnimate>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Every frame is reconstructed in 3D, organized into a shared scene, and then surfaced through persona-specific overlays.
            </p>
          </div>
        </BlurFade>

        <BlurFade delay={0.2}>
          <div
            ref={containerRef}
            className="relative mx-auto flex max-w-3xl items-center justify-between rounded-2xl border border-border/30 bg-card/40 p-12 backdrop-blur"
          >
            <Node
              ref={glassesRef}
              icon={<Camera className="h-7 w-7" />}
              label="Capture"
              sublabel="frame input"
            />
            <Node
              ref={communityRef}
              icon={<Users className="h-7 w-7" />}
              label="Shared scene"
              sublabel="scene map"
            />
            <Node
              ref={aiRef}
              icon={<Brain className="h-7 w-7" />}
              label="wayfr AI"
              sublabel="3D annotation"
              highlight
            />
            <Node
              ref={audioRef}
              icon={<Volume2 className="h-7 w-7" />}
              label="Output"
              sublabel="ElevenLabs TTS"
            />

            <AnimatedBeam
              containerRef={containerRef}
              fromRef={glassesRef}
              toRef={aiRef}
              gradientStartColor="#F5A623"
              gradientStopColor="#FDDDA0"
              pathColor="oklch(0.735 0.152 71 / 15%)"
            />
            <AnimatedBeam
              containerRef={containerRef}
              fromRef={communityRef}
              toRef={aiRef}
              gradientStartColor="#C47A1E"
              gradientStopColor="#F5A623"
              pathColor="oklch(0.735 0.152 71 / 15%)"
            />
            <AnimatedBeam
              containerRef={containerRef}
              fromRef={aiRef}
              toRef={audioRef}
              gradientStartColor="#F5A623"
              gradientStopColor="#FDDDA0"
              pathColor="oklch(0.735 0.152 71 / 15%)"
            />
          </div>
        </BlurFade>

        <BlurFade delay={0.3}>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {steps.map((item) => (
              <MagicCard
                key={item.step}
                className="rounded-2xl p-6 border-border/20"
                gradientColor={theme === "dark" ? "oklch(0.735 0.152 71 / 6%)" : "oklch(0.735 0.152 71 / 10%)"}
                gradientOpacity={0.1}
              >
                <HyperText className="font-mono text-xs text-mango">{item.step}</HyperText>
                <h3 className="mt-2 font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </MagicCard>
            ))}
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
