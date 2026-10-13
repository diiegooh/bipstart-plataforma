# Pagamentos BipStart — preparação isolada

Esta branch **não está em produção** e não modifica a Salgatti. O checkout da BipStart usará uma integração independente do Mercado Pago.

## Escopo
- Básico: R$ 29,99, pagamento único.
- Personalizado: R$ 49,99, pagamento único.
- Pro: R$ 99,90/mês — **ainda não implementado**. Exige assinatura recorrente, eventos de renovação, cancelamento, cobrança recusada e controle do vencimento.
- Lojistas recebem pedidos pelo WhatsApp; a BipStart **não conecta contas Mercado Pago dos lojistas**.

## Segurança
- Preços determinados exclusivamente pelo servidor.
- Usuário autenticado via Supabase Auth; loja validada com `owner_id`.
- Chave privada do Supabase e Access Token MP apenas no backend.
- Webhook com assinatura HMAC obrigatória, janela de 10 minutos, consulta de pagamento na API MP e validação de referência, plano, valor e moeda.
- Ativação de plano único por função transacional e idempotente; requer execução prévia do SQL e concessão de EXECUTE apenas para service_role.
- Nunca confiar no retorno do navegador como confirmação do pagamento.
- Contas Salgatti e BipStart não compartilham dados de pedidos ou bancos de lojas.

## Antes de implantar
1. Revisar e aplicar `sql/bipstart_confirm_plan_payment.sql` **somente** no projeto Supabase que contém as tabelas `shops`, `shop_entitlements` e `shop_billing_orders`.
2. Verificar políticas RLS da tabela `shop_billing_orders` (cliente só vê seus próprios pedidos; apenas backend pode modificar status).
3. Configurar no ambiente **da BipStart**: `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e `BIPSTART_BASE_URL` (HTTPS real).
4. Registrar o endpoint `https://SEU_HOST/api/billing/webhook` no aplicativo Mercado Pago **da BipStart**.
5. Validar ambiente de teste: pagamento aprovado, pendente, recusado, duplicado, webhook adulterado e tentativa de contratar loja alheia.
6. Revisar o ciclo de vida dos planos únicos (sem vencimento automático) e do Plano Pro (recorrência ainda pendente).
7. Só então considerar mesclar para `main` e habilitar cobrança real.

## Aviso
O checkout implementado nesta branch é um preparo técnico ainda **não testado ponta a ponta**. Não inserir token de produção antes de validar webhook, RLS, migração e reconciliação. Não executar SQL diretamente na base de produção sem conferir a estrutura e ter backup.

## Testes seguros em 2026-10-13
- Novo estado `test_approved` na tabela de pedidos da BipStart (migração aplicada).
- No modo `BIPSTART_BILLING_MODE=test`, webhook de pagamento sandbox aprovado marca SOMENTE `shop_billing_orders.status='test_approved'` (e `provider_ref`). **Não modifica `shop_entitlements` e NÃO ativa uma assinatura real.**
- Mantém bloqueio para `payment.live_mode=true` no sandbox.
- `npm test` executa testes de rotas e casos simulados de checkout, autorização, webhook e duplicação.
- A migração `sql/bipstart_allow_test_approval.sql` já foi aplicada ao projeto Supabase BipStart.
- Mesclagem continua condicionada a homologação; pagamentos reais exigem implementação de ambiente de produção separado e testes próprios.
