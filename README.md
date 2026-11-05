# Precificação Shopee

Site estático independente da aplicação BipStart. Esta branch `gh-pages` não altera a produção (`main`).

## Ativar GitHub Pages

Abra Settings > Pages no repositório, selecione `Deploy from a branch`, branch `gh-pages`, pasta `/ (root)` e clique Save. A publicação pode levar alguns minutos. Verifique a URL exibida pelo GitHub antes de divulgá-la.

## Atualizar tarifas

Altere `fees.json` nesta branch após confirmar uma mudança na Central do Vendedor, incluindo a data de vigência, fonte e tarifas. Não mude `approved` para true até revisar a tabela. A página consulta `fees.json` ao abrir, ao voltar para a aba e a cada hora; produtos salvos localmente são recalculados. A automação de monitoramento no ChatGPT NÃO grava neste repositório nem publica mudanças sozinha. Os produtos permanecem em cada navegador, não são sincronizados entre dispositivos; exporte o CSV para backup.

## Limites

Tarifas iniciais são valores de referência de 05/11/2026, baseados em terceiros que mencionam fontes oficiais, e podem ter particularidades por conta. Ajuste anúncios, tributos e frete manualmente. Este site não altera anúncios da Shopee.
