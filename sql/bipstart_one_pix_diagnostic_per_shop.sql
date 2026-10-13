-- Limita o diagnóstico de PIX real a uma transação por loja.
-- Não interfere nos pedidos dos planos Básico/Personalizado/Pro.
create unique index if not exists bipstart_one_pix_diagnostic_per_shop
  on public.shop_billing_orders(shop_id)
  where provider = 'mercado_pago_pix_diagnostic';
