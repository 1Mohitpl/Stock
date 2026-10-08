-- Add scannable Product ID / Barcode to products.
-- Nullable so existing rows keep working; uniqueness is per-org.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Per-org uniqueness for non-empty barcodes (NULLs allowed multiple).
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_barcode_org
  ON public.products (org_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

-- Fast lookup for billing scan match.
CREATE INDEX IF NOT EXISTS idx_products_barcode
  ON public.products (barcode);
