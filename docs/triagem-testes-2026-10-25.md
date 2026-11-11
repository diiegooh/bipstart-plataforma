# Triagem do workflow BipStart (2026-10-25)

Origem: execução GitHub Actions 40232535061 (PR #39, commit be6ba85).

- 215 testes; 146 aprovados; 69 falhas. A execução original tinha 145 aprovados / 70 falhas.
- A proteção contra acesso a `window` fora do navegador corrigiu uma falha, mas **o CI ainda está vermelho**.
- A listagem abaixo registra falhas, **não** confirma defeitos de produção nem que são testes obsoletos.

## Estratégia para correção

1. Atualizar expectativas estáticas de versões de CSS/JS, textos e componentes removidos **somente após** comparar com o comportamento atualmente aprovado.
2. Executar testes no navegador real (DOM, resize, responsividade, modo noite); testes Node sem DOM não devem simular conclusão funcional.
3. Bloquear merge em caso de regressões de segurança ou comportamento em: autenticação de motoboys, autorização de lojista/admin, isolamento por `shop_id`, upgrade Básico/Premium, pedidos, pagamentos, taxas, baixa de estoque.
4. Para cada falha: registrar causa, arquivo, comportamento esperado, evidência (resultado de teste funcional), correção e novo resultado. Não pular/remover testes de segurança para melhorar estatísticas.
5. Reexecutar `npm test` e testes integrados/browser; exigir conclusão verde antes de merge/deploy.

## Áreas de validação prioritária

- **P0**: isolamento de dados entre lojas, autorização de ações e regras de plano.
- **P1**: login de motoboys; confirmação/recusa de pedidos, entrega e estados terminais; pagamento manual, Pix/cartão/dinheiro, estoque e lucro.
- **P2**: referências a UI, textos, CSS/JS com versionamento antigo e seletores de elementos removidos.

## Inventário integral de falhas (execução #970)

- 6 - login cliente continua entrando diretamente no PDV
- 11 - vitrine pública não oferece controle administrativo ou menu de três linhas
- 23 - Produtos cadastrados exibe categorias; baixo e esgotado exibem somente os itens do respectivo status
- 32 - o formulário pergunta Venda online? e exige valor apenas no Sim
- 35 - colagem e upload ficam nas Configurações, e os cards de produtos e o editor voltam ao visual anterior
- 38 - área individual de motoboy com login, convite e acesso por Supabase Auth
- 39 - fila mostra rotas Maps e Waze com escape de dados de clientes
- 40 - painel motoboy oferece convite seguro e link de login com botões de compartilhar
- 46 - Painel Premium permite vincular pedido pelo botão e acompanhar mudanças automaticamente
- 58 - admin mostra e-mail cadastrado por loja, com escape de HTML e RPC autorizada
- 62 - admin controla solicitações com status existentes e histórico protegido
- 67 - compartilhamento usa dispositivo nativo, cópia e alternativa em desktop
- 70 - categorias são separadas por loja e aparecem fechadas
- 71 - carrinho calcula quantidade, taxa de entrega e resumo WhatsApp
- 74 - HTML tem controle de categorias, carrinho e informações da loja
- 76 - CARDÁPIO reutiliza o mesmo endereço público e exibe prévia real do layout existente
- 77 - PDV estilo Godzilla tem busca, categoria, grade de produtos e caixa lado a lado
- 78 - busca de PDV e categorias filtram com estoque sem misturar produto
- 79 - Mais vendidos ficam em acesso rápido no PDV e respeitam estoque, destaque e filtros
- 80 - caixa oferece Dinheiro, Cartão e Pix com botoes lado a lado e mantém crédito/débito no banco
- 81 - checkout permanece no RPC seguro de BipStart, sem pagamentos automáticos
- 82 - PDV e lateral mantêm links de cardápio apenas onde permitido, sem tela de escolhas
- 83 - frontend compila e checkout coleta nome, telefone e endereço de entrega
- 85 - dashboard apresenta dados e controles de pagamento; escapa nome/endereço contra XSS
- 86 - cards de pedidos exibem número, dados, pagamento/total, cliente e ações nessa ordem
- 89 - pagamentos não são marcados como pagos automaticamente nem baixam estoque
- 90 - situação do pedido avança por etapas e apresenta a próxima ação
- 93 - cliente só autoriza avisos ao clicar para enviar pedido no WhatsApp; sem checkbox
- 94 - loja pode interromper notificações para respeitar a solicitação do cliente
- 96 - Básico e Premium podem finalizar o pedido pela loja mesmo sem conclusão do motoboy
- 101 - acesso Básico preserva bloqueios e upgrade sem tela de escolha inicial
- 103 - Admin só libera teste Premium enquanto prazo gratuito original estiver ativo
- 107 - Admin mostra próximo vencimento, contador e ação +30 com confirmação de pagamento
- 108 - telefone do motoboy vira login seguro; conta antiga por e-mail continua funcionando
- 109 - lojista define senha com confirmação e nunca salva a senha no banco da loja
- 116 - exportação usa tamanhos de página térmica ou A4 e abre o diálogo de impressão
- 117 - cardápio compacto é único modelo, sem prévia ou seletor clássico
- 119 - categorias com imagens originais e Todos fixo acessam todos os produtos
- 121 - configurações de loja, mensagem de WhatsApp e registro de pedido estão preservados
- 122 - loja Premium continua com personalização de cor e slogan sob o nome
- 124 - COR DO SITE sincroniza painel e cardápio e não oferece outra cor no cardápio
- 128 - cadastro mantém o mesmo shop_id e a mesma base em mudanças de plano
- 130 - mudança de plano exibe botão de solicitação e mantém personalização Premium no mesmo painel
- 131 - sidebar mantém engrenagem de configurações e botão Sair no rodapé
- 133 - sidebar marca PDV ativo, usa logo da loja Premium e protege opções do Básico
- 135 - Produtos incorpora estoque e Pedidos online não promete pedidos automáticos
- 140 - configurações não mostram quadro redundante nem botões de abrir cardápio
- 142 - homepage destaca mercados e mantém Básico e Premium
- 144 - link Planos centraliza o título logo abaixo do cabeçalho fixo
- 146 - FAQ Premium, solicitações gratuitas e pagamentos refletem a oferta comercial
- 147 - botões de escolher plano têm o mesmo estilo e rótulos proporcionais
- 148 - celular oferece link direto Entrar para a área autenticada mesmo sem menu desktop
- 149 - planos ficam compactos em notebooks e empilhados com legibilidade no celular
- 150 - Modelos apresenta três mini cards ilustrados para cada sistema, sem prévias grandes
- 151 - mini cards são apenas ilustrativos e não expõem dados reais de pedidos
- 152 - nomes dos mini cards e dos dois modelos estão mais destacados no desktop e celular
- 153 - seção Modelos ocupa menos altura no notebook mantendo os seis exemplos
- 154 - todos os scripts são válidos e utilizam versões atualizadas
- 155 - COR DO SITE é editável apenas para Premium, e atualiza a única cor da loja
- 156 - painel, PDV, pedidos e cardápio usam a cor da loja
- 163 - checkout oferece link copiável e mantém confirmação manual pelo WhatsApp
- 164 - homepage comercial divulga só dois planos e não agenda
- 169 - preços apresentados são Básico R$ 29,90 e Premium R$ 79,90
- 170 - as funções compõem JavaScript válido e os arquivos usam versão nova
- 190 - o visual do cardápio tem título central sem banner, categorias, produtos e carrinho
- 191 - cada vitrine consulta o cardápio da própria loja no Supabase
- 197 - vitrine pública sem botão de menu e sem botão Gerenciar cardápio
- 200 - cardápio online oferece somente formas de pagamento configuradas, sem A combinar
- 210 - template está livre de chaves privadas no navegador e mantém consentimento explícito

## Condição de saída

Não considerar 69 falhas como 69 bugs. Não considerar falhas de negócio como testes obsoletos sem validar. Sem integração em `main` nem publicação antes de testes críticos aprovados.
