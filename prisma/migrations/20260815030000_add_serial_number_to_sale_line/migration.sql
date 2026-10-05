-- Número de serie / IMEI del producto vendido en esta línea, capturado opcionalmente
-- en el punto de venta. Usado por los reportes de ventas por vendedor (nivel "detalles
-- y número de serie"). Para líneas de orden de reparación, el serial/IMEI real del
-- equipo ya vive en Ticket.serialNumber / Ticket.imei; esta columna es para ventas de
-- producto normal.
ALTER TABLE "sale_lines" ADD COLUMN "serialNumber" TEXT;
