"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type PersonaPreviewCardProps = {
  className?: string
  title?: string
  subtitle?: string
  personas?: string[]
}

const DEFAULT_PERSONAS = ["reader", "caregiver", "guide"]

function SquareEye({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="persona-eye"
      style={{
        animationDelay: `${delay}s`,
      }}
    />
  )
}

export function PersonaPreviewCard({
  className,
  title = "Persona overlay preview",
  subtitle = "A compact sample of how the same room can read differently per persona.",
  personas = DEFAULT_PERSONAS,
}: PersonaPreviewCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/70 bg-card/85 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:shadow-[0_28px_90px_rgba(0,0,0,0.26)]",
        className
      )}
    >
      <div className="absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(245,166,35,0.16),transparent_72%)] dark:bg-[radial-gradient(circle_at_top,rgba(245,166,35,0.2),transparent_72%)]" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-mango/90">
            Persona sample
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
            {subtitle}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-2">
          <SquareEye delay={0} />
          <SquareEye delay={0.18} />
        </div>
      </div>

      <div className="relative mt-4 rounded-[1.4rem] border border-border/60 bg-background/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-foreground">Live persona state</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Blinking square eyes, mango hue, low-clutter overlay.
            </p>
          </div>
          <Badge className="rounded-full border-mango/20 bg-mango/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-mango shadow-none">
            active
          </Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {personas.map((persona) => (
            <span
              key={persona}
              className="rounded-full border border-mango/20 bg-mango/8 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-mango"
            >
              {persona}
            </span>
          ))}
        </div>
      </div>

      <style jsx>{`
        .persona-eye {
          display: inline-block;
          width: 14px;
          height: 14px;
          border-radius: 4px;
          background: linear-gradient(180deg, rgba(245, 166, 35, 1), rgba(196, 122, 30, 0.96));
          box-shadow:
            0 0 0 1px rgba(245, 166, 35, 0.25),
            0 0 16px rgba(245, 166, 35, 0.4),
            inset 0 0 0 1px rgba(255, 248, 239, 0.2);
          animation: personaBlink 4.6s steps(1, end) infinite;
          transform-origin: center;
        }

        @keyframes personaBlink {
          0%, 90%, 100% {
            transform: scaleY(1);
          }
          92%, 94% {
            transform: scaleY(0.12);
          }
        }
      `}</style>
    </div>
  )
}

export default PersonaPreviewCard
