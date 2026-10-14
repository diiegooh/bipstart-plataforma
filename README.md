# BipStart — PDV, cardápio online e delivery

A BipStart é uma plataforma para pequenos negócios, com painel de loja e cardápio digital público, organizada em **dois planos**:

| Plano | Preço de referência | Recursos |
| --- | --- | --- |
| **Básico** | **R$ 29,99, pagamento único** | PDV com estoque, vendas e cardápio online com categorias, fotos, preços e carrinho via WhatsApp |
| **Premium** | **R$ 99,90/mês** | Tudo do Básico, delivery com motoboys próprios, logo e cores próprias, solicitações de mudanças sob avaliação de escopo e suporte mensal |

**O catálogo comercial tem apenas Básico e Premium.** Cada cliente cria uma única loja com os módulos de PDV e cardápio integrados, compartilhando o mesmo cadastro de produtos.

## Cadastro, autenticação e planos

A área `/cliente` usa Supabase Auth com confirmação de e-mail e avaliação gratuita de sete dias. Após o vencimento, o acesso é bloqueado e os dados são preservados. A contratação dos planos ocorre **manualmente pelo WhatsApp da BipStart**; o administrador ativa o acesso em `/admin` depois da confirmação do pagamento. Premium vale por 30 dias por ativação. A BipStart não cobra pedidos/vendas dos lojistas.

A demonstração da página inicial usa dados locais do navegador e **não representa um pedido real**. Uma loja real e o cardápio público usam Supabase com isolamento por loja (RLS). O cardápio público é acessível pelo endereço `/cardapio?loja=SLUG`.

## Plano Premium e entregadores

No Premium, o painel habilita `Motoboys`, `Entregas`, `Mudanças e suporte` e personalização visual em `Configurações`. Entregadores recebem convites exclusivos e acessam `/motoboy` usando conta Supabase individual, com ofertas, aceite e rotas Maps/Waze. O lojista registra as entregas após receber o pedido via WhatsApp; a importação de pedidos não é automática.

Solicitações de mudança ficam armazenadas no Supabase e podem ser gerenciadas no painel `/admin`. O atendimento avalia escopo, prazos e eventuais custos adicionais.

## Projeto técnico

- Servidor HTTP: `server.mjs`, Node.js.
- Frontends: `public/cliente.js`, `public/cardapio.js`, `public/motoboy.js`, `public/admin.js`.
- Banco de dados: Supabase com migrations versionadas em `sql/`.
- Migração dos dois planos: `sql/bipstart_two_plans_unified_20261014.sql`, aplicada em 14/10/2026 ao projeto BipStart.
- Testes: `npm test` e GitHub Actions `Validar BipStart`.

## Desenvolvimento e homologação

```bash
npm test
npm start
```

As variáveis de ambiente necessárias para as páginas com autenticação são `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e, quando configurado, `TURNSTILE_SITE_KEY`. Nunca exponha uma chave secreta do Supabase no navegador.

Branch de homologação: `feature/whatsapp-planos-manual-20261013`. O serviço Northflank `bipstart-homologacao` permite testar atualizações sem mesclar em `main`, que alimenta a produção. O deploy da homologação é manual após CI aprovado.

O site original da Salgatti é um projeto separado e não deve ser modificado por mudanças na BipStart.
