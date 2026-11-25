-- db/migrations/0007_variant_order.sql
-- Colours show in the order they were typed when the product was added
-- ("Red, Blue" -> Red first). All rows of one product are saved in one go,
-- and now() is the same for the whole save, so they all got the same time.
-- clock_timestamp() moves on for every row, keeping the typed order.
alter table public.product_variants alter column created_at set default clock_timestamp();
