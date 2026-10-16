# BipStart — PDV, cardápio online e delivery

A BipStart é uma plataforma para pequenos negócios, com painel de loja e cardápio digital público, organizada em **dois planos**:

| Plano | Preço de referência | Recursos |
| --- | --- | --- |
| **Básico** | **R$ 29,90, pagamento único** | PDV com produtos, estoque, frente de caixa e histórico de vendas; cardápio online bloqueado |
| **Premium** | **R$ 79,90/mês** | Tudo do Básico + cardápio online com carrinho e pedidos, motoboys particulares integrados, logo e cores próprias, suporte mensal e adaptações solicitadas sem custo adicional |

**O catálogo comercial tem apenas Básico e Premium.** Cada cliente cria uma única loja com PDV, produtos e estoque. O cardápio público é desbloqueado apenas com o Premium ativo, sem migrar a loja nem duplicar produtos.

## Entrada da loja: Cardápio ou PDV + Cardápio

Depois de entrar na conta confirmada e com plano vigente, o lojista vê duas opções:

- **CARDÁPIO:** abre **diretamente** `/cardapio?loja=SLUG` (sem editor ou painel intermediário). A vitrine utiliza o layout do delivery da Godzilla como referência, mas as informações e as imagens pertencem à loja BipStart: título **CARDÁPIO** centralizado no cabeçalho (com nome da loja abaixo, sem banner grande nem logo), categorias dinâmicas, busca, produtos, carrinho, entrega/retirada e pedido enviado ao WhatsApp do estabelecimento. O lojista autenticado e dono da loja vê o botão **Gerenciar cardápio** na vitrine, que abre diretamente o editor em `/cliente?editar=cardapio`; visitantes não veem esse atalho. O editor também fica disponível na navegação do PDV para **cadastrar e editar** categorias, produtos, preços e fotos.
- **PDV + CARDÁPIO:** abre **diretamente a frente de caixa** inspirada no projeto privado `diiegooh/godzilla-adega`, sem passar por visão geral. A tela apresenta grade de produtos, busca, filtro por categoria, carrinho lateral, dinheiro/Pix/cartões, troco em dinheiro e simulação informativa de taxas. O cardápio público permanece acessível pela opção **CARDÁPIO** da tela inicial.

Ambas as opções operam a **mesma loja e o mesmo cadastro de produtos**. O PDV continua salvando vendas pela função protegida `bipstart_complete_sale` do Supabase, com baixa de estoque; nenhuma cobrança de cartão ou Pix é processada na BipStart. A simulação de taxas não é gravada como lançamento financeiro. Produtos sem estoque são marcados como **Esgotado** na vitrine pública. Antes de abrir o WhatsApp, o sistema consulta o catálogo novamente e informa se algum item esgotou ou mudou de preço. **Pedidos por WhatsApp não reservam estoque nem criam vendas automaticamente**; o estabelecimento ainda deve confirmar e registrar o pedido.

Os repositórios e os dados da Godzilla Adega não são alterados: a BipStart usa apenas a referência de interface do cardápio e do PDV. Cada lojista continua isolado no Supabase da BipStart; o cardápio de clientes não acessa nem utiliza senhas ou dados da Godzilla.

## Cadastro, autenticação e planos

A área `/cliente` usa Supabase Auth com confirmação de e-mail e avaliação gratuita de sete dias. Após o vencimento, o acesso é bloqueado e os dados são preservados. A contratação dos planos ocorre **manualmente pelo WhatsApp da BipStart**; o administrador ativa o acesso em `/admin` depois da confirmação do pagamento. Premium vale por 30 dias por ativação. A BipStart não cobra pedidos/vendas dos lojistas.

No **topo do cardápio público**, são exibidos **Endereço para retirada** e **Horário de funcionamento**, usando os valores `location_text` e `opening_hours` cadastrados nas configurações da loja. O link do endereço aponta para a busca no mapa somente quando houver endereço cadastrado. A faixa superior não exibe mais taxa de entrega; **a taxa configurada continua sendo apresentada e calculada no checkout de entregas**, para não ocultar o valor cobrado do comprador. O rodapé mantém as formas de pagamento, sem duplicar o horário.

A demonstração da página inicial usa dados locais do navegador e **não representa um pedido real**. Uma loja real e o cardápio público usam Supabase com isolamento por loja (RLS). O cardápio público é acessível pelo endereço `/cardapio?loja=SLUG`.

## Plano Premium e entregadores

No Premium, o painel habilita `Motoboys`, `Entregas`, `Mudanças e suporte` e personalização visual em `Configurações`. Entregadores recebem convites exclusivos e acessam `/motoboy` usando conta Supabase individual, com ofertas, aceite e rotas Maps/Waze. O lojista registra as entregas após receber o pedido via WhatsApp; a importação de pedidos não é automática.

Solicitações de adaptação ficam armazenadas no Supabase e podem ser gerenciadas no painel `/admin`. No plano Premium, as solicitações não têm custo adicional; a equipe organiza o escopo e o prazo da implementação. O cardápio ainda envia pedidos ao WhatsApp; a inclusão automática desses pedidos no painel de entregas não está implementada.

## Site público e experiência de contratação

O menu **Planos** mantém Básico e Premium. Ambos os botões de seleção têm aparência e tamanho equivalentes. Em telas pequenas, a opção **Entrar** permanece visível no cabeçalho e abre `/cliente`, independentemente de o menu desktop estar recolhido. A FAQ esclarece que pagamentos de vendas não são recebidos pela BipStart: são tratados na loja física ou combinados pelo WhatsApp.

## Coluna de operação da loja

Dentro do **PDV + CARDÁPIO**, o menu lateral segue a navegação visual da Godzilla Adega: **PDV, Produtos, Cardápio online, Pedidos online, Motoboys, Vendas**. O topo da barra lateral mostra **somente o nome da loja** e o acesso às configurações, sem logo da BipStart. O PDV usa a tela inteira, sem cabeçalho superior. O rodapé oferece **Alterar cor** (Premium) e, lado a lado, **Voltar às opções** e **Sair**. O menu lateral inclui **Cardápio online ↗**, que abre a vitrine pública da própria loja em outra aba via `/cardapio?loja=slug` sem sair do PDV. O botão antigo da tela do caixa permanece removido. O Básico vê o recurso de motoboys identificado como Premium e sem acesso, enquanto a opção de cores informa a restrição. Configurações ficam no ícone de engrenagem ao lado do nome da loja. No celular, um botão **Menu da loja** fica visível acima do PDV, abrindo a coluna vertical; esse botão é preservado mesmo sem a barra superior.

**Pedidos online:** ao clicar em Enviar pelo WhatsApp, a vitrine solicita **nome e telefone**, exige o endereço quando for entrega, e registra itens, preços calculados no servidor, pagamento pretendido, taxa e total **antes de abrir o WhatsApp**. O painel do lojista mostra cada pedido e permite marcar manualmente seu estado e se foi pago. O registro não comprova que o usuário confirmou o envio dentro do WhatsApp, portanto entra como **Aguardando confirmação** e **Aguardando pagamento**. As informações pessoais só podem ser lidas pelo dono da loja autenticado (RLS). O estoque do PDV não é reservado nem baixado automaticamente. No Premium, o lojista pode cadastrar a entrega confirmada na fila dos motoboys. **Produtos** reúne cadastro, quantidades e alertas de estoque baixo ou esgotado. Não existe uma aba separada para estoque. Não há alteração no banco de dados por causa da barra lateral.

## Filtro de categorias e preço do cardápio — 14/10/2026

Em **Produtos**, cada categoria (incluindo **Todos**) recebe um botão em formato de card acima da grade. Ao clicar, somente os produtos da categoria aparecem. Os cards de produto ficam aproximadamente **40% menores** no desktop, com estilos responsivos, mas conservam foto, preço de venda, custo, estoque, mínimo e edição.

No Premium, o formulário de Produtos e o editor do cardápio perguntam **Venda online?** (Sim/Não). No Básico essa opção fica bloqueada, mas seus valores previamente salvos não são apagados. **Sim** exige o **Valor no cardápio online** e publica o produto na vitrine. **Não** mantém o produto no cadastro, estoque e PDV, mas o exclui completamente da vitrine pública. O preço do PDV permanece separado do preço público. O Supabase armazena `shop_products.menu_price` e `menu_price_enabled` e a RPC pública `bipstart_public_menu` devolve o preço público efetivo em `items[].price`. Assim a vitrine, o carrinho e o texto enviado ao WhatsApp usam um valor consistente; **o PDV e a baixa de estoque continuam utilizando `shop_products.price`**. O preço novo passa a valer assim que salvo para novas consultas à vitrine e é conferido novamente na finalização de cada pedido. Um cardápio que já está aberto deve ser atualizado para exibir o novo preço imediatamente.

Migração: `sql/bipstart_menu_price_20261014.sql` no projeto Supabase da BipStart. Não modifica valores ou registros antigos; por padrão o preço alternativo começa desativado. Executar antes do deploy da nova interface.

Nova migração: `sql/bipstart_online_enabled_20261014.sql` adiciona `shop_products.online_enabled` (padrão **true**, para preservar a publicação dos produtos existentes) e filtra `p.online_enabled=true` na função `bipstart_public_menu`. Novos itens exigem escolha explícita no formulário. Produtos com **Não** não aparecem na vitrine pública nem no carrinho ou pedido WhatsApp; o PDV permanece inalterado. Execute a migração do banco antes de publicar o JavaScript novo.

## Pedidos online registrados e cor da loja no PDV

A sidebar do PDV segue a cor de marca da loja (Premium) ou a cor padrão roxa, com contraste automático no item selecionado. O tema não altera outras lojas.

Migração `sql/bipstart_online_orders_20261014.sql`: tabela `shop_online_orders` com dados pessoais protegidos por RLS, consultas/alterações restritas à loja e RPC pública `bipstart_place_online_order`. A RPC **não recebe preços arbitrários**: lê produtos online habilitados, valida o estoque disponível, calcula valores e taxa de entrega e limita requisições repetidas. O identificador do carrinho evita pedidos duplicados após tentativas de envio. Somente o dono pode marcar pagamento como recebido. **O WhatsApp não fornece confirmação de envio** ao site: o registro significa que o checkout foi iniciado e que o WhatsApp foi aberto, não que houve envio efetivo nem pagamento.

## Relatório de vendas e reposição

A aba **Vendas** mostra um filtro **Dia / Semana / Mês** e uma data de referência. Cada período lista todas as vendas consultadas, agrupadas por dia, com **data, horário, produto, quantidade, forma de pagamento, custo da linha, preço vendido da linha e lucro bruto da linha**, além de somas por dia e totais do período. Consultas são paginadas e filtradas por loja e datas; só o titular autenticado pode ler as vendas via RLS.

**Lucro bruto = preço vendido menos custo registrado**, antes de impostos e taxas. Para novas vendas, a migração `sql/bipstart_sales_cost_snapshot_20261014.sql` grava o custo unitário original em cada `shop_sale_items.unit_cost`. Itens vendidos antes dessa migração não têm snapshot: se o produto ainda existir, usa o custo atualmente cadastrado como **estimativa explicitamente identificada**; se o custo não puder ser encontrado, exibe valor indisponível e soma o lucro apenas das linhas conhecidas (**parcial**). Nenhuma venda antiga é regravada.

No cadastro de **Produtos**, a **Lista de reposição** reúne itens esgotados ou com estoque menor ou igual ao mínimo configurado. Exibe saldo, estoque mínimo, quantidade a comprar para ficar **acima do mínimo**, custo unitário e custo estimado da reposição; o painel soma o investimento total baseado nos custos cadastrados. Isso não realiza compras nem altera estoque automaticamente.

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

## Imagens dos modelos na página inicial

A seção **Modelos** usa três mini cards com ilustrações de funcionalidades por sistema: no PDV, **Venda rápida**, **Controle automático** e **Resumo de vendas**; no cardápio, **Produtos organizados**, **Carrinho de compras** e **Pedido via WhatsApp**. As ilustrações são elementos HTML/CSS responsivos, com valores fictícios apenas para demonstração; as imagens SVG grandes anteriores deixaram de ser exibidas. Os botões **Experimentar PDV** e **Experimentar cardápio** preservam seus fluxos existentes. Em notebooks, a seção e os mini cards recebem espaçamentos menores e uma regra especial para telas de até 950 px de altura; em tablet e celular os dois modelos permanecem empilhados e com todos os textos visíveis.

## Desenvolvimento e homologação

```bash
npm test
npm start
```

As variáveis de ambiente necessárias para as páginas com autenticação são `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e, quando configurado, `TURNSTILE_SITE_KEY`. Nunca exponha uma chave secreta do Supabase no navegador.

Branch de homologação: `feature/whatsapp-planos-manual-20261013`. O fluxo de acesso direto foi integrado via PR #9 à branch de homologação. As correções de gestão e estoque estão em `fix/gestao-cardapio-estoque-20261014` até validação. O serviço Northflank `bipstart-homologacao` permite testar atualizações sem mesclar em `main`, que alimenta a produção. O deploy da homologação é manual após CI aprovado, seguido de revisão visual e teste real de acesso, pedido WhatsApp e venda PDV.

O site original da Salgatti é um projeto separado e não deve ser modificado por mudanças na BipStart.

## Avisos de pedidos e pagamentos pelo WhatsApp (integração opcional)

No painel **Pedidos online**, cada avanço de etapa ou cancelamento usa `POST /api/online-order-update`. O servidor verifica a sessão do proprietário e a transição atual no Supabase (RLS) antes de registrar o novo status. Pedido: aguardando confirmação → confirmado → em preparo → finalizado; pagamento: aguardando → pago; ambos têm cancelamento separado. Ao alterar, o servidor solicita uma **notificação transacional** ao WhatsApp Cloud API **somente** se o cliente autorizou no checkout (`whatsapp_updates_opt_in=true`). A Meta aceitar o envio não garante entrega.

**Pré-requisitos de envio automático:** configurar na hospedagem (Northflank) `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID` e, conforme a versão suportada, `WHATSAPP_GRAPH_API_VERSION`; jamais colocar tokens no frontend ou no GitHub. No Gerenciador do WhatsApp Business da Meta, criar e obter aprovação para um modelo **Utilidade**, nome `bipstart_atualizacao_pedido`, idioma `pt_BR`, corpo exato com cinco variáveis:

```text
Olá {{1}}, a loja {{2}} atualizou o {{3}} do pedido #{{4}} para: {{5}}.
```

As variáveis são nome do cliente, nome da loja, área atualizada ("pedido" ou "pagamento"), oito primeiros caracteres do número do pedido e a situação nova. Alterar `WHATSAPP_TEMPLATE_ORDER_UPDATE` caso use outro nome aprovado. A conta Meta conectada é o **número remetente da BipStart**, comunicando em nome da loja; não é automaticamente o WhatsApp cadastrado de cada estabelecimento. Mensagens pela API podem ser cobradas.

**Sem API, com modelo reprovado ou erro de envio:** o status no painel é alterado normalmente e aparece o link **Enviar atualização ao cliente no WhatsApp**, com o texto preenchido para o lojista enviar manualmente. Não marcar notificações como entregues apenas porque a Meta aceitou a solicitação. Sem autorização do cliente, o sistema não envia mensagens automáticas. O lojista pode selecionar **Desativar avisos WhatsApp** em um pedido após solicitação do cliente.

**Banco de dados:** aplicar `sql/bipstart_online_whatsapp_optin_20261015.sql` (campo e RPC para opt-in do cliente) e `sql/bipstart_online_whatsapp_owner_optout_20261015.sql` (permissão de desativação pelo lojista). Ambas já foram aplicadas ao projeto Supabase da BipStart. Pedidos anteriores têm opt-in inicial **false**. O token do carrinho limita a autorização via RPC pública ao próprio pedido, e as alterações de status seguem RLS por loja. Não é necessário reconfigurar o PDV ou estoque.

**Atenção:** as alterações no GitHub não configuram a conta Meta nem publicam automaticamente a versão na hospedagem. É necessário cadastrar credenciais e modelo aprovado, além de realizar o deploy, para ativar avisos automáticos.

## Acompanhamento gratuito e avisos manuais no WhatsApp

Para não depender da API do WhatsApp, novos pedidos do cardápio oferecem uma **página pública de acompanhamento** e **mensagens prontas com envio manual**. O cliente clica em **Continuar pedido**, aguarda o registro do pedido e recebe **Acompanhar meu pedido**, **Copiar link de acompanhamento** e **Enviar pedido à loja pelo WhatsApp**. O envio ao WhatsApp só acontece quando o cliente confirma a mensagem na conversa — apenas registrar o pedido não comprova o envio.

**Link privado:** `/acompanhar#pedido=UUID&chave=TOKEN`. Os identificadores ficam no fragmento da URL, que não é enviado ao servidor web em requisições HTTP nem incluído no cabeçalho Referer. O token é o UUIDv4 aleatório do próprio carrinho, não o número curto do pedido nem o telefone do cliente. A página chama `bipstart_track_online_order`, que exige os dois UUIDs e devolve somente nome da loja, status do pedido, status do pagamento, método de recebimento, valor total e data; **não** devolve nome, telefone ou endereço. Não há consulta por CPF ou telefone. Mantenha o link privado.

**Atualização automática da página:** a cada 20 segundos enquanto a aba estiver visível, além de um botão de atualização e nova consulta quando o usuário retornar à aba. Para pedidos de entrega: aguardando confirmação → confirmado → em preparo → saiu para entrega → finalizado. Para retirada: a etapa de transporte é omitida. Status de cancelamento e pagamento são exibidos separadamente.

**Mensagem manual:** a loja altera status no painel `Pedidos online`. Sem credenciais do WhatsApp Cloud API, se o cliente autorizou receber atualizações, surge um link **Enviar atualização ao cliente no WhatsApp** com mensagem pronta e o novo status. O lojista precisa clicar e efetivamente enviar a mensagem. Esta alternativa não tem custo próprio de integração, embora mensagens fora do serviço possam consumir dados móveis. Sem autorização, o sistema não encaminha notificações por conta própria. Se houver credenciais da API anteriormente configuradas, o envio automatizado opcional permanece disponível; as alternativas funcionam sem essas credenciais.

**Banco:** a migração `sql/bipstart_track_online_order_20261015.sql` publica somente a RPC de acompanhamento por dois identificadores privados, sem alterar pedidos antigos nem permissões diretas das tabelas. A migração já foi aplicada no Supabase da BipStart. A nova página exige deploy do repositório para ficar disponível na hospedagem.


## Básico e Premium no mesmo painel e no mesmo banco

O endereço **/cliente** é o único painel operacional para ambos os planos. Os botões comerciais do site inicial ("Escolher Básico", "Escolher Premium", "Experimentar PDV", "Experimentar cardápio" e teste gratuito) abrem **/cliente** e não a antiga simulação local. O parâmetro `?plano=basic|pro` pré-seleciona o plano no primeiro cadastro. Quem já tem loja é direcionado às configurações para solicitar mudança **na loja existente**.

Os mesmos registros `shops.id`, `shop_products`, `shop_menu_categories`, `shop_sales`, `shop_online_orders` e as configurações da loja permanecem intactos ao mudar de plano; não há criação de uma segunda loja nem cópia do catálogo. O painel, produtos, PDV, cardápio, histórico e pedidos são os mesmos nos dois planos. **Motoboys e fila de entregas, personalização de logo/cores e suporte** são recursos liberados pelo `shop_entitlements.plan_code='pro'` com acesso vigente.

Nas **Configurações da loja → Meu plano**, o titular pode solicitar Premium a partir do Básico (ou solicitar retorno ao Básico). A RPC `bipstart_request_plan_change` valida a titularidade pelo usuário autenticado e muda somente `shops.requested_plan`. Isso **não concede acesso Premium** e não realiza cobrança. A ativação continua manual via administração `bipstart_admin_set_access`, que atualiza o `shop_entitlements` e alinha o plano solicitado da mesma loja. Ao retomar a aba, a interface verifica periodicamente o plano ativo e libera o menu de motoboys sem exigir recriar a loja.

Migration aplicada no Supabase BipStart: `sql/bipstart_shared_shop_plan_upgrade_20261016.sql`. Os testes automatizados incluem `tests/shared-plans.mjs`, e uma transação de teste com rollback confirmou que a solicitação não ativa o Premium e mantém os produtos intactos.

**Atenção:** o antigo painel ilustrativo da página inicial usava dados apenas no `localStorage` (não vinculados a nenhuma conta Supabase). Esses dados locais de demonstração **não** são transferidos automaticamente para a loja real. A preservação de dados entre Básico e Premium se aplica às lojas autenticadas e seus cadastros salvos no Supabase.

## Cardápio online exclusivo do Premium

- **Básico:** mantém acesso ao PDV, Produtos, estoque, histórico de vendas e pedidos anteriormente salvos. Na escolha inicial e no menu lateral, **Cardápio online** fica marcado como **Premium** e oferece acesso à solicitação de upgrade, mas não abre a vitrine nem permite editar o cardápio público.
- **Premium vigente:** publica o cardápio, permite configuração de categorias e preços online, disponibiliza carrinho/checkout e mantém acesso à logística própria com motoboys.
- **Segurança:** as RPCs `bipstart_public_menu(text)` e `bipstart_place_online_order(...)` exigem `shop_entitlements.plan_code='pro'` **e acesso vigente**, inclusive para quem tenta o link público ou o endpoint diretamente. A restrição foi aplicada no Supabase através de `sql/bipstart_premium_online_menu_20261015.sql`, criada das definições reais das funções vigentes para preservar verificações anteriores de estoque, valores e carrinho.
- **Continuidade:** alteração de planos usa o mesmo `shop_id`. Produtos, valores online anteriores, fotos, vendas e configurações são preservados. Ao editar um produto do PDV no Básico, o sistema não sobrescreve a antiga seleção de venda online nem seu preço de cardápio. Ao reativar Premium, o cardápio pode ser publicado novamente sem importar produtos.

Os testes relacionados incluem `tests/premium-menu.mjs`; a integração no banco foi conferida com uma loja do Básico, que não podia ver o cardápio nem criar pedidos, e com uma transação de teste revertida verificando o acesso Premium.
