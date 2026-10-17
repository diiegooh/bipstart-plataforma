-- Permite digitar um tipo de estabelecimento personalizado na BipStart.
-- Mantém os valores existentes e não altera produtos, pedidos ou entregas.
alter table public.shops
  drop constraint if exists bipstart_establishment_type_valid;
alter table public.shops
  add constraint bipstart_establishment_type_valid
  check (char_length(btrim(establishment_type)) between 1 and 65);
