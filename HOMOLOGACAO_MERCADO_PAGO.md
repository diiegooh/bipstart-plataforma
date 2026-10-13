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
