ALTER TABLE "InventoryTransaction"
ADD COLUMN "orderId" TEXT;

CREATE UNIQUE INDEX "InventoryTransaction_orderId_productId_type_key"
ON "InventoryTransaction"("orderId", "productId", "type");

ALTER TABLE "InventoryTransaction"
ADD CONSTRAINT "InventoryTransaction_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
