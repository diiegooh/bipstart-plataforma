-- Após configurar a contratação manual, bloquear leitura dos dados operacionais
-- pelo token do lojista quando trial/subscrição expirar. Não apaga registros.
alter policy products_owner_read on public.shop_products
 using (public.is_shop_owner(shop_id) and public.is_shop_enabled(shop_id));
alter policy services_owner_read on public.shop_services
 using (public.is_shop_owner(shop_id) and public.is_shop_enabled(shop_id));
alter policy appointments_owner_read on public.shop_appointments
 using (public.is_shop_owner(shop_id) and public.is_shop_enabled(shop_id));
alter policy sales_owner_read on public.shop_sales
 using (public.is_shop_owner(shop_id) and public.is_shop_enabled(shop_id));
alter policy sale_items_owner_read on public.shop_sale_items
 using (public.is_shop_owner(shop_id) and public.is_shop_enabled(shop_id));
alter policy movements_owner_read on public.shop_stock_movements
 using (public.is_shop_owner(shop_id) and public.is_shop_enabled(shop_id));
alter policy menu_orders_owner_read on public.shop_menu_orders
 using (public.is_shop_owner(shop_id) and public.is_shop_enabled(shop_id));
alter policy custom_owner_read on public.shop_customization_requests
 using (public.is_shop_owner(shop_id) and public.is_shop_enabled(shop_id));
alter policy couriers_owner_read on public.shop_couriers
 using (public.is_shop_owner(shop_id) and public.is_shop_enabled(shop_id));
alter policy deliveries_owner_read on public.shop_deliveries
 using (public.is_shop_owner(shop_id) and public.is_shop_enabled(shop_id));
