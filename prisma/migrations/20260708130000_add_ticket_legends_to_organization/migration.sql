-- Add configurable footer legends (e.g. Garantía, Devoluciones) printed at the bottom of tickets.
ALTER TABLE "organizations" ADD COLUMN "ticketLegends" JSONB NOT NULL DEFAULT '[]';

-- Seed the three default legends for existing organizations so admins have something to edit.
UPDATE "organizations"
SET "ticketLegends" = '[
  {"id": "garantia", "label": "Garantía", "body": "", "enabled": false},
  {"id": "devoluciones", "label": "Devoluciones", "body": "", "enabled": false},
  {"id": "nota-adicional", "label": "Nota adicional", "body": "", "enabled": false}
]'::jsonb
WHERE "ticketLegends" = '[]'::jsonb;
