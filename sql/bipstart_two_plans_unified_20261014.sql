-- BipStart: dois planos e uma única loja com PDV + Cardápio.
-- Códigos internos: basic (Básico) e pro (Premium).
-- A função de agenda deixa de ser um modelo contratável.
-- Executar apenas no projeto Supabase BipStart, não nas tabelas legadas Salgatti.

alter table public.shops drop constraint if exists shops_model_check;
alter table public.shops add constraint shops_model_check check(model='pdv');
alter table public.shops drop constraint if exists shops_requested_plan_check;
alter table public.shops add constraint shops_requested_plan_check check(requested_plan in ('basic','pro'));
alter table public.shop_entitlements drop constraint if exists shop_entitlements_plan_code_check;
alter table public.shop_entitlements add constraint shop_entitlements_plan_code_check check(plan_code in ('basic','pro'));
alter table public.bipstart_access_audit drop constraint if exists bipstart_access_audit_plan_code_check;
alter table public.bipstart_access_audit add constraint bipstart_access_audit_plan_code_check check(plan_code in ('basic','pro'));

alter policy menu_categories_owner_insert on public.shop_menu_categories
 with check(public.can_write_shop(shop_id) and exists(
   select 1 from public.shops s where s.id=shop_id and s.model='pdv'
 ));

create or replace function public.bipstart_can_customize(p_shop uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select public.is_shop_owner(p_shop) and public.has_delivery_access(p_shop)
$$;
revoke all on function public.bipstart_can_customize(uuid) from public,anon;
grant execute on function public.bipstart_can_customize(uuid) to authenticated;

-- Protege a personalização tanto no frontend quanto no banco de dados.
create or replace function public.bipstart_guard_shop_logo()
returns trigger language plpgsql security definer set search_path=''
as $guard$
begin
 if TG_OP='INSERT' then
   if new.logo_path is not null then
     raise exception 'A logo própria requer ativação do plano Premium' using errcode='42501';
   end if;
   if new.brand_color is distinct from '#7c3aed' then
     raise exception 'A cor personalizada requer ativação do plano Premium' using errcode='42501';
   end if;
   return new;
 end if;
 if new.brand_color is distinct from old.brand_color then
   if not public.bipstart_can_customize(new.id) then
     raise exception 'Mudar a cor do site é exclusivo do Premium vigente' using errcode='42501';
   end if;
   if new.brand_color !~ '^#[0-9a-fA-F]{6}$' then
     raise exception 'Cor hexadecimal inválida' using errcode='22023';
   end if;
 end if;
 if new.logo_path is distinct from old.logo_path and new.logo_path is not null then
   if not public.bipstart_can_customize(new.id) then
     raise exception 'Logo própria exclusiva do Premium vigente' using errcode='42501';
   end if;
   if new.logo_path not like (new.id::text||'/%')
      or new.logo_path !~* '\.(png|jpg|jpeg|webp)$' then
     raise exception 'Caminho da logo inválido' using errcode='22023';
   end if;
 end if;
 return new;
end $guard$;
-- Trigger bipstart_guard_shop_logo já está instalado para INSERT e UPDATE.

-- Resposta do cardápio público: agora todas as lojas usam o modelo PDV
-- e compartilham o mesmo cadastro de produtos (sem leitura de dados internos).
create or replace function public.bipstart_public_menu(p_slug text)
returns jsonb
language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
   'name',s.name,
   'slug',s.slug,
   'whatsapp',s.whatsapp,
   'brand_color',case when e.plan_code='pro' then s.brand_color else '#7c3aed' end,
   'opening_hours',s.opening_hours,
   'location',s.location_text,
   'payment_methods',to_jsonb(s.payment_methods),
   'delivery_fee',s.delivery_fee,
   'logo_path',case when e.plan_code='pro' then s.logo_path else null end,
   'categories',coalesce((
     select jsonb_agg(jsonb_build_object('name',c.name) order by c.sort_order,c.name)
     from public.shop_menu_categories c where c.shop_id=s.id
   ),'[]'::jsonb),
   'items',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',p.id,'name',p.name,'category',p.category,'description',p.description,
       'price',p.price,'image_path',p.image_path
     ) order by p.category,p.name)
     from public.shop_products p where p.shop_id=s.id and p.active=true
   ),'[]'::jsonb)
 )
 from public.shops s
 join public.shop_entitlements e on e.shop_id=s.id
 where s.slug=p_slug and s.model='pdv'
   and ((e.status='trialing' and e.trial_until>now())
     or (e.status='active' and (e.active_until is null or e.active_until>now())))
 limit 1
$$;
revoke all on function public.bipstart_public_menu(text) from public;
grant execute on function public.bipstart_public_menu(text) to anon,authenticated;

-- Admin mantém ativação manual por WhatsApp. Premium dura 30 dias por ativação.
create or replace function public.bipstart_admin_set_access(
 p_shop_id uuid,p_plan text,p_action text
)
returns boolean language plpgsql volatile security definer set search_path=''
as $$
declare found_rows integer;
begin
 if auth.uid() is null or not exists(
   select 1 from public.bipstart_admins a where a.user_id=auth.uid()
 ) then
  raise exception 'Acesso administrativo não autorizado' using errcode='42501';
 end if;
 if p_plan not in ('basic','pro') or p_action not in ('activate','suspend') then
  raise exception 'Plano ou ação inválida' using errcode='22023';
 end if;
 update public.shop_entitlements e
  set status=case when p_action='activate' then 'active' else 'suspended' end,
      plan_code=p_plan,
      active_until=case when p_action='activate' and p_plan='pro' then now()+interval '30 days'
                        when p_action='activate' then null else now() end,
      updated_at=now()
  where e.shop_id=p_shop_id;
 get diagnostics found_rows = row_count;
 if found_rows<>1 then raise exception 'Loja não encontrada' using errcode='P0002';end if;
 insert into public.bipstart_access_audit(shop_id,admin_id,action,plan_code)
 values(p_shop_id,auth.uid(),p_action,p_plan);
 return true;
end $$;
revoke all on function public.bipstart_admin_set_access(uuid,text,text) from public,anon;
grant execute on function public.bipstart_admin_set_access(uuid,text,text) to authenticated;
