export interface Profile {
  id: string
  clerk_id: string
  role: "business" | "consumer"
  display_name: string
  balance_cents: number
  created_at: string
  updated_at: string
}

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
  status: "open" | "filled" | "cancelled"
  created_at: string
  updated_at: string
}

export interface ContractSubmission {
  id: string
  contract_id: string
  consumer_id: string
  video_storage_path: string
  payout_cents: number
  platform_fee_cents: number
  created_at: string
}

export interface Transaction {
  id: string
  profile_id: string
  type: "payout" | "platform_fee" | "escrow_lock"
  amount_cents: number
  reference_id: string | null
  description: string
  created_at: string
}
