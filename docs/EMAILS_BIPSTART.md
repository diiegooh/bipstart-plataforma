# E-mails de autenticação da BipStart

Status atual: **modelos prontos no GitHub, ainda NÃO ativos no Supabase**. Não troque SMTP nem templates sem validar o domínio remetente.

## Identidade
- Remetente sugerido: `BipStart <nao-responda@bipstart.shop>` — só após verificar o domínio de envio.
- Assunto de confirmação: `BipStart | Confirme seu endereço de e-mail`
- Assunto de recuperação: `BipStart | Recupere o acesso à sua conta`
- Modelo de confirmação: `emails/confirmar-cadastro.html`
- Modelo de recuperação: `emails/recuperar-senha.html`
- Token de confirmação: variável `{{ .ConfirmationURL }}` preservada nos botões e links.

## ATENÇÃO: projeto Supabase compartilhado
A BipStart está usando temporariamente o Supabase da Salgatti (`gjeyespoeqmjmskrkizx`). Configurações de SMTP, remetente, templates e URL padrão de autenticação são **globais por projeto** e também impactam a Salgatti.
Não mude `Site URL` do projeto para o domínio BipStart sem antes avaliar redirecionamentos da Salgatti.

## Para concluir a configuração (precisa acesso aos painéis)
1. Registrar `bipstart.shop` no Resend (Domains) e configurar os registros DNS exatos informados pelo Resend no painel GoDaddy. Verificar o domínio. Não substituir MX, TXT/SPF ou entradas DNS existentes sem revisar, especialmente as de e-mail e Northflank.
2. No Resend, criar credencial SMTP e configurar o nome/endereço do remetente. Não inserir credenciais privadas no código nem enviá-las em conversas.
3. No Supabase (`https://supabase.com/dashboard/project/gjeyespoeqmjmskrkizx`) → Authentication → SMTP Settings: ativar SMTP personalizado com host, porta e usuário fornecidos pelo Resend, mais a senha da credencial SMTP. O Resend documenta o host `smtp.resend.com`, porta `465` (SSL) e usuário `resend`. Validar nas configurações do serviço antes de salvar.
4. Authentication → Email Templates → **Confirm sign up**: copiar o conteúdo integral de `emails/confirmar-cadastro.html`, definir assunto `BipStart | Confirme seu endereço de e-mail` e salvar.
5. Authentication → Email Templates → **Reset password**: copiar `emails/recuperar-senha.html`, assunto `BipStart | Recupere o acesso à sua conta` e salvar.
6. Authentication → URL Configuration → permitir como Redirect URL `https://p01--bipstart--fnrfyqb66946.code.run/cliente`. Após a ativação do domínio, adicionar `https://bipstart.shop/cliente`. Manter URLs de Salgatti que já existirem. O site BipStart usa `redirect_to=.../cliente`.
7. Desativar click tracking/link rewriting no serviço de e-mail para que `{{ .ConfirmationURL }}` não seja alterado; confirmar autenticação e recuperação usando uma conta de teste real.
8. Verificar também o envio de e-mails da Salgatti depois da mudança: como é o mesmo projeto, a marca e o remetente serão compartilhados.
9. Caso seja necessário **cada marca ter seu próprio e-mail**, será necessário um projeto Auth separado ou implementação deliberada de serviço de autenticação externo/SMTP multitenant (não provido pela configuração padrão do Supabase).

Referências oficiais:
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-smtp
- https://resend.com/docs/send-with-supabase-smtp

## Segurança
Usar HTML com estilos inline compatíveis com clientes de e-mail. Não anexar chaves nem URLs de autenticação reais ao repositório. Não substitua os placeholders Go Template `{{ .ConfirmationURL }}` por links estáticos; o Supabase os injeta automaticamente no envio.
