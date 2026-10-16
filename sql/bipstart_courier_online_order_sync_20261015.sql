-- BipStart Premium: vincula uma entrega à compra real do cardápio online.
-- A confirmação de entrega do motoboy finaliza o pedido automaticamente,
-- na mesma transação; pagamento nunca é alterado por este vínculo.
alter table public.shop_deliveries
  add column if not exists online_order_id uuid;

-- A FK composta impede relacionar a entrega a um pedido de outra loja.
create unique index if not exists bipstart_online_order_shop_id_pair
  on public.shop_online_orders(shop_id,id);
alter table public.shop_deliveries
  add constraint bipstart_delivery_online_order_shop_scope
  foreign key(shop_id,online_order_id)
  references public.shop_online_orders(shop_id,id)
  on delete cascade;

-- Um pedido só pode ter uma entrega vinculada.
create unique index if not exists bipstart_delivery_online_order_unique
  on public.shop_deliveries(online_order_id)
  where online_order_id is not null;

create or replace function public.bipstart_validate_delivery_online_link()
returns trigger language plpgsql set search_path=''
as $$
declare v_method text; v_status text;
begin
  if new.online_order_id is null then return new; end if;
  select o.delivery_method,o.status into v_method,v_status
  from public.shop_online_orders o
  where o.id=new.online_order_id and o.shop_id=new.shop_id;
  if not found or v_method <> 'delivery' or v_status in ('cancelled','fulfilled') then
    raise exception 'Selecione um pedido de entrega ativo da mesma loja'
      using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists bipstart_validate_delivery_online_link on public.shop_deliveries;
create trigger bipstart_validate_delivery_online_link
  before insert or update of online_order_id,shop_id on public.shop_deliveries
  for each row execute function public.bipstart_validate_delivery_online_link();

-- Executado inclusive quando a entrega é atualizada pelo RPC autenticado do motoboy.
-- A alteração do pedido faz parte da MESMA transação do status da entrega.
create or replace function public.bipstart_sync_online_order_from_delivery()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.online_order_id is null or new.status=old.status then return new; end if;

  if new.status='a_caminho' then
    update public.shop_online_orders o
       set status='out_for_delivery'
     where o.id=new.online_order_id and o.shop_id=new.shop_id
       and o.delivery_method='delivery'
       and o.status in ('awaiting_confirmation','confirmed','preparing');
  elsif new.status='entregue' then
    update public.shop_online_orders o
       set status='fulfilled'
     where o.id=new.online_order_id and o.shop_id=new.shop_id
       and o.delivery_method='delivery'
       and o.status not in ('cancelled','fulfilled');
  end if;
  return new;
end;
$$;
drop trigger if exists bipstart_sync_online_order_from_delivery on public.shop_deliveries;
create trigger bipstart_sync_online_order_from_delivery
  after update of status on public.shop_deliveries
  for each row execute function public.bipstart_sync_online_order_from_delivery();

-- Funções de trigger não devem ter permissão de execução direta por clientes.
revoke all on function public.bipstart_validate_delivery_online_link() from public,anon,authenticated;
revoke all on function public.bipstart_sync_online_order_from_delivery() from public,anon,authenticated;
notify pgrst,'reload schema';
