"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CreateContractDialogProps {
  onCreated: () => void
}

const recordingTypes = [
  { value: "house", label: "House" },
  { value: "apartment", label: "Apartment" },
  { value: "office", label: "Office" },
  { value: "warehouse", label: "Warehouse" },
  { value: "retail", label: "Retail Store" },
  { value: "restaurant", label: "Restaurant" },
  { value: "outdoor", label: "Outdoor Space" },
  { value: "other", label: "Other" },
]

export function CreateContractDialog({
  onCreated,
}: CreateContractDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [recordingType, setRecordingType] = useState("")
  const [totalSlots, setTotalSlots] = useState("")
  const [pricePerRecording, setPricePerRecording] = useState("")

  async function handleSubmit() {
    setError("")
    setLoading(true)

    const priceCents = Math.round(parseFloat(pricePerRecording) * 100)
    if (isNaN(priceCents) || priceCents < 100) {
      setError("Price must be at least $1.00")
      setLoading(false)
      return
    }

    const slots = parseInt(totalSlots, 10)
    if (isNaN(slots) || slots < 1) {
      setError("Must request at least 1 recording")
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/marketplace/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          recording_type: recordingType,
          total_slots: slots,
          price_per_recording_cents: priceCents,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to create contract")
        return
      }

      setTitle("")
      setDescription("")
      setRecordingType("")
      setTotalSlots("")
      setPricePerRecording("")
      setOpen(false)
      onCreated()
    } catch {
      setError("Network error")
    } finally {
      setLoading(false)
    }
  }

  const isValid =
    title.trim() && recordingType && totalSlots && pricePerRecording

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="h-9 gap-1.5 rounded-xl bg-mango-500 text-white hover:bg-mango-500/90" />
        }
      >
        <Plus className="size-4" />
        Create Contract
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Contract</DialogTitle>
          <DialogDescription>
            Specify what recordings you need and how much you&apos;ll pay per
            submission.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2-bedroom house walkthrough"
              className="h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Description (optional)
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe any specific requirements for the recording..."
              className="min-h-20"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Space type
            </label>
            <Select value={recordingType} onValueChange={(v) => setRecordingType(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {recordingTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Recordings needed
              </label>
              <Input
                type="number"
                min={1}
                value={totalSlots}
                onChange={(e) => setTotalSlots(e.target.value)}
                placeholder="e.g. 7"
                className="h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Price per recording ($)
              </label>
              <Input
                type="number"
                min={1}
                step={0.01}
                value={pricePerRecording}
                onChange={(e) => setPricePerRecording(e.target.value)}
                placeholder="e.g. 25.00"
                className="h-9"
              />
            </div>
          </div>

          {pricePerRecording && totalSlots && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Total cost:{" "}
              <span className="font-medium text-foreground">
                $
                {(
                  parseFloat(pricePerRecording || "0") *
                  parseInt(totalSlots || "0", 10)
                ).toFixed(2)}
              </span>{" "}
              for {totalSlots} recording{parseInt(totalSlots) !== 1 ? "s" : ""}
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className="rounded-xl bg-mango-500 text-white hover:bg-mango-500/90"
          >
            {loading ? "Creating..." : "Create Contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
