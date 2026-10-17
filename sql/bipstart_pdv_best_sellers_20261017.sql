-- Destaques escolhidos pelo lojista para acesso rápido no PDV.
-- Não altera estoque, histórico de vendas ou regras de segurança existentes.
alter table public.shop_products
  add column if not exists is_best_seller boolean not null default false;
comment on column public.shop_products.is_best_seller
  is 'Marcado manualmente pelo lojista como mais vendido para acesso rápido no PDV';
