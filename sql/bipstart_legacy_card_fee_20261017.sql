-- Permite ao lojista informar a taxa real de uma venda antiga em cartão,
-- sem alterar total bruto, itens, estoque ou taxas já registradas.
create or replace function public.bipstart_set_missing_card_fee(
 p_shop_id uuid, p_sale_id uuid, p_percent numeric
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 v_amount numeric(12,2);
 v_percent numeric(5,2);
begin
 if not public.can_write_shop(p_shop_id) then
  raise exception 'Loja sem permissão para atualizar esta venda.' using errcode='42501';
 end if;
 if p_percent is null or p_percent<0 or p_percent>100 or p_percent<>round(p_percent,2) then
  raise exception 'Informe um percentual de 0 a 100 com até duas casas decimais.' using errcode='22023';
 end if;
 v_percent:=p_percent;
 update public.shop_sales s
 set card_fee_percent=v_percent,
     card_fee_amount=round(s.total*v_percent/100,2)
 where s.id=p_sale_id and s.shop_id=p_shop_id
   and s.payment_method in ('credito','debito') and s.card_fee_amount is null
 returning s.card_fee_amount into v_amount;
 if not found then
  raise exception 'Venda não encontrada ou taxa já registrada.' using errcode='P0002';
 end if;
 return jsonb_build_object('card_fee_percent',v_percent,'card_fee_amount',v_amount);
end $$;

revoke all on function public.bipstart_set_missing_card_fee(uuid,uuid,numeric)
 from public,anon,authenticated;
grant execute on function public.bipstart_set_missing_card_fee(uuid,uuid,numeric)
 to authenticated;
notify pgrst, 'reload schema';
