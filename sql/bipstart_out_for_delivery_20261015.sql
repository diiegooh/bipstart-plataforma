-- Etapa de entrega do cardápio online: entre "Em preparo" e "Finalizado".
-- A nova situação só pode ser usada em pedidos de entrega; retirada continua sem essa etapa.
-- Preserva pedidos, pagamentos, regras RLS e histórico.
alter table public.shop_online_orders
  drop constraint if exists shop_online_orders_status_check;

alter table public.shop_online_orders
  add constraint shop_online_orders_status_check
  check (status in (
    'awaiting_confirmation','confirmed','preparing','out_for_delivery','fulfilled','cancelled'
  ));

alter table public.shop_online_orders
  add constraint shop_online_orders_delivery_status_check
  check (status <> 'out_for_delivery' or delivery_method='delivery');

notify pgrst, 'reload schema';
