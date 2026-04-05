"use client"

import { Clock, MapPin } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

export interface Contract {
  id: string
  business_id: string
  title: string
  description: string
  recording_type: string
  total_slots: number
  filled_slots: number
  price_per_recording_cents: number
  platform_fee_percent: number
  status: string
  created_at: string
  updated_at: string
  profiles?: { display_name: string }
}

interface ContractCardProps {
  contract: Contract
  onClick?: () => void
  showBusiness?: boolean
}

const typeLabels: Record<string, string> = {
  house: "House",
  apartment: "Apartment",
  office: "Office",
  warehouse: "Warehouse",
  retail: "Retail",
  restaurant: "Restaurant",
  outdoor: "Outdoor",
  other: "Other",
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function ContractCard({
  contract,
  onClick,
  showBusiness = true,
}: ContractCardProps) {
  const slotsRemaining = contract.total_slots - contract.filled_slots
  const progress = (contract.filled_slots / contract.total_slots) * 100

  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4 text-left transition-all hover:border-border hover:bg-card/80",
        contract.status !== "open" && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          <MapPin className="size-3" />
          {typeLabels[contract.recording_type] || contract.recording_type}
        </Badge>
        <Badge
          variant={contract.status === "open" ? "default" : "outline"}
          className={cn(
            "text-[10px]",
            contract.status === "open" &&
              "bg-emerald-500/15 text-emerald-500 dark:bg-emerald-500/20"
          )}
        >
          {contract.status === "open"
            ? `${slotsRemaining} slot${slotsRemaining !== 1 ? "s" : ""} left`
            : contract.status}
        </Badge>
      </div>

      <div className="min-w-0">
        <h3 className="mb-1 truncate text-sm font-semibold text-foreground">
          {contract.title}
        </h3>
        {contract.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {contract.description}
          </p>
        )}
      </div>

      <div className="mt-auto flex items-end justify-between gap-2">
        <div>
          <p className="text-lg font-semibold tracking-tight text-foreground">
            {formatCents(contract.price_per_recording_cents)}
          </p>
          <p className="text-[10px] text-muted-foreground">per recording</p>
        </div>
        <div className="text-right">
          <div className="mb-1 h-1 w-16 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-mango-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {contract.filled_slots}/{contract.total_slots} filled
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/30 pt-2">
        {showBusiness && contract.profiles?.display_name && (
          <p className="truncate text-[10px] text-muted-foreground">
            {contract.profiles.display_name}
          </p>
        )}
        <p className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="size-3" />
          {timeAgo(contract.created_at)}
        </p>
      </div>
    </button>
  )
}
