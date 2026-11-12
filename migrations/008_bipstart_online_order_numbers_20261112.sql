-- Start the per-store online order sequence at #000 for the next new order.
-- Historical orders keep their current references.

ALTER TABLE public.shop_online_orders
  ADD COLUMN IF NOT EXISTS order_number bigint;

CREATE SCHEMA IF NOT EXISTS bipstart_private;
REVOKE ALL ON SCHEMA bipstart_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS bipstart_private.shop_online_order_counters (
  shop_id uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT -1 CHECK (last_number >= -1)
);

ALTER TABLE bipstart_private.shop_online_order_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE bipstart_private.shop_online_order_counters FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS shop_online_orders_shop_order_number_uidx
  ON public.shop_online_orders (shop_id, order_number)
  WHERE order_number IS NOT NULL;

CREATE FUNCTION bipstart_private.assign_shop_online_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_number bigint;
BEGIN
  -- Serialize numbering per shop and avoid gaps for retried client tokens.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.shop_id::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.shop_online_orders AS existing
    WHERE existing.shop_id = NEW.shop_id
      AND existing.client_token = NEW.client_token
  ) THEN
    NEW.order_number := NULL;
    RETURN NEW;
  END IF;

  INSERT INTO bipstart_private.shop_online_order_counters (shop_id, last_number)
  VALUES (NEW.shop_id, -1)
  ON CONFLICT (shop_id) DO NOTHING;

  UPDATE bipstart_private.shop_online_order_counters
  SET last_number = last_number + 1
  WHERE shop_id = NEW.shop_id
  RETURNING last_number INTO v_number;

  NEW.order_number := v_number;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION bipstart_private.assign_shop_online_order_number()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER shop_online_orders_assign_number
  BEFORE INSERT ON public.shop_online_orders
  FOR EACH ROW
  EXECUTE FUNCTION bipstart_private.assign_shop_online_order_number();

CREATE FUNCTION public.bipstart_track_online_order_numbered(
  p_order_id uuid, p_client_token uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'shop_name', s.name,
    'status', o.status,
    'payment_status', o.payment_status,
    'delivery_method', o.delivery_method,
    'total', o.total,
    'created_at', o.created_at
  )
  FROM public.shop_online_orders AS o
  JOIN public.shops AS s ON s.id = o.shop_id
  WHERE o.id = p_order_id
    AND o.client_token = p_client_token
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.bipstart_track_online_order_numbered(uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bipstart_track_online_order_numbered(uuid, uuid)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
