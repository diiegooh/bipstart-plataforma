-- Executar SOMENTE depois de revisar no projeto Supabase correto da BipStart.
-- Ativação idempotente dos dois planos de pagamento único.
create or replace function public.bipstart_confirm_plan_payment(
 p_order_id uuid,p_payment_ref text,p_amount numeric,p_plan text
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare v_order public.shop_billing_orders%rowtype;
begin
 select * into v_order from public.shop_billing_orders
 where id=p_order_id for update;
 if not found then return false; end if;
 if v_order.plan_code<>p_plan or v_order.amount<>p_amount
    or p_plan not in ('basic','personalizado')
    or (p_plan='basic' and p_amount<>29.99)
    or (p_plan='personalizado' and p_amount<>49.99)
    or p_payment_ref !~ '^[0-9]+$'
 then return false; end if;
 if v_order.status='approved' then
   return v_order.provider_ref=p_payment_ref;
 end if;
 if v_order.status<>'pending' then return false; end if;
 update public.shop_billing_orders
 set status='approved',provider_ref=p_payment_ref
 where id=p_order_id and status='pending';
 update public.shop_entitlements
 set status='active',plan_code=p_plan,active_until=null,updated_at=now()
 where shop_id=v_order.shop_id;
 if not found then
   raise exception 'Entitlement não encontrado';
 end if;
 return true;
end;
$$;
revoke all on function public.bipstart_confirm_plan_payment(uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.bipstart_confirm_plan_payment(uuid,text,numeric,text) to service_role;
