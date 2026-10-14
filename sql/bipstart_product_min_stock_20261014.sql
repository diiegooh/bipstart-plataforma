-- BipStart / public.shop_products: quantidade mínima de estoque por produto.
-- Adiciona informação sem modificar estoque, preço ou qualquer produto cadastrado.
-- Projeto autorizado: gjeyespoeqmjmskrkizx. Sem alteração nas tabelas de outros sistemas.

alter table public.shop_products
  add column if not exists min_stock integer not null default 5;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shop_products'::regclass
      and conname = 'shop_products_min_stock_valid'
  ) then
    alter table public.shop_products
      add constraint shop_products_min_stock_valid
      check (min_stock between 0 and 999999999);
  end if;
end
$$;

comment on column public.shop_products.min_stock is
  'Alerta de estoque por produto: saldo positivo menor ou igual a min_stock é considerado baixo.';

notify pgrst, 'reload schema';
