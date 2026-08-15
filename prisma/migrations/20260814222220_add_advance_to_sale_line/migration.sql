-- Anticipo (advance payment) amount on sale line.
-- Informational only, does not affect the total calculation.
ALTER TABLE "sale_lines" ADD COLUMN "advance" DECIMAL(10,2) NOT NULL DEFAULT 0;
