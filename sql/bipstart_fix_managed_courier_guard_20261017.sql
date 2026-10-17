-- Permite conta gerenciada pelo lojista, validando proprietário, plano e e-mail sintético do telefone.
create or replace function public.bipstart_guard_courier_account()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_email text; v_digits text;
begin
 if new.account_id is not null and
   (tg_op='INSERT' or new.account_id is distinct from old.account_id) then
   if coalesce(new.login_managed,false) then
     if auth.uid() is null or not public.is_shop_owner(new.shop_id) or not public.has_delivery_access(new.shop_id) then
       raise exception 'Cadastro de motoboy não autorizado' using errcode='42501';
     end if;
     v_digits:=regexp_replace(coalesce(new.phone,''),'[^0-9]','','g');
     if left(v_digits,2)='55' and length(v_digits) in (12,13) then v_digits:=substring(v_digits from 3); end if;
     if length(v_digits) not in (10,11) then raise exception 'Telefone inválido' using errcode='22023'; end if;
     select u.email into v_email from auth.users u where u.id=new.account_id;
     if v_email is distinct from ('courier-55'||v_digits||'@login.bipstart.example') then
       raise exception 'Conta não corresponde ao telefone cadastrado' using errcode='42501';
     end if;
     if exists(select 1 from public.shop_couriers c where c.account_id=new.account_id and c.id is distinct from new.id and c.removed_at is null) then
       raise exception 'Esta conta já está vinculada a outro motoboy' using errcode='23505';
     end if;
   elsif tg_op='INSERT' or new.account_id is distinct from auth.uid() then
     raise exception 'Conta de motoboy só pode ser vinculada pelo próprio titular' using errcode='42501';
   end if;
 end if;
 return new;
end $$;
