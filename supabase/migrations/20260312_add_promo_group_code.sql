ALTER TABLE public.promotions
ADD COLUMN IF NOT EXISTS promo_group_code text;

UPDATE public.promotions
SET promo_group_code = promo_code
WHERE COALESCE(promo_group_code, '') = '';

CREATE INDEX IF NOT EXISTS promotions_promo_group_code_idx
ON public.promotions (promo_group_code);
