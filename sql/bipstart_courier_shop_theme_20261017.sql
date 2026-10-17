-- Cor da loja no painel do motoboy: somente vínculos autenticados/ativos Premium.
-- Não altera funções, tabelas ou permissões existentes de entrega.
create or replace function public.bipstart_courier_shop_theme()
returns table(shop_id uuid,brand_color text)
language sql stable security definer set search_path to ''
as $function$
 select distinct c.shop_id,
   case when s.brand_color ~ '^#[0-9A-Fa-f]{6}$'
     then s.brand_color else '#7c3aed' end as brand_color
 from public.shop_couriers c
 join public.shops s on s.id=c.shop_id
 where c.account_id=auth.uid()
   and c.active=true
   and public.has_delivery_access(c.shop_id)
 order by c.shop_id;
$function$;
revoke all on function public.bipstart_courier_shop_theme() from public,anon,authenticated;
grant execute on function public.bipstart_courier_shop_theme() to authenticated;
