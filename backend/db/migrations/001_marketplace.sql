-- ══════════════════════════════════════════════════════════════════════════
-- Migration 001: Marketplace tables, indexes, RLS, and storage bucket
-- Run this in the Supabase SQL editor (or via psql).
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT throughout.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── profiles ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_id      TEXT UNIQUE NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('business', 'consumer')),
    display_name  TEXT NOT NULL DEFAULT '',
    balance_cents BIGINT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_clerk_id_idx ON profiles (clerk_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'profiles_all_service'
      AND tablename  = 'profiles'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY "profiles_all_service" ON profiles FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- ── contracts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title                     TEXT NOT NULL,
    description               TEXT NOT NULL DEFAULT '',
    recording_type            TEXT NOT NULL CHECK (recording_type IN (
                                  'house', 'apartment', 'office', 'warehouse',
                                  'retail', 'restaurant', 'outdoor', 'other'
                              )),
    total_slots               INTEGER NOT NULL CHECK (total_slots > 0),
    filled_slots              INTEGER NOT NULL DEFAULT 0,
    price_per_recording_cents BIGINT NOT NULL CHECK (price_per_recording_cents > 0),
    platform_fee_percent      NUMERIC(5,2) NOT NULL DEFAULT 15.00,
    status                    TEXT NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open', 'filled', 'cancelled')),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contracts_business_id_idx ON contracts (business_id);
CREATE INDEX IF NOT EXISTS contracts_status_idx      ON contracts (status);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'contracts_all_service'
      AND tablename  = 'contracts'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY "contracts_all_service" ON contracts FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- ── contract_submissions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_submissions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id        UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    consumer_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    video_storage_path TEXT NOT NULL,
    payout_cents       BIGINT NOT NULL,
    platform_fee_cents BIGINT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(contract_id, consumer_id)
);

CREATE INDEX IF NOT EXISTS contract_submissions_contract_id_idx ON contract_submissions (contract_id);
CREATE INDEX IF NOT EXISTS contract_submissions_consumer_id_idx ON contract_submissions (consumer_id);

ALTER TABLE contract_submissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'contract_submissions_all_service'
      AND tablename  = 'contract_submissions'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY "contract_submissions_all_service" ON contract_submissions FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- ── transactions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type         TEXT NOT NULL CHECK (type IN ('payout', 'platform_fee', 'escrow_lock')),
    amount_cents BIGINT NOT NULL,
    reference_id UUID,
    description  TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_profile_id_idx ON transactions (profile_id);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'transactions_all_service'
      AND tablename  = 'transactions'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY "transactions_all_service" ON transactions FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- ── Storage bucket for marketplace recordings ───────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketplace-recordings', 'marketplace-recordings', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'service_role_all_marketplace_recordings'
      AND tablename  = 'objects'
      AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "service_role_all_marketplace_recordings"
      ON storage.objects FOR ALL TO service_role
      USING (bucket_id = 'marketplace-recordings');
  END IF;
END $$;

COMMIT;
