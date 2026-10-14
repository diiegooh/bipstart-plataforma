# BipStart — PDV, cardápio online e delivery

A BipStart é uma plataforma para pequenos negócios, com painel de loja e cardápio digital público, organizada em **dois planos**:

| Plano | Preço de referência | Recursos |
| --- | --- | --- |
| **Básico** | **R$ 29,90, pagamento único** | PDV com estoque, vendas e cardápio online com categorias, fotos, preços e carrinho via WhatsApp |
| **Premium** | **R$ 79,90/mês** | Tudo do Básico, delivery com motoboys próprios, logo e cores próprias, solicitações de mudanças sob avaliação de escopo e suporte mensal |

**O catálogo comercial tem apenas Básico e Premium.** Cada cliente cria uma única loja com os módulos de PDV e cardápio integrados, compartilhando o mesmo cadastro de produtos.

## Entrada da loja: Cardápio ou PDV + Cardápio

Depois de entrar na conta confirmada e com plano vigente, o lojista vê duas opções:

- **CARDÁPIO:** abre **diretamente** `/cardapio?loja=SLUG` (sem editor ou painel intermediário). A vitrine utiliza o layout do delivery da Godzilla como referência, mas as informações e as imagens pertencem à loja BipStart: banner, logo, categorias dinâmicas, busca, produtos, carrinho, entrega/retirada e pedido enviado ao WhatsApp do estabelecimento. O lojista autenticado e dono da loja vê o botão **Gerenciar cardápio** na vitrine, que abre diretamente o editor em `/cliente?editar=cardapio`; visitantes não veem esse atalho. O editor também fica disponível na navegação do PDV para **cadastrar e editar** categorias, produtos, preços e fotos.
- **PDV + CARDÁPIO:** abre **diretamente a frente de caixa** inspirada no projeto privado `diiegooh/godzilla-adega`, sem passar por visão geral. A tela apresenta grade de produtos, busca, filtro por categoria, carrinho lateral, dinheiro/Pix/cartões, troco em dinheiro e simulação informativa de taxas. O botão `Abrir cardápio` aponta para o mesmo cardápio público da loja.

Ambas as opções operam a **mesma loja e o mesmo cadastro de produtos**. O PDV continua salvando vendas pela função protegida `bipstart_complete_sale` do Supabase, com baixa de estoque; nenhuma cobrança de cartão ou Pix é processada na BipStart. A simulação de taxas não é gravada como lançamento financeiro. Produtos sem estoque são marcados como **Esgotado** na vitrine pública. Antes de abrir o WhatsApp, o sistema consulta o catálogo novamente e informa se algum item esgotou ou mudou de preço. **Pedidos por WhatsApp não reservam estoque nem criam vendas automaticamente**; o estabelecimento ainda deve confirmar e registrar o pedido.

Os repositórios e os dados da Godzilla Adega não são alterados: a BipStart usa apenas a referência de interface do cardápio e do PDV. Cada lojista continua isolado no Supabase da BipStart; o cardápio de clientes não acessa nem utiliza senhas ou dados da Godzilla.

## Cadastro, autenticação e planos

A área `/cliente` usa Supabase Auth com confirmação de e-mail e avaliação gratuita de sete dias. Após o vencimento, o acesso é bloqueado e os dados são preservados. A contratação dos planos ocorre **manualmente pelo WhatsApp da BipStart**; o administrador ativa o acesso em `/admin` depois da confirmação do pagamento. Premium vale por 30 dias por ativação. A BipStart não cobra pedidos/vendas dos lojistas.

A demonstração da página inicial usa dados locais do navegador e **não representa um pedido real**. Uma loja real e o cardápio público usam Supabase com isolamento por loja (RLS). O cardápio público é acessível pelo endereço `/cardapio?loja=SLUG`.

## Plano Premium e entregadores

No Premium, o painel habilita `Motoboys`, `Entregas`, `Mudanças e suporte` e personalização visual em `Configurações`. Entregadores recebem convites exclusivos e acessam `/motoboy` usando conta Supabase individual, com ofertas, aceite e rotas Maps/Waze. O lojista registra as entregas após receber o pedido via WhatsApp; a importação de pedidos não é automática.

Solicitações de mudança ficam armazenadas no Supabase e podem ser gerenciadas no painel `/admin`. O atendimento avalia escopo, prazos e eventuais custos adicionais.

## Coluna de operação da loja

Dentro do **PDV + CARDÁPIO**, o menu lateral segue a navegação visual da Godzilla Adega: **PDV, Produtos, Estoque, Pedidos online, Motoboys, Vendas**. O topo mostra a logo e o nome da loja; o rodapé oferece **Alterar cor** (Premium), **Abrir cardápio** e **Sair**. O Básico vê o recurso de motoboys identificado como Premium e sem acesso, enquanto a opção de cores informa a restrição. Configurações ficam no ícone de engrenagem ao lado do nome da loja. No celular, a coluna abre pelo botão Menu e mantém layout vertical.

**Pedidos online:** abre diretamente o link público `/cardapio?loja=SLUG` da própria loja, na mesma aba. O cardápio apresenta fundo escuro, detalhes verdes (ou a cor personalizada da loja), banner com foto de um produto, categorias circulares e produtos em lista com foto, descrição, preço e botão **Pedir**. O carrinho continua enviando a solicitação pelo WhatsApp do lojista, sem criar vendas automaticamente. O lojista encontra **Gerenciar cardápio** na vitrine; a fila de entregas Premium fica acessível em **Motoboys**. **Estoque** apresenta quantidade e sinaliza itens esgotados e baixos. Não há alteração no banco de dados por causa da barra lateral.

## Cards de cadastro e estoque — 14/10/2026

As abas **Produtos** (cadastro) e **Estoque** exibem uma grade responsiva de cartões individuais por produto, com foto (ou imagem neutra), nome, categoria, preço de venda, preço de custo, **quantidade atual**, **estoque mínimo** e botão **Editar**. No celular, a grade adapta o número de colunas.

O status depende do mínimo de cada produto: **Sem estoque** (saldo zero), **Estoque baixo** (saldo positivo menor ou igual ao mínimo) e **Estoque normal** (saldo maior que o mínimo). A cor diferencia as situações e o saldo é atualizado após vendas concluídas no PDV. O formulário permite configurar o mínimo por item. A migração `sql/bipstart_product_min_stock_20261014.sql` adiciona `shop_products.min_stock` com valor inicial 5 e restrição para não negativos; não altera o saldo, o preço nem os produtos existentes.

## Projeto técnico

- Servidor HTTP: `server.mjs`, Node.js.
- Frontends: `public/cliente.js`, `public/vitrine.js` (vitrine no endereço `/cardapio`), `public/cardapio.js` (layout anterior em `/cardapio.html`), `public/motoboy.js` e `public/admin.js`.
- Banco de dados: Supabase com migrations versionadas em `sql/`.
- Migração dos dois planos: `sql/bipstart_two_plans_unified_20261014.sql`, aplicada em 14/10/2026 ao projeto BipStart.
- Disponibilidade no cardápio público: `sql/bipstart_public_menu_stock_20261014.sql` (adiciona apenas o indicador booleano `in_stock` sem divulgar a quantidade exata); executar e validar no mesmo projeto Supabase antes do deploy do frontend.
- Testes: `npm test` e GitHub Actions `Validar BipStart`; cobertura em `tests/vitrine-godzilla.mjs` e `tests/cardapio-gestao-estoque.mjs`.

## Desenvolvimento e homologação

```bash
npm test
npm start
```

As variáveis de ambiente necessárias para as páginas com autenticação são `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e, quando configurado, `TURNSTILE_SITE_KEY`. Nunca exponha uma chave secreta do Supabase no navegador.

Branch de homologação: `feature/whatsapp-planos-manual-20261013`. O fluxo de acesso direto foi integrado via PR #9 à branch de homologação. As correções de gestão e estoque estão em `fix/gestao-cardapio-estoque-20261014` até validação. O serviço Northflank `bipstart-homologacao` permite testar atualizações sem mesclar em `main`, que alimenta a produção. O deploy da homologação é manual após CI aprovado, seguido de revisão visual e teste real de acesso, pedido WhatsApp e venda PDV.

O site original da Salgatti é um projeto separado e não deve ser modificado por mudanças na BipStart.
