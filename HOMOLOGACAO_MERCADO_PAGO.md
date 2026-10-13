# Homologação BipStart no Northflank — somente Mercado Pago de planos

> Este branch é exclusivo de homologação. NÃO conectar o checkout às vendas dos lojistas.
> O ambiente atual da BipStart (serviço `bipstart`, branch `main`) permanece inalterado.

## 1. Criar um NOVO serviço no Northflank
No mesmo projeto, escolha **Create new > Service > Combined** (não modificar o serviço `bipstart`).
- Nome sugerido: `bipstart-homologacao`.
- GitHub: `diiegooh/bipstart-plataforma`.
- Branch: `feature/mercadopago-testes-20261013` (NÃO `main`).
- Build: **Dockerfile** na raiz. O Dockerfile inclui `billing.mjs`.
- Porta pública HTTPS: **3000**.
- CI/CD: somente no NOVO serviço.
- Considere que um segundo serviço pode aumentar o custo do Northflank.

## 2. Variáveis do NOVO serviço (não enviar segredos ao chat)
- `SUPABASE_URL`: URL do projeto Supabase BipStart.
- `SUPABASE_PUBLISHABLE_KEY`: chave PUBLICÁVEL do mesmo projeto.
- `SUPABASE_SECRET_KEY`: chave SECRETA do mesmo projeto, exclusivamente backend.
- `TURNSTILE_SITE_KEY`: Site Key do widget Cloudflare para este domínio.
- `MERCADO_PAGO_ACCESS_TOKEN`: token **TEST** da aplicação Mercado Pago BipStart (não da Salgatti).
- `MERCADO_PAGO_WEBHOOK_SECRET`: assinatura do **modo de teste** da mesma aplicação.
- `BIPSTART_BILLING_MODE=test`.
- `BIPSTART_STAGING_MODE=1`.
- `BIPSTART_BASE_URL=https://<dominio-exato-do-NOVO-servico>` (sem barra final).

**Não copiar o BIPSTART_BASE_URL da produção.** O endpoint de checkout exige que o domínio recebido seja igual ao configurado em `BIPSTART_BASE_URL`.

## 3. CAPTCHA e login na homologação
- Adicionar **hostname do novo serviço** à lista de domínios do widget Cloudflare Turnstile. Não criar outro widget sem necessidade.
- Para testes de confirmação/redefinição de senha por link, adicionar `https://<dominio-do-novo-servico>/cliente` à lista de **Auth > URL Configuration > Redirect URLs** do Supabase, sem alterar o Site URL da produção.
- O teste do botão de checkout usa uma conta da BipStart com e-mail confirmado e loja existente.
- **Atenção:** a homologação utiliza temporariamente o mesmo Supabase para autenticação. Não é isolamento integral de banco. A interface da homologação bloqueia alterações da loja; a homologação do Mercado Pago cria apenas pedidos de teste na tabela de billing. Não usar como ambiente para editar produtos.

## 4. Webhook Mercado Pago
- No aplicativo **BipStart**, em **Webhooks > Modo de teste**, apontar o endpoint:
  `https://<dominio-do-novo-servico>/api/billing/webhook`
- Eventos: **Pagamentos**.
- Não alterar o webhook do aplicativo Salgatti.
- Atenção ao procedimento oficial: pagamentos criados com credenciais de teste podem não gerar notificações automaticamente. Para validar a *recepção* da notificação, usar a função **Simular** no painel MP; um `Data ID` fictício, assinado corretamente, será reconhecido mas ignorado (não aprova plano).

## 5. Verificações
- Abrir `https://<novo-servico>/health`: deve responder JSON com `ok: true`.
- Abrir `https://<novo-servico>/api/public-config`: `enabled: true`, `stagingMode: true`.
- Abrir `https://<novo-servico>/cliente`, fazer login com conta confirmada e concluir Turnstile.
- Clicar **Testar contratação do plano Básico (Mercado Pago)**.
- O checkout deve redirecionar para `sandbox_init_point`, nunca `init_point`.
- Não pagar com dinheiro real nem utilizar credenciais de produção.
- No banco, pedidos aprovados neste modo ficam em `test_approved`; **`shop_entitlements` não é alterada**.
- Validar webhooks adulterados, duplicados, pendentes e com valor/moeda inválidos antes de cogitar produção.

## 6. Limites intencionais
- O plano Pro recorrente NÃO está implementado.
- Não fazer merge do PR #7 em `main` só porque os testes simulados passaram.
- Pagamentos reais exigem uma implementação e validação específicas para produção.
- Caso o checkout responda 503, conferir variáveis e se `BIPSTART_STAGING_MODE=1` e `BIPSTART_BILLING_MODE=test`.
- Caso responda 409, conferir se `BIPSTART_BASE_URL` corresponde ao domínio do serviço novo.


## 7. PIX REAL DE DIAGNÓSTICO (apenas homologação)

**Valor real: R$ 1,00.** Esta operação não contrata planos e não altera \`shop_entitlements\`. A emissão do Pix não efetua transferência: o titular precisa pagar voluntariamente no app do banco. O recebedor pode ter taxas sobre o pagamento.

A homologação recebe os seguintes segredos NOVOS, sem substituir \`MERCADO_PAGO_ACCESS_TOKEN\` (TEST):
- \`MERCADO_PAGO_PROD_ACCESS_TOKEN\` = Access Token de PRODUÇÃO da aplicação Mercado Pago **BipStart**, normalmente iniciado em \`APP_USR-\`. Nunca copiar o token da Salgatti.
- \`MERCADO_PAGO_PROD_WEBHOOK_SECRET\` = assinatura secreta do modo de PRODUÇÃO da mesma aplicação. Não reutilizar o segredo de teste.
- \`BIPSTART_REAL_PIX_TEST_EMAIL\` = e-mail confirmado do titular autorizado ao teste, exatamente como no Supabase Auth.
- \`BIPSTART_REAL_PIX_TEST_ENABLED=1\` = habilitação temporária explícita. O teste exige também \`BIPSTART_STAGING_MODE=1\` e \`BIPSTART_BILLING_MODE=test\`.

A URL \`BIPSTART_BASE_URL\` deve continuar apontando para a hospedagem **bipstart-homologacao**.

Acesse \`https://<host-da-homologacao>/api/public-config\`: \`realPixDiagnosticAvailable\` deverá ser \`true\` sem expor segredos.

Faça login em \`https://<host-da-homologacao>/cliente\` e abra \`https://<host-da-homologacao>/pix-teste\`.
- **Gerar PIX real de R$ 1,00** requer confirmação explícita e cria apenas uma transação de diagnóstico por loja.
- **Consultar pagamento** solicita o pagamento via ID na API do Mercado Pago, confirma valor/moeda/origem e mostra \`pending\` ou \`approved\`.
- Guarde o **paymentId**. Não envie token ou chave secreta.
- O webhook individual de pagamento é configurado via \`notification_url\` para \`/api/billing/pix-webhook\`, que verifica \`MERCADO_PAGO_PROD_WEBHOOK_SECRET\` e **nunca ativa planos**.
- A tabela \`shop_billing_orders\` usa índice único \`bipstart_one_pix_diagnostic_per_shop\`, já migrado e presente no arquivo \`sql/bipstart_one_pix_diagnostic_per_shop.sql\`.
- Se a cobrança falhar no MP por conta recebedora/pagador, não tentar reenviar indefinidamente. Usar o ID da transação retornada e investigar na documentação oficial.

**Desativação obrigatória após concluir:** alterar \`BIPSTART_REAL_PIX_TEST_ENABLED=0\`, salvar/reimplantar o serviço e, quando possível, revogar/remover a credencial de produção do ambiente de homologação. Nenhuma outra integração da BipStart depende dessas variáveis.

> O PR #7 continua **rascunho**, isolado em \`feature/mercadopago-testes-20261013\`. Nunca mesclar automaticamente para main.
