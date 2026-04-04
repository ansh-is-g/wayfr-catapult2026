"use client"

import { MagicCard } from "@/components/ui/magic-card"
import { Marquee } from "@/components/ui/marquee"
import { BorderBeam } from "@/components/ui/border-beam"
import { BlurFade } from "@/components/ui/blur-fade"
import { TextAnimate } from "@/components/ui/text-animate"
import { useTheme } from "next-themes"
import { Layers3, Map, Type, Shield, Users } from "lucide-react"
import { cn } from "@/lib/utils"

const ocrSamples = [
  "EXIT \u2192", "PULL TO OPEN", "WET FLOOR", "PLATFORM 3",
  "CAUTION: STEP", "PUSH", "ACCESSIBLE ROUTE", "MIND THE GAP",
  "CROSSWALK SIGNAL", "ELEVATOR", "RESTROOMS \u2192", "EMERGENCY EXIT",
]

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
  children?: React.ReactNode
  className?: string
}

function FeatureCard({ icon, title, description, children, className }: FeatureCardProps) {
  const { theme } = useTheme()
  return (
    <MagicCard
      className={cn("relative flex flex-col rounded-2xl p-6 border-border/20", className)}
      gradientColor={theme === "dark" ? "oklch(0.735 0.152 71 / 6%)" : "oklch(0.735 0.152 71 / 10%)"}
      gradientOpacity={0.12}
    >
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-mango/10 text-mango">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
      {children && <div className="mt-4 flex-1">{children}</div>}
    </MagicCard>
  )
}

export function Features() {
  return (
    <section className="py-28">
      <div className="mx-auto max-w-6xl px-6">
        <BlurFade delay={0.1}>
          <div className="mb-16 text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-mango">
              Features
            </p>
            <TextAnimate
              as="h2"
              className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
              animation="blurInUp"
              by="word"
            >
              Everything a guide should be.
            </TextAnimate>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Row 1 — 3 cards */}
          <BlurFade delay={0.15} className="md:col-span-2">
            <FeatureCard
              icon={<Layers3 className="h-5 w-5" />}
              title="3D Scene Annotation"
              description="Custom models turn walkthroughs into anchored objects, labels, and spatial context in real time."
              className="h-full"
            >
              <div className="space-y-2">
                {[
                  { label: "Table", dist: "3 ft ahead", urgency: "high" as const },
                  { label: "Window", dist: "5 ft right", urgency: "medium" as const },
                  { label: "Open space", dist: "left", urgency: "low" as const },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs backdrop-blur">
                    <span className="font-medium">{item.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{item.dist}</span>
                      <span className={cn(
                        "h-2 w-2 rounded-full",
                        item.urgency === "high" ? "bg-destructive" : item.urgency === "medium" ? "bg-mango" : "bg-green-500"
                      )} />
                    </div>
                  </div>
                ))}
              </div>
            </FeatureCard>
          </BlurFade>

          <BlurFade delay={0.2}>
            <FeatureCard
              icon={<Map className="h-5 w-5" />}
              title="Shared Scene Map"
              description="Verified scene updates stay anchored to the same 3D world model."
              className="h-full"
            >
              <div className="relative -mx-2 -mb-2 h-40 overflow-hidden rounded-xl">
                <div className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_center,rgba(245,166,35,0.14),transparent_45%)]" />
              </div>
            </FeatureCard>
          </BlurFade>

          {/* Row 2 — 3 cards */}
          <BlurFade delay={0.25}>
            <FeatureCard
              icon={<Shield className="h-5 w-5" />}
              title="Persona Trust"
              description="Every scene update comes from a verified contributor with an auditable trail."
              className="h-full"
            >
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-green-500">&check;</span>
                  <span className="text-sm font-medium">Verified contributor</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">0x7f3c...a8d2</span>
                </div>
              </div>
            </FeatureCard>
          </BlurFade>

          <BlurFade delay={0.3}>
            <FeatureCard
              icon={<Type className="h-5 w-5" />}
              title="Scene Labels"
              description="Signs, menus, and labels become readable anchors in the same shared scene."
              className="h-full"
            >
              <div className="space-y-2 overflow-hidden rounded-xl">
                <Marquee className="text-xs [--duration:20s]" pauseOnHover>
                  {ocrSamples.map((s) => (
                    <span key={s} className="mx-2 rounded-lg border border-mango/15 bg-mango/5 px-2 py-1 font-mono text-mango text-[10px]">
                      {s}
                    </span>
                  ))}
                </Marquee>
                <Marquee className="text-xs [--duration:16s]" reverse pauseOnHover>
                  {ocrSamples.slice().reverse().map((s) => (
                    <span key={s} className="mx-2 rounded-lg border border-mango/15 bg-mango/5 px-2 py-1 font-mono text-mango text-[10px]">
                      {s}
                    </span>
                  ))}
                </Marquee>
              </div>
            </FeatureCard>
          </BlurFade>

          <BlurFade delay={0.35}>
            <div className="relative h-full overflow-hidden rounded-2xl">
              <FeatureCard
                icon={<Users className="h-5 w-5" />}
                title="Home Dashboard"
                description="Review mapped homes, reopen saved scenes, and move directly into persona overlays."
                className="h-full"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2 backdrop-blur">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mango opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-mango" />
                  </span>
                    <span className="text-sm font-medium">Kitchen scene — Ready</span>
                    <span className="ml-auto text-xs text-muted-foreground">24 objects</span>
                  </div>
                  <p className="px-1 text-[10px] font-mono text-muted-foreground">
                    history · scene.glb · persona overlay ready
                  </p>
                </div>
              </FeatureCard>
              <BorderBeam size={80} duration={6} colorFrom="#F5A623" colorTo="#FDDDA0" />
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  )
}
