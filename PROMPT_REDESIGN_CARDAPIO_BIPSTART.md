# BipStart — Cardápio digital e planos atualizados

## Direção visual
Layout preto/grafite com roxo/lilás neon, semelhante à referência enviada pelo proprietário, mantendo a identidade original da BipStart. Interface responsiva, categorias em accordions inicialmente fechados, fotos, descrições e preços; cabeçalho com horário, localização, pagamento e entrega, carrinho e WhatsApp da loja.

## Planos
- **Básico — R$ 29,99 (pagamento único)**: PDV com estoque, histórico de vendas e cardápio online com produtos compartilhados. Marca e cor padrão da BipStart.
- **Premium — R$ 99,90/mês**: tudo do Básico, motoboys próprios com convites, ofertas e rotas, inserção de logo própria, alteração da cor do cardápio, solicitações de mudanças conforme a necessidade e suporte mensal. Mudanças sob avaliação de escopo.
- Há somente dois planos comerciais: Básico e Premium, com PDV e cardápio integrados.
- Código interno do Premium no banco: `pro`; do Básico: `basic`.

## Área da loja
A loja possui PDV e cardápio simultaneamente, ambos lendo e alterando os registros de `shop_products`. O painel Meu cardápio usa nome, categoria, descrição, valor e foto; campos de estoque/custo ficam na área Produtos e estoque. Categorias persistem em `shop_menu_categories`. Na área pública, itens só aparecem após clicar na categoria. Compartilhamento: CARDÁPIO (NOME DA LOJA).

O Premium libera logo e mudança de cor exclusivamente durante vigência do acesso. A segurança é garantida no Supabase: função `bipstart_can_customize`, gatilho `bipstart_guard_shop_logo` e função pública `bipstart_public_menu`. O Básico não pode mudar cor ou usar logo personalizada mesmo via API.

## Operação e homologação
Teste de 7 dias com confirmação de e-mail, contratação e ativação manual pelo WhatsApp. Premium ativo por 30 dias. Sem pagamentos de pedidos processados pela BipStart.

Migrações versionadas: `sql/bipstart_menu_redesign_20261014.sql`, `sql/bipstart_courier_pro_20261014.sql` e `sql/bipstart_two_plans_unified_20261014.sql`. Não alterar o repositório Salgatti ou mesclar na `main` antes de aprovar a homologação. Testar via GitHub Actions e Northflank.
