import { Suspense } from "react"

import { PersonaConsole } from "@/components/personas/persona-console"

export default function PersonasPage() {
  return (
    <main className="min-h-full bg-background">
      <Suspense
        fallback={<div className="min-h-full bg-background" aria-label="Loading personas" />}
      >
        <PersonaConsole />
      </Suspense>
    </main>
  )
}
