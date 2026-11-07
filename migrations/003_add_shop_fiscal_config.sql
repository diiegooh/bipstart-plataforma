-- Dados preparatórios de emissão fiscal por loja.
-- Segredos (certificado, senha, token CSC) não são armazenados nesta coluna.
alter table public.shops
  add column if not exists fiscal_config jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shops'::regclass
      and conname = 'shops_fiscal_config_object_check'
  ) then
    alter table public.shops
      add constraint shops_fiscal_config_object_check
      check (jsonb_typeof(fiscal_config) = 'object');
  end if;
end
$$;

notify pgrst, 'reload schema';
