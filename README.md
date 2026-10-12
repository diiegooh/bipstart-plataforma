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
Criar projeto Supabase dedicado com usuários, empresas, isolamento (RLS), tabelas e storage de imagens; conectar Mercado Pago com verificação de pagamento e webhook idempotente; provisionar uma conta/loja por cliente e implementar a assinatura do Plano 3, formulários de personalização e suporte real.
