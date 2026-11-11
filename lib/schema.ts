// Idempotent schema. Runs on every boot (CREATE ... IF NOT EXISTS).
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS family (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_name TEXT NOT NULL,
  telegram_chat_id TEXT,
  monthly_target_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  clock_offset_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,              -- parent | sibling
  is_approver BOOLEAN NOT NULL DEFAULT false,
  paypal_email TEXT,
  telegram_user_id TEXT,
  share_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS policy (
  family_id TEXT PRIMARY KEY REFERENCES family(id) ON DELETE CASCADE,
  per_item_limit_cents INTEGER NOT NULL,
  auto_capture_max_cents INTEGER NOT NULL,
  hold_timeout_hours INTEGER NOT NULL DEFAULT 24,
  blocked_categories TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS merchant (
  id TEXT PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  registered_at TIMESTAMPTZ,       -- from RDAP (or demo override)
  registered_source TEXT,          -- rdap | demo-seed | unknown
  allowlisted BOOLEAN NOT NULL DEFAULT false,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contribution (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  period TEXT NOT NULL,            -- e.g. 2026-11
  amount_cents INTEGER NOT NULL,
  part INTEGER NOT NULL DEFAULT 1, -- for split invoices
  invoice_id TEXT,
  payer_url TEXT,
  status TEXT NOT NULL,            -- draft | sent | paid | cancelled | covered
  ladder_step INTEGER NOT NULL DEFAULT 0,
  last_nudge_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  covered_by TEXT,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS iou (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  debtor_id TEXT NOT NULL,
  creditor_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  period TEXT NOT NULL,
  settled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL REFERENCES merchant(id),
  item TEXT NOT NULL,
  category TEXT,
  amount_cents INTEGER NOT NULL,
  product_url TEXT,
  order_id TEXT,
  authorization_id TEXT,
  capture_id TEXT,
  state TEXT NOT NULL,
  risk_score INTEGER,
  risk_breakdown JSONB,
  risk_flags JSONB,
  injection_detected BOOLEAN,
  mom_message TEXT,
  family_message TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  held_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payout (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  period TEXT NOT NULL,
  batch_id TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The family chat. Mirrors Telegram when configured; always shown in-app.
CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  author TEXT NOT NULL,            -- 'holdon' or member id
  audience TEXT NOT NULL DEFAULT 'group', -- group | member id (DM)
  text TEXT NOT NULL,
  card JSONB,                      -- approval / cover card with buttons
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log: every PayPal webhook, agent tool call, decision.
CREATE TABLE IF NOT EXISTS event (
  id TEXT PRIMARY KEY,
  family_id TEXT,
  type TEXT NOT NULL,
  source TEXT NOT NULL,            -- paypal | paypal_webhook | agent | telegram | cron | user
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agentic reorders: Mom's PayPal saved with PayPal Vault (buyer-not-present payments).
ALTER TABLE member ADD COLUMN IF NOT EXISTS paypal_vault_id TEXT;
ALTER TABLE purchase ADD COLUMN IF NOT EXISTS initiated_by TEXT NOT NULL DEFAULT 'parent';
`;
