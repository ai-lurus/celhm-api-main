-- Migration: add device_type column to device_models table
-- Apply this on your platform (Supabase / Postgres dashboard or CLI)

ALTER TABLE "device_models" ADD COLUMN IF NOT EXISTS "deviceType" TEXT;
