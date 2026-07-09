-- Per-group discount percentage (0-100), applied by the POS when a customer
-- belonging to the group is selected on a sale.
ALTER TABLE "customer_groups" ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
