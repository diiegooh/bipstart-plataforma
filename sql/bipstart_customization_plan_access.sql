-- Somente lojas com acesso vigente aos planos Personalizado ou Pro
-- podem consultar e registrar solicitações de personalização.
-- Não remove nem altera solicitações históricas.
create or replace function public.bipstart_can_customize(p_shop uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
 select public.is_shop_owner(p_shop) and exists(
   select 1
   from public.shop_entitlements e
   where e.shop_id=p_shop
     and e.plan_code in ('personalizado','pro')
     and (
       (e.status='trialing' and e.trial_until>now())
       or (e.status='active' and (e.active_until is null or e.active_until>now()))
     )
 );
$$;

revoke all on function public.bipstart_can_customize(uuid) from public,anon;
grant execute on function public.bipstart_can_customize(uuid) to authenticated;

alter policy custom_owner_insert on public.shop_customization_requests
 with check (
   public.can_write_shop(shop_id)
   and public.bipstart_can_customize(shop_id)
 );

alter policy custom_owner_read on public.shop_customization_requests
 using (
   public.is_shop_owner(shop_id)
   and public.is_shop_enabled(shop_id)
   and public.bipstart_can_customize(shop_id)
 );
