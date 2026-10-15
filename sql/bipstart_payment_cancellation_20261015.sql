-- BipStart: cancelamento de pagamento em pedidos do cardápio online.
-- Mantém "pending" e "paid" existentes; "cancelled" é somente um status administrativo.
-- Não efetua estorno, não movimenta dinheiro e não altera estoque.
alter table public.shop_online_orders
  drop constraint if exists shop_online_orders_payment_status_check;

alter table public.shop_online_orders
  add constraint shop_online_orders_payment_status_check
  check (payment_status in ('pending','paid','cancelled'));

comment on column public.shop_online_orders.payment_status is
  'Status administrativo: pending, paid ou cancelled; cancelamento não realiza estorno.';

notify pgrst, 'reload schema';
