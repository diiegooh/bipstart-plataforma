-- Automatically queue online delivery orders after store confirmation.
create or replace function public.bipstart_sync_online_order_delivery()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_items text;
begin
 if tg_op='UPDATE' and new.status='cancelled' and old.status is distinct from new.status then
   update public.shop_deliveries set status='cancelada',updated_at=now()
   where online_order_id=new.id and status='pendente' and courier_id is null;
   return new;
 end if;
 if new.delivery_method <> 'delivery'
    or nullif(btrim(coalesce(new.delivery_address,'')),'') is null
    or new.status not in ('confirmed','preparing','out_for_delivery')
    or not public.has_delivery_access(new.shop_id) then return new; end if;
 if exists(select 1 from public.shop_deliveries d where d.online_order_id=new.id) then return new; end if;
 select string_agg(greatest(1,coalesce((item->>'qty')::integer,1))::text||'x '||left(coalesce(item->>'name','Item'),200),', ' order by ord)
 into v_items from jsonb_array_elements(new.items) with ordinality as x(item,ord);
 insert into public.shop_deliveries(shop_id,online_order_id,customer_name,customer_phone,address,items_text,total,status)
 values(new.shop_id,new.id,new.customer_name,new.customer_phone,btrim(new.delivery_address),left(coalesce(v_items,''),3000),new.total,'pendente');
 return new;
end $$;
drop trigger if exists bipstart_sync_online_order_delivery on public.shop_online_orders;
create trigger bipstart_sync_online_order_delivery after insert or update of status on public.shop_online_orders for each row execute function public.bipstart_sync_online_order_delivery();
