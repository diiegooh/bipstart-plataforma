# BipStart — Você imagina. Nós desenvolvemos.

Projeto exclusivo para a landing page da BipStart, com o visual roxo/preto baseado na logo original.

## Estado atual: demonstração (não é sistema de produção)
O site apresenta os três planos:
- Básico: R$ 29,99, pagamento único, escolha de UM modelo (PDV/estoque, agenda ou cardápio online);
- Personalizado: R$ 49,99, pagamento único, modelo do plano básico + solicitação de personalização;
- Pro: R$ 99,90 por mês, personalização + demonstração da área de motoboys e suporte mensal.

As telas interativas são uma **demonstração que guarda dados no navegador**. Não existe checkout real, controle de assinaturas, cadastro individual seguro de clientes, publicação de cardápios de clientes ou autenticação de motoboys. Não é adequado aceitar pagamentos ou prometer liberação automática até concluir essas integrações. O selo de teste grátis de 7 dias não representa um teste de conta real.

## Executar
Requer Node.js 18+.

```bash
npm start
```

Acesse http://localhost:3000 e http://localhost:3000/health.

## Northflank
1. Crie um **serviço separado** dos projetos Godzilla Adega e Salgatti.
2. Conecte `diiegooh/bipstart-plataforma` na branch `main`.
3. Use Dockerfile na raiz como método de build e habilite Continuous Deployment.
4. Exponha a porta HTTP 3000 e verifique `/health`.
5. Depois de conferir a URL do Northflank, adicione o domínio `bipstart.shop` em *Domains* e copie exatamente os registros de validação/DNS que o Northflank solicitar.
6. Vincule o domínio ao serviço/porta e aguarde HTTPS. Não altere o DNS antes de obter os valores oficiais.

## Próxima etapa: vendas reais
**Arquitetura de pagamentos definida:** Mercado Pago será utilizado exclusivamente para cobranças dos planos da própria BipStart (Básico, Personalizado e Pro), com confirmação server-side, webhook validado e idempotência. Não conectar contas Mercado Pago de lojistas e não receber/processar valores das vendas dos estabelecimentos. Pedidos no cardápio seguem para o WhatsApp comercial de cada loja, onde o lojista negocia e recebe diretamente o pagamento. O PDV pode registrar pagamentos recebidos por fora, sem processar Pix/cartões. Próximos passos: integrar checkout central da BipStart e ativação dos planos após pagamento confirmado; concluir controle de assinaturas e suporte.

**Atenção:** atualmente não há checkout real de planos; nenhuma cobrança automática ou ativação por pagamento deve ser anunciada como funcional até a integração ser implementada e testada.

## Proteção da avaliação gratuita
- É necessário confirmar o e-mail no Supabase Auth antes de criar a loja.
- A avaliação de 7 dias começa na primeira criação da loja; não é reiniciada no login.
- O banco já possui índice único `bipstart_one_shop_per_owner` em `shops(owner_id)`, impedindo uma segunda loja na mesma conta.
- As políticas RLS não permitem que o lojista exclua a loja nem altere diretamente `shop_entitlements` para reiniciar a avaliação.
- **Limitação:** contas com e-mails diferentes podem pertencer à mesma pessoa. Confirmação de e-mail não prova identidade. Antes de lançar publicamente, configurar CAPTCHA e controles de abuso/rate limits no Supabase Auth, sem bloquear arbitrariamente famílias ou empresas distintas.
