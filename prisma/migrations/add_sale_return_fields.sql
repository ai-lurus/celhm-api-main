-- Migration: Add return fields to sales table and DEV movement type
-- Run this manually in your database

-- 1. Add isReturn flag and returnOfSaleId to the sales table
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS "isReturn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "returnOfSaleId" INTEGER REFERENCES sales(id) ON DELETE SET NULL;

-- 2. Add index for easy lookup of returns
CREATE INDEX IF NOT EXISTS "sales_returnOfSaleId_idx" ON sales("returnOfSaleId");

-- 3. Add DEV value to the MovementType enum
-- PostgreSQL requires a specific syntax to add enum values
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'DEV';
