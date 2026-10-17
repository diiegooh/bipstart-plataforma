-- Arquivamento de motoboys sem excluir histórico de entregas.
alter table public.shop_couriers
 add column if not exists removed_at timestamptz;
create index if not exists shop_couriers_active_list_idx
 on public.shop_couriers(shop_id) where removed_at is null;
notify pgrst,'reload schema';
