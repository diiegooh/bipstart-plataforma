# Motoboys BipStart — Plano Pro (R$ 99,90/mês)

## Funcionalidades
A área da BipStart adapta o sistema original de entregadores da Salgatti para múltiplas lojas, de maneira isolada.

- **Acesso exclusivo ao Pro vigente** (incluindo a avaliação gratuita do Pro, enquanto válida), validado no navegador e no Supabase.
- O lojista cadastra motoboys em **/cliente → Motoboys** e gera convite individual.
- O motoboy acessa **/motoboy**, cria conta com e-mail, senha e confirmação, e usa convite de uso único.
- Lojista cadastra entregas manualmente a partir dos pedidos recebidos via WhatsApp, com cliente, endereço, itens e valor.
- Entregas pendentes aparecem para motoboys disponíveis da mesma loja; opcionalmente são direcionadas a um motoboy específico.
- A primeira aceitação válida assume a entrega; motoboy ocupado precisa concluir antes de aceitar outra.
- Etapas: **Aceita → Saiu para entrega → Entregue**.
- Links para Google Maps e Waze, atualização automática a cada 20 segundos.
- A senha e a sessão usam Supabase Auth, não as credenciais da Salgatti original.
- Suspensão, vencimento ou mudança do plano Pro bloqueiam o acesso às entregas.

## Limitações iniciais
O cliente ainda finaliza o pedido pelo WhatsApp da loja. O lojista o registra manualmente na fila de entregas. Não há criação automática do pedido pelo WhatsApp, cálculo de distância, otimização de múltiplas paradas ou notificações push nesta versão.

## Uso na homologação
1. O lojista Pro cadastra entregador, copia o convite e envia ao motoboy.
2. O entregador acessa a página de convite, cria e confirma seu e-mail, entra e aceita o convite.
3. O lojista registra o pedido em **Entregas**.
4. O entregador recebe a oferta, aceita, abre rota e informa o status.

## Banco de dados e publicação
Migração: sql/bipstart_courier_pro_20261014.sql. **Aplicada** ao projeto gjeyespoeqmjmskrkizx em 14/10/2026, com testes SQL em transação revertida (ROLLBACK). Testadas restrições de status, aceite e bloqueio após suspensão. Nenhuma loja fictícia foi mantida.

Código: branch feature/whatsapp-planos-manual-20261013. **Não foi publicado no Northflank nem mesclado em main**. Deve ser validado primeiro na homologação.

Caso os links de confirmação de e-mail não retornem à página correta, incluir a URL da homologação terminada em /motoboy na lista de redirecionamentos permitidos do Supabase Auth. Cloudflare Turnstile deve aceitar o domínio da homologação.

O repositório Salgatti-site e suas senhas não foram modificados. As tabelas antigas da Salgatti continuam separadas e não são necessárias para o novo sistema.
