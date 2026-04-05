"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, Calendar, DollarSign, MapPin, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { type Contract } from "./contract-card"
import { UploadDialog } from "./upload-dialog"

interface ContractDetailProps {
  contractId: string
  userRole: "business" | "consumer"
  onBack: () => void
}

interface Submission {
  id: string
  created_at: string
  payout_cents: number
  platform_fee_cents: number
  profiles?: { display_name: string }
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
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

export function ContractDetail({
  contractId,
  userRole,
  onBack,
}: ContractDetailProps) {
  const [contract, setContract] = useState<Contract | null>(null)
  const [userSubmission, setUserSubmission] = useState<{
    id: string
    payout_cents: number
  } | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchContract = useCallback(async () => {
    const res = await fetch(`/api/marketplace/contracts/${contractId}`)
    if (res.ok) {
      const data = await res.json()
      setContract(data.contract)
      setUserSubmission(data.user_submission)
    }
  }, [contractId])

  const fetchSubmissions = useCallback(async () => {
    if (userRole !== "business") return
    const res = await fetch(
      `/api/marketplace/contracts/${contractId}/submissions`
    )
    if (res.ok) {
      const data = await res.json()
      setSubmissions(data.submissions)
    }
  }, [contractId, userRole])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchContract(), fetchSubmissions()]).finally(() =>
      setLoading(false)
    )
  }, [fetchContract, fetchSubmissions])

  if (loading || !contract) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  const slotsRemaining = contract.total_slots - contract.filled_slots
  const canSubmit =
    userRole === "consumer" &&
    contract.status === "open" &&
    !userSubmission &&
    slotsRemaining > 0

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to marketplace
      </button>

      <div className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            <MapPin className="size-3" />
            {typeLabels[contract.recording_type] || contract.recording_type}
          </Badge>
          <Badge
            variant="outline"
            className={
              contract.status === "open"
                ? "border-emerald-500/30 text-emerald-500"
                : ""
            }
          >
            {contract.status}
          </Badge>
        </div>
        <h1 className="mb-2 text-xl font-semibold tracking-tight text-foreground">
          {contract.title}
        </h1>
        {contract.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {contract.description}
          </p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <DollarSign className="mb-1 size-4 text-muted-foreground" />
          <p className="text-lg font-semibold text-foreground">
            {formatCents(contract.price_per_recording_cents)}
          </p>
          <p className="text-[10px] text-muted-foreground">per recording</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <Users className="mb-1 size-4 text-muted-foreground" />
          <p className="text-lg font-semibold text-foreground">
            {contract.filled_slots}/{contract.total_slots}
          </p>
          <p className="text-[10px] text-muted-foreground">slots filled</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <DollarSign className="mb-1 size-4 text-muted-foreground" />
          <p className="text-lg font-semibold text-foreground">
            {contract.platform_fee_percent}%
          </p>
          <p className="text-[10px] text-muted-foreground">platform fee</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <Calendar className="mb-1 size-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            {new Date(contract.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </p>
          <p className="text-[10px] text-muted-foreground">created</p>
        </div>
      </div>

      {contract.profiles?.display_name && (
        <p className="mb-6 text-xs text-muted-foreground">
          Posted by{" "}
          <span className="font-medium text-foreground">
            {contract.profiles.display_name}
          </span>
        </p>
      )}

      {canSubmit && (
        <div className="mb-8">
          <Button
            onClick={() => setUploadOpen(true)}
            className="h-10 rounded-xl bg-mango-500 px-6 text-white hover:bg-mango-500/90"
          >
            Accept & Upload Recording
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            You&apos;ll earn{" "}
            <span className="font-medium text-foreground">
              {formatCents(
                Math.round(
                  contract.price_per_recording_cents *
                    (1 - Number(contract.platform_fee_percent) / 100)
                )
              )}
            </span>{" "}
            after the {contract.platform_fee_percent}% platform fee.
          </p>
        </div>
      )}

      {userSubmission && (
        <div className="mb-8 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-sm font-medium text-emerald-500">
            You&apos;ve already submitted to this contract
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            You earned {formatCents(userSubmission.payout_cents)}
          </p>
        </div>
      )}

      {userRole === "business" && submissions.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Submissions ({submissions.length})
          </h2>
          <div className="flex flex-col gap-2">
            {submissions.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {sub.profiles?.display_name || "Consumer"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(sub.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">
                    {formatCents(sub.payout_cents + sub.platform_fee_cents)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">paid</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {userRole === "business" && submissions.length === 0 && (
        <div className="rounded-xl border border-border/50 bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No submissions yet. Consumers will appear here as they upload
            recordings.
          </p>
        </div>
      )}

      {canSubmit && (
        <UploadDialog
          contractId={contractId}
          contractTitle={contract.title}
          priceCents={contract.price_per_recording_cents}
          feePct={Number(contract.platform_fee_percent)}
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onUploaded={() => {
            fetchContract()
          }}
        />
      )}
    </div>
  )
}
