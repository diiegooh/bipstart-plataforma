-- Permite ao proprietário respeitar pedidos de interrupção dos avisos.
-- A política RLS shop_online_orders_owner_update continua exigindo a titularidade da loja.
grant update(whatsapp_updates_opt_in) on table public.shop_online_orders to authenticated;
