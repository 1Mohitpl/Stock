-- Soft-deleted products must release their SKU, and SKU/Category must be scoped
-- per org rather than globally.
--
-- products: `products_sku_key UNIQUE (sku)` is unconditional, so a soft-deleted
-- row keeps blocking its SKU forever. The client only ever lists live rows
-- (deleted_at IS NULL), so re-importing the same CSV tripped the constraint.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_sku_live
  ON public.products (org_id, sku)
  WHERE deleted_at IS NULL;

-- categories: `categories_name_key UNIQUE (name)` is global, so org B could not
-- create "Dairy" if org A already had it — which aborted CSV auto-creation.
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_name_org
  ON public.categories (org_id, name);

-- Lookup support for the CSV importer's duplicate checks.
CREATE INDEX IF NOT EXISTS idx_products_sku_live
  ON public.products (sku)
  WHERE deleted_at IS NULL;