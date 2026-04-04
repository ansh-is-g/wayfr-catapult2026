"use client"

import { cn } from "@/lib/utils"

type PersonaFaceProps = {
  className?: string
  size?: "sm" | "md" | "lg"
}

function Eye({
  className,
  delay = 0,
}: {
  className?: string
  delay?: number
}) {
  return (
    <>
      <span className={cn("persona-face-eye", className)} style={{ animationDelay: `${delay}s` }} />
      <style jsx>{`
        .persona-face-eye {
          display: inline-block;
          width: 26px;
          height: 18px;
          border-radius: 6px;
          background: linear-gradient(180deg, rgba(245, 166, 35, 1), rgba(196, 122, 30, 0.96));
          box-shadow:
            0 0 0 1px rgba(245, 166, 35, 0.24),
            0 0 18px rgba(245, 166, 35, 0.32),
            inset 0 0 0 1px rgba(255, 248, 239, 0.18);
          animation: personaFaceBlink 4.9s steps(1, end) infinite;
          transform-origin: center;
        }

        @keyframes personaFaceBlink {
          0%,
          88%,
          100% {
            transform: scaleY(1);
          }
          90%,
          93% {
            transform: scaleY(0.12);
          }
        }
      `}</style>
    </>
  )
}

export function PersonaFace({ className, size = "md" }: PersonaFaceProps) {
  const sizeClasses = {
    sm: "h-12 w-32",
    md: "h-14 w-40",
    lg: "h-16 w-48",
  }

  const eyeClasses = {
    sm: "scale-90",
    md: "scale-100",
    lg: "scale-110",
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-[1.5rem] border border-border/60 bg-background/72 p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur-2xl dark:shadow-[0_24px_80px_rgba(0,0,0,0.22)]",
        sizeClasses[size],
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(245,166,35,0.18),transparent_55%)] dark:bg-[radial-gradient(circle_at_50%_30%,rgba(245,166,35,0.22),transparent_55%)]" />
      <div className="relative flex h-full items-center justify-center rounded-[1.1rem] border border-mango/10 bg-[linear-gradient(180deg,rgba(255,253,249,0.9),rgba(255,248,240,0.45))] dark:bg-[linear-gradient(180deg,rgba(20,16,11,0.78),rgba(14,12,10,0.4))]">
        <div className="flex items-center gap-2.5">
          <Eye className={cn("-rotate-12", eyeClasses[size])} />
          <Eye className={cn("rotate-12", eyeClasses[size])} delay={0.18} />
        </div>
        <div className="pointer-events-none absolute inset-x-4 bottom-2 h-px rounded-full bg-gradient-to-r from-transparent via-mango/20 to-transparent" />
      </div>
    </div>
  )
}

export default PersonaFace
