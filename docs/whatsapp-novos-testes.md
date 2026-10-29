# Aviso WhatsApp de novos testes — BipStart

Implementação preparada na homologação. **Não envia mensagens até a configuração abaixo estar completa.**

## 1. Meta WhatsApp Cloud API
Use um número de envio da empresa conectado à API oficial do WhatsApp.
Crie e obtenha aprovação do template **utility** `bipstart_novo_teste`, idioma `pt_BR`:

> BipStart: uma nova loja iniciou o teste gratuito: {{1}}. Acesse o painel administrativo para conferir o cadastro.

O parâmetro {{1}} é o nome da loja. O aviso não inclui telefone, senha, tokens ou dados privados.

Configure no serviço de homologação, em **Northflank → Environment**:
- `WHATSAPP_CLOUD_ACCESS_TOKEN`: token de acesso da Meta (segredo)
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID`: ID do número de envio
- `WHATSAPP_GRAPH_API_VERSION`: versão compatível, p.ex. `v23.0`
- `WHATSAPP_TEMPLATE_NEW_TRIAL`: `bipstart_novo_teste`
- `TRIAL_ALERT_WHATSAPP`: seu número de **recebimento**, formato 55DDDNÚMERO
- `TRIAL_WEBHOOK_SECRET`: sequência aleatória forte de ao menos 32 caracteres, exclusiva desse webhook.

## 2. Supabase → Database Webhooks
Configure um webhook na tabela `public.shops` para o evento **INSERT**:
- URL: `https://DOMINIO-DA-HOMOLOGACAO/api/webhooks/new-trial`
- HTTP method: POST
- header `x-bipstart-webhook-secret`: mesmo valor configurado em `TRIAL_WEBHOOK_SECRET`.

A função aceita apenas novos registros com `signup_choice = trial`. Outros tipos de cadastro são ignorados. Não exponha o segredo no frontend ou em mensagens.

## 3. Teste e verificação
Com o servidor já implantado, crie uma loja de teste no ambiente de homologação. Confirme que o painel registra a loja e que a API Meta responde com mensagem aceita. A confirmação final de entrega deve ser acompanhada pelos status/webhooks da Meta.

**Atenção:** este MVP não faz controle persistente de duplicidade; uma repetição do webhook pode reenviar a mensagem. Para produção, acrescente idempotência durável e fila/retry controlados antes de habilitar alertas. Evite criar múltiplos webhooks sobre a mesma tabela.

Não altere senhas de usuários, não desative RLS e não copie as variáveis de produção para a homologação sem revisar o escopo.
