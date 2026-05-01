-- Migration: add_soft_delete_status
-- Adds status field to users and org_memberships for soft delete support.

CREATE TYPE "UserStatus" AS ENUM ('ACTIVO', 'INACTIVO');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVO', 'INACTIVO');

ALTER TABLE "users"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVO';

ALTER TABLE "org_memberships"
  ADD COLUMN "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVO';
