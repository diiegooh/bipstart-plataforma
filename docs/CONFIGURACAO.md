# BipStart — próximo passo de implantação segura

## Situação
- O site de divulgação da BipStart continua em produção na branch `main`.
- A área do cliente (`/cliente`), cardápio (`/cardapio?loja=...`), teste de 7 dias e migração multiempresa estão nesta branch de desenvolvimento.
- NÃO foi criado projeto Supabase novo, NÃO foi aplicada migração e NÃO foi integrado o pagamento real.
- A funcionalidade de motoboys só libera edição com permissão paga `pro` no banco.
- A solicitação de personalização é registrada no banco, para acompanhamento pela equipe.

## Supabase
1. Confirme com o titular em qual organização Supabase criar o novo projeto. Consulte o custo e peça aprovação ANTES de criar.
2. Crie projeto exclusivo chamado `bipstart-plataforma` (São Paulo, se disponível), sem reutilizar as bases Salgatti ou Godzilla.
3. Revise e execute `migrations/001_bipstart_tenants.sql` no projeto BipStart.
4. Valide o cadastro, confirmação de e-mail, RLS de diferentes clientes, isolamento das fotos e cada modelo.
5. Configure `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` como variáveis no serviço bipstart do Northflank. A chave pública é apropriada para Auth e chamadas autenticadas com RLS.
6. Para evitar publicar mudança não validada, execute `npm test` e verifique cadastro, vendas, cardápio e entregas em um ambiente de teste.
7. Somente então faça merge da branch no `main`, permitindo o deploy automático.

## Segurança e pagamentos
- Não peça chaves do Supabase service_role ou tokens do Mercado Pago pelo chat.
- A área cliente usa Supabase Auth, políticas RLS por loja e venda RPC com baixa atômica do estoque.
- O valor do plano não é decidido pelo navegador: quando o checkout for implementado, preços devem vir do servidor.
- Para Básico e Personalizado: usar Mercado Pago Checkout Pro e webhook com confirmação via API do Mercado Pago.
- Para Pro: utilizar Assinaturas recorrentes do Mercado Pago e liberar o acesso somente após pagamento confirmado.
- Os webhooks devem ser idempotentes, autenticados quando aplicável e reconsultar os pagamentos no Mercado Pago.
- Ainda NÃO está conectado o Mercado Pago. Não cobre clientes antes dessa etapa.
- Os pedidos do cardápio público são enviados por WhatsApp e não geram cobranças automáticas.

## Domínio
A configuração de `bipstart.shop` ainda depende da confirmação DNS da GoDaddy no Northflank. Não modifique outros serviços/domínios.

## Testes
`npm test` verifica o início do servidor, arquivos públicos, página do cliente, cardápio, rota de saúde, modo seguro quando Supabase não estiver configurado e sintaxe dos scripts.

## Tabelas incluídas na migração
`shops`, `shop_entitlements`, `shop_products`, `shop_services`, `shop_appointments`, `shop_sales`, `shop_sale_items`, `shop_stock_movements`, `shop_menu_orders`, `shop_couriers`, `shop_deliveries`, `shop_customization_requests` e `shop_billing_orders`.
