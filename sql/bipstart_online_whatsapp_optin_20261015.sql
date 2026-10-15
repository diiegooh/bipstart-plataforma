-- Registro de consentimento para mensagens transacionais pelo WhatsApp.
-- Clientes de pedidos antigos permanecem sem opt-in (false).
alter table public.shop_online_orders
  add column if not exists whatsapp_updates_opt_in boolean not null default false;

-- O token secreto do carrinho, gerado no checkout, comprova posse do pedido.
-- A função não concede SELECT/UPDATE de dados pessoais a usuários anônimos.
create or replace function public.bipstart_set_online_order_whatsapp_optin(
 p_order_id uuid, p_client_token uuid, p_opt_in boolean
) returns boolean
language plpgsql volatile security definer set search_path=''
as $$
declare v_id uuid;
begin
 if p_order_id is null or p_client_token is null or p_opt_in is null then return false; end if;
 update public.shop_online_orders
 set whatsapp_updates_opt_in=p_opt_in
 where id=p_order_id and client_token=p_client_token
   and created_at>now()-interval '24 hours'
 returning id into v_id;
 return v_id is not null;
end;
$$;

revoke all on function public.bipstart_set_online_order_whatsapp_optin(uuid,uuid,boolean) from public;
grant execute on function public.bipstart_set_online_order_whatsapp_optin(uuid,uuid,boolean) to anon,authenticated;
notify pgrst,'reload schema';
