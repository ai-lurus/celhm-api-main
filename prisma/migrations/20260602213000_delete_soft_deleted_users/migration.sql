-- Remove foreign key references to soft deleted users for relations without cascading deletes
UPDATE "movements" SET "userId" = NULL WHERE "userId" IN (SELECT "id" FROM "users" WHERE "status" = 'INACTIVO');
UPDATE "payments" SET "userId" = NULL WHERE "userId" IN (SELECT "id" FROM "users" WHERE "status" = 'INACTIVO');
UPDATE "sales" SET "userId" = NULL WHERE "userId" IN (SELECT "id" FROM "users" WHERE "status" = 'INACTIVO');
UPDATE "ticket_history" SET "userId" = NULL WHERE "userId" IN (SELECT "id" FROM "users" WHERE "status" = 'INACTIVO');
UPDATE "tickets" SET "userId" = NULL WHERE "userId" IN (SELECT "id" FROM "users" WHERE "status" = 'INACTIVO');
UPDATE "tickets" SET "assignedUserId" = NULL WHERE "assignedUserId" IN (SELECT "id" FROM "users" WHERE "status" = 'INACTIVO');
UPDATE "cash_cuts" SET "userId" = NULL WHERE "userId" IN (SELECT "id" FROM "users" WHERE "status" = 'INACTIVO');

-- Finally, delete the soft-deleted users
DELETE FROM "users" WHERE "status" = 'INACTIVO';
