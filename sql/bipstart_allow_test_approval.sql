-- Apenas para ensaios com o Checkout Pro no modo teste.
-- Mantém aprovado ('approved') separado de aprovação simulada ('test_approved').
-- shop_entitlements NÃO pode ser alterada por pagamentos simulados.
alter table public.shop_billing_orders
  drop constraint if exists shop_billing_orders_status_check;
alter table public.shop_billing_orders
  add constraint shop_billing_orders_status_check
  check (status in ('pending','approved','refunded','cancelled','test_approved'));
