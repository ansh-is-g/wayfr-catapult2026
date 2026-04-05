"use client"

import { useState } from "react"
import { Briefcase, Camera } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface RoleSelectorProps {
  onSelect: (role: "business" | "consumer", displayName: string) => void
  loading?: boolean
}

const roles = [
  {
    id: "business" as const,
    icon: Briefcase,
    title: "Business",
    description:
      "Create contracts requesting space recordings. Access our 3D reconstruction pipeline with a broader video pool.",
  },
  {
    id: "consumer" as const,
    icon: Camera,
    title: "Consumer",
    description:
      "Browse contracts and earn by uploading recordings of your spaces. Get paid instantly on each submission.",
  },
]

export function RoleSelector({ onSelect, loading }: RoleSelectorProps) {
  const [selected, setSelected] = useState<"business" | "consumer" | null>(
    null
  )
  const [name, setName] = useState("")

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-16">
      <div className="mb-2 text-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          marketplace
        </p>
      </div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
        How will you use the marketplace?
      </h1>
      <p className="mb-10 max-w-md text-center text-sm text-muted-foreground">
        Choose your role to get started. This determines what you can do in
        the marketplace.
      </p>

      <div className="grid w-full max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
        {roles.map((role) => {
          const Icon = role.icon
          const isSelected = selected === role.id
          return (
            <button
              key={role.id}
              onClick={() => setSelected(role.id)}
              className={cn(
                "group flex flex-col items-start gap-4 rounded-xl border p-6 text-left transition-all",
                isSelected
                  ? "border-mango-500 bg-mango-500/8 ring-1 ring-mango-500/30"
                  : "border-border/50 bg-card hover:border-border hover:bg-card/80"
              )}
            >
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-xl transition-colors",
                  isSelected
                    ? "bg-mango-500/15 text-mango-500"
                    : "bg-muted text-muted-foreground group-hover:text-foreground"
                )}
              >
                <Icon className="size-5" />
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold text-foreground">
                  {role.title}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {role.description}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <label className="text-xs font-medium text-muted-foreground">
            Display name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              selected === "business" ? "Company name" : "Your name"
            }
            className="h-9"
          />
          <Button
            onClick={() => onSelect(selected, name)}
            disabled={!name.trim() || loading}
            className="mt-1 h-9 rounded-xl bg-mango-500 text-white hover:bg-mango-500/90"
          >
            {loading ? "Setting up..." : "Continue"}
          </Button>
        </div>
      )}
    </div>
  )
}
