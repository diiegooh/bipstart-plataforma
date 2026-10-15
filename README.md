# BipStart — PDV, cardápio online e delivery

A BipStart é uma plataforma para pequenos negócios, com painel de loja e cardápio digital público, organizada em **dois planos**:

| Plano | Preço de referência | Recursos |
| --- | --- | --- |
| **Básico** | **R$ 29,90, pagamento único** | PDV com estoque, vendas e cardápio online com categorias, fotos, preços e carrinho via WhatsApp |
| **Premium** | **R$ 79,90/mês** | Tudo do Básico, motoboys particulares integrados à fila de entregas, logo e cores próprias, suporte mensal e adaptações solicitadas sem custo adicional |

**O catálogo comercial tem apenas Básico e Premium.** Cada cliente cria uma única loja com os módulos de PDV e cardápio integrados, compartilhando o mesmo cadastro de produtos.

## Entrada da loja: Cardápio ou PDV + Cardápio

Depois de entrar na conta confirmada e com plano vigente, o lojista vê duas opções:

- **CARDÁPIO:** abre **diretamente** `/cardapio?loja=SLUG` (sem editor ou painel intermediário). A vitrine utiliza o layout do delivery da Godzilla como referência, mas as informações e as imagens pertencem à loja BipStart: banner, logo, categorias dinâmicas, busca, produtos, carrinho, entrega/retirada e pedido enviado ao WhatsApp do estabelecimento. O lojista autenticado e dono da loja vê o botão **Gerenciar cardápio** na vitrine, que abre diretamente o editor em `/cliente?editar=cardapio`; visitantes não veem esse atalho. O editor também fica disponível na navegação do PDV para **cadastrar e editar** categorias, produtos, preços e fotos.
- **PDV + CARDÁPIO:** abre **diretamente a frente de caixa** inspirada no projeto privado `diiegooh/godzilla-adega`, sem passar por visão geral. A tela apresenta grade de produtos, busca, filtro por categoria, carrinho lateral, dinheiro/Pix/cartões, troco em dinheiro e simulação informativa de taxas. O cardápio público permanece acessível pela opção **CARDÁPIO** da tela inicial.

Ambas as opções operam a **mesma loja e o mesmo cadastro de produtos**. O PDV continua salvando vendas pela função protegida `bipstart_complete_sale` do Supabase, com baixa de estoque; nenhuma cobrança de cartão ou Pix é processada na BipStart. A simulação de taxas não é gravada como lançamento financeiro. Produtos sem estoque são marcados como **Esgotado** na vitrine pública. Antes de abrir o WhatsApp, o sistema consulta o catálogo novamente e informa se algum item esgotou ou mudou de preço. **Pedidos por WhatsApp não reservam estoque nem criam vendas automaticamente**; o estabelecimento ainda deve confirmar e registrar o pedido.

Os repositórios e os dados da Godzilla Adega não são alterados: a BipStart usa apenas a referência de interface do cardápio e do PDV. Cada lojista continua isolado no Supabase da BipStart; o cardápio de clientes não acessa nem utiliza senhas ou dados da Godzilla.

## Cadastro, autenticação e planos

A área `/cliente` usa Supabase Auth com confirmação de e-mail e avaliação gratuita de sete dias. Após o vencimento, o acesso é bloqueado e os dados são preservados. A contratação dos planos ocorre **manualmente pelo WhatsApp da BipStart**; o administrador ativa o acesso em `/admin` depois da confirmação do pagamento. Premium vale por 30 dias por ativação. A BipStart não cobra pedidos/vendas dos lojistas.

A demonstração da página inicial usa dados locais do navegador e **não representa um pedido real**. Uma loja real e o cardápio público usam Supabase com isolamento por loja (RLS). O cardápio público é acessível pelo endereço `/cardapio?loja=SLUG`.

## Plano Premium e entregadores

No Premium, o painel habilita `Motoboys`, `Entregas`, `Mudanças e suporte` e personalização visual em `Configurações`. Entregadores recebem convites exclusivos e acessam `/motoboy` usando conta Supabase individual, com ofertas, aceite e rotas Maps/Waze. O lojista registra as entregas após receber o pedido via WhatsApp; a importação de pedidos não é automática.

Solicitações de adaptação ficam armazenadas no Supabase e podem ser gerenciadas no painel `/admin`. No plano Premium, as solicitações não têm custo adicional; a equipe organiza o escopo e o prazo da implementação. O cardápio ainda envia pedidos ao WhatsApp; a inclusão automática desses pedidos no painel de entregas não está implementada.

## Site público e experiência de contratação

O menu **Planos** mantém Básico e Premium. Ambos os botões de seleção têm aparência e tamanho equivalentes. Em telas pequenas, a opção **Entrar** permanece visível no cabeçalho e abre `/cliente`, independentemente de o menu desktop estar recolhido. A FAQ esclarece que pagamentos de vendas não são recebidos pela BipStart: são tratados na loja física ou combinados pelo WhatsApp.

## Coluna de operação da loja

Dentro do **PDV + CARDÁPIO**, o menu lateral segue a navegação visual da Godzilla Adega: **PDV, Produtos, Pedidos online, Motoboys, Vendas**. O topo da barra lateral mostra **somente o nome da loja** e o acesso às configurações, sem logo da BipStart. O PDV usa a tela inteira, sem cabeçalho superior. O rodapé oferece **Alterar cor** (Premium) e, lado a lado, **Voltar às opções** e **Sair**. O atalho de abrir cardápio foi removido tanto do caixa quanto da lateral do PDV. O Básico vê o recurso de motoboys identificado como Premium e sem acesso, enquanto a opção de cores informa a restrição. Configurações ficam no ícone de engrenagem ao lado do nome da loja. No celular, um botão **Menu da loja** fica visível acima do PDV, abrindo a coluna vertical; esse botão é preservado mesmo sem a barra superior.

**Pedidos online:** ao clicar em Enviar pelo WhatsApp, a vitrine solicita **nome e telefone**, exige o endereço quando for entrega, e registra itens, preços calculados no servidor, pagamento pretendido, taxa e total **antes de abrir o WhatsApp**. O painel do lojista mostra cada pedido e permite marcar manualmente seu estado e se foi pago. O registro não comprova que o usuário confirmou o envio dentro do WhatsApp, portanto entra como **Aguardando confirmação** e **Aguardando pagamento**. As informações pessoais só podem ser lidas pelo dono da loja autenticado (RLS). O estoque do PDV não é reservado nem baixado automaticamente. No Premium, o lojista pode cadastrar a entrega confirmada na fila dos motoboys. **Produtos** reúne cadastro, quantidades e alertas de estoque baixo ou esgotado. Não existe uma aba separada para estoque. Não há alteração no banco de dados por causa da barra lateral.

## Filtro de categorias e preço do cardápio — 14/10/2026

Em **Produtos**, cada categoria (incluindo **Todos**) recebe um botão em formato de card acima da grade. Ao clicar, somente os produtos da categoria aparecem. Os cards de produto ficam aproximadamente **40% menores** no desktop, com estilos responsivos, mas conservam foto, preço de venda, custo, estoque, mínimo e edição.

O formulário de Produtos e o editor do cardápio agora perguntam **Venda online?** (Sim/Não). **Sim** exige o **Valor no cardápio online** e publica o produto na vitrine. **Não** mantém o produto no cadastro, estoque e PDV, mas o exclui completamente da vitrine pública. O preço do PDV permanece separado do preço público. O Supabase armazena `shop_products.menu_price` e `menu_price_enabled` e a RPC pública `bipstart_public_menu` devolve o preço público efetivo em `items[].price`. Assim a vitrine, o carrinho e o texto enviado ao WhatsApp usam um valor consistente; **o PDV e a baixa de estoque continuam utilizando `shop_products.price`**. O preço novo passa a valer assim que salvo para novas consultas à vitrine e é conferido novamente na finalização de cada pedido. Um cardápio que já está aberto deve ser atualizado para exibir o novo preço imediatamente.

Migração: `sql/bipstart_menu_price_20261014.sql` no projeto Supabase da BipStart. Não modifica valores ou registros antigos; por padrão o preço alternativo começa desativado. Executar antes do deploy da nova interface.

Nova migração: `sql/bipstart_online_enabled_20261014.sql` adiciona `shop_products.online_enabled` (padrão **true**, para preservar a publicação dos produtos existentes) e filtra `p.online_enabled=true` na função `bipstart_public_menu`. Novos itens exigem escolha explícita no formulário. Produtos com **Não** não aparecem na vitrine pública nem no carrinho ou pedido WhatsApp; o PDV permanece inalterado. Execute a migração do banco antes de publicar o JavaScript novo.

## Pedidos online registrados e cor da loja no PDV

A sidebar do PDV segue a cor de marca da loja (Premium) ou a cor padrão roxa, com contraste automático no item selecionado. O tema não altera outras lojas.

Migração `sql/bipstart_online_orders_20261014.sql`: tabela `shop_online_orders` com dados pessoais protegidos por RLS, consultas/alterações restritas à loja e RPC pública `bipstart_place_online_order`. A RPC **não recebe preços arbitrários**: lê produtos online habilitados, valida o estoque disponível, calcula valores e taxa de entrega e limita requisições repetidas. O identificador do carrinho evita pedidos duplicados após tentativas de envio. Somente o dono pode marcar pagamento como recebido. **O WhatsApp não fornece confirmação de envio** ao site: o registro significa que o checkout foi iniciado e que o WhatsApp foi aberto, não que houve envio efetivo nem pagamento.

## Cards de produtos com controle de estoque — 14/10/2026

A aba **Produtos** exibe uma grade responsiva de cartões individuais por produto, com foto (ou imagem neutra), nome, categoria, preço de venda, preço de custo, **quantidade atual**, **estoque mínimo** e botão **Editar**. No celular, a grade adapta o número de colunas.

No topo da aba Produtos também há contadores de itens cadastrados, estoque baixo e sem estoque. O status depende do mínimo de cada produto: **Sem estoque** (saldo zero), **Estoque baixo** (saldo positivo menor ou igual ao mínimo) e **Estoque normal** (saldo maior que o mínimo). A cor diferencia as situações e o saldo é atualizado após vendas concluídas no PDV. O formulário permite configurar o mínimo por item. A migração `sql/bipstart_product_min_stock_20261014.sql` adiciona `shop_products.min_stock` com valor inicial 5 e restrição para não negativos; não altera o saldo, o preço nem os produtos existentes.

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
