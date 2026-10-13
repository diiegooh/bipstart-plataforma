# BipStart — contratação manual por WhatsApp

WhatsApp do atendimento de planos: (11) 97835-3820 | https://wa.me/5511978353820

## Fluxo de contratação

- Cadastro + e-mail confirmado + escolha de plano Básico (R$29,99 único), Personalizado (R$49,99 único) ou Pro (R$99,90/mês).
- Testar por 7 dias cria entitlement trialing até agora + 7 dias. Após expirar, acesso e operações ficam bloqueados.
- Contratar pelo WhatsApp cria entitlement pending, sem teste. Cliente solicita e combina pagamento pelo WhatsApp; administrador libera manualmente.
- Em /admin, usuário previamente autorizado no Supabase pode ativar e suspender, com auditoria. Pro tem 30 dias de prazo por ativação; Básico/Personalizado não vencem automaticamente.
- A loja e seus dados permanecem salvos após bloqueio. Não são feitas cobranças automáticas.

## MIGRAÇÃO — ainda não aplicada

Rever, testar e aplicar na sequência:
1. sql/bipstart_manual_whatsapp_access.sql
2. sql/bipstart_block_read_after_expiry.sql

O Supabase do projeto gjeyespoeqmjmskrkizx é compartilhado com outra aplicação. Preferir primeiro um ambiente isolado. Não executar a migração antes de homologar e autorizar o rollout.

Para autorizar a área /admin, localizar no Supabase Auth → Users o UUID da conta do titular e inserir esse UUID na tabela public.bipstart_admins usando o SQL Editor. Jamais permitir que o navegador cadastre administradores nem expor a chave de serviço.

## Verificações antes de publicar

- Escolher trial ou contratação; WhatsApp deve abrir para 5511978353820 com nome e identificador da loja.
- Contratação direta deve continuar pending até liberação manual.
- 7 dias devem ser reais (timestamp do servidor), e expiração bloqueia o painel, leitura RLS e gravações.
- Loja e dados devem ficar preservados; administrador pode ativar com plano certo e suspender com confirmação.
- Pro deve vencer 30 dias depois da liberação. Básico e Personalizado ficam sem vencimento automático.
- Cardápio público da loja vencida deve ficar indisponível.
- Nunca mesclar PR rascunho #8 diretamente antes dos testes em homologação. Main publica na produção automaticamente.

## Encerrar diagnóstico de pagamento antigo

- Desligar BIPSTART_REAL_PIX_TEST_ENABLED (valor 0) na homologação antiga.
- Remover com cuidado as credenciais de produção usadas no diagnóstico.
- Aposentar o Cloudflare Worker de webhook e remover a URL de webhook do Mercado Pago quando não forem mais necessários.
- Os antigos PRs #6 e #7 de Mercado Pago foram fechados sem mesclar.
