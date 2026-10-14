# Redesign do cardápio digital BipStart

## Referência e direção visual
Adaptar o modelo de referência fornecido pelo proprietário: visual sofisticado, **fundo preto/grafite e detalhes roxos/lilases neon**, glow discreto, cartões arredondados e excelente usabilidade mobile. **Não reproduzir a marca Alysson Tech**; identidade visual deve ser da BipStart.

## Cardápio público
- Capa com marca **BipStart**; nos planos **Personalizado e Pro** permitir que o lojista faça upload e exiba seu próprio logo. No Básico, a marca BipStart é obrigatória.
- Nome da loja, mensagem de boas-vindas, capa opcional baseada nas imagens reais cadastradas.
- Categorias do estabelecimento separadas por accordions. **Os produtos ficam recolhidos até o visitante clicar na categoria**; ao abrir, mostrar fotos, descrições e preços.
- Cabeçalho com quatro informações configuráveis: **horário de atendimento, localização, formas de pagamento e taxa de entrega**.
- Carrinho na parte superior direita, indicador de quantidade, e barra de pedido no rodapé em mobile.
- Carrinho com incrementar/reduzir/remover itens e total com taxa de entrega quando aplicável; escolher retirada/entrega, informar endereço quando entrega; concluir enviando resumo do pedido pelo **WhatsApp cadastrado da loja**. A BipStart não processa cobranças dos pedidos.
- Layout fluido, acessível (botões, labels, foco, mobile), escapando todos os dados de usuário, sem cores/HTML injetados.
- Compartilhamento continua **CARDÁPIO (NOME DA LOJA)** com link único por loja.

## Painel do lojista: Meu cardápio
- Mesmo tema preto e roxo.
- Criar e administrar **categorias** próprias por loja.
- Cadastrar/editar produtos em categorias com **nome, descrição, preço e foto**; excluir campo de estoque e custo **apenas da interface de cardápio**. No PDV, manter os dois campos e a regra de estoque.
- Nas Configurações, definir horários, localização/endereço, formas de pagamento aceitas e taxa de entrega.
- Logo próprio mediante upload somente se o **plano efetivo** for Personalizado ou Pro e o acesso estiver vigente; checagem também no Supabase, nunca apenas no navegador.
- Preservar separação entre lojas por owner/loja e RLS.

## Segurança e publicação
- Todas as alterações no GitHub devem ficar apenas na branch `feature/whatsapp-planos-manual-20261013`; não mesclar na `main` nem modificar o repositório Salgatti.
- Migração SQL versionada, aditiva e com políticas RLS para categorias.
- RPC pública retorna somente itens ativos e loja com plano vigente; não revela e-mail do proprietário ou segredos.
- Segurança da logo: upload limitado à pasta UUID da própria loja e ativação condicionada ao plano.
- Criar testes automatizados de categorias, carrinho, divisão de dados entre lojas e privilégios dos planos.
- Validar primeiro na Northflank **bipstart-homologacao**; nunca implantar a migração do Supabase compartilhado ou mesclar na produção sem revisão.
