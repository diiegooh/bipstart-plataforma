import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';

for(const file of ['server.mjs','public/app.js','public/cliente.js','public/cardapio.js','public/vitrine.js']){
  execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
}
// Modelos Supabase devem conter link temporário real, sem credenciais hardcoded.
for(const template of ['emails/confirmar-cadastro.html','emails/recuperar-senha.html']){
  const body=readFileSync(template,'utf8');
  assert.ok(body.includes('{{ .ConfirmationURL }}'),template+' sem link de confirmação');
  assert.ok(body.includes('BipStart'),template+' sem identidade da marca');
  for(const image of ['/bipstart-marca-icon.png','/bipstart-marca-nome.png']){
    assert.ok(body.includes('https://p01--bipstart--fnrfyqb66946.code.run'+image),template+' sem imagem oficial '+image);
  }
  assert.ok(body.includes('<table'),template+' não contém HTML compatível com e-mail');
}
const port=33071;
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:''},stdio:'pipe'});
const root='http://127.0.0.1:'+port;
async function wait(){
  for(let i=0;i<35;i++){
    if(server.exitCode!==null)throw Error('Servidor terminou inesperadamente.');
    try{const r=await fetch(root+'/health');if(r.ok)return;}catch{}
    await new Promise(r=>setTimeout(r,150));
  }
  throw Error('Servidor BipStart não iniciou.');
}
try{
  await wait();
  const files=['/','/style.css','/app.js','/cliente','/cliente.css','/cliente.js','/bipstart-logo.svg','/cardapio','/cardapio.js','/vitrine','/vitrine.css','/vitrine.js','/motoboy','/motoboy.js','/motoboy.css'];
  for(const file of files){
    const r=await fetch(root+file);
    assert.equal(r.status,200,file);
    const content=await r.text();
    assert.ok(content.length>200,file+' vazio');
    console.log('OK',file,content.length);
  }
  // Imagens PNG reais, acessíveis sem autenticação para serem exibidas nos e-mails.
  for(const logoPath of ['/bipstart-marca-icon.png','/bipstart-marca-nome.png']){
    const response=await fetch(root+logoPath);
    assert.equal(response.status,200,logoPath);
    assert.match(response.headers.get('content-type')||'', /image\/png/,logoPath);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length>10000,logoPath+' com conteúdo insuficiente');
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',logoPath+' não é PNG válido');
    console.log('OK',logoPath,bytes.length);
  }
  // O cadastro deve exigir confirmação de senha no formulário e verificar os valores antes da API.
  const signupHtml=await fetch(root+'/cliente').then(r=>r.text());
  assert.match(signupHtml, /class="brand-logo"[^>]+src="\/bipstart-logo\.svg"/);
  const logoResponse=await fetch(root+'/bipstart-logo.svg');
  assert.match(logoResponse.headers.get('content-type')||'', /image\/svg\+xml/);
  const logoSvg=await logoResponse.text();
  assert.match(logoSvg, /<image[^>]+data:image\/png;base64/);
  assert.match(logoSvg, /<title[^>]*>BipStart<\/title>/);

  const signupJs=await fetch(root+'/cliente.js').then(r=>r.text());
  assert.match(signupHtml, /name="confirm"[^>]*required/);
  assert.ok(signupJs.includes("if(v.password!==v.confirm)throw Error"),"Cadastro deve recusar senhas diferentes.");
  assert.ok(signupJs.includes("setCustomValidity"),"Campo deve avisar o usuário sobre senhas diferentes.");
  // CAPTCHA é opcional até a Site Key ser configurada no Northflank;
  // quando ativado, cadastro, login e recuperação exigem o token.
  assert.match(signupHtml, /id="signupCaptcha"/);
  assert.match(signupHtml, /id="loginCaptcha"/);
  assert.ok(signupJs.includes("captchaFor('signup')"),'Cadastro deve exigir CAPTCHA');
  assert.ok(signupJs.includes("captchaFor('login')"),'Login e recuperação devem exigir CAPTCHA');
  assert.ok(signupJs.includes("gotrue_meta_security"),'Token de CAPTCHA deve ir ao GoTrue');
    const cfg=await fetch(root+'/api/public-config').then(r=>r.json());
  assert.equal(cfg.enabled,false,'Não deve abrir cadastros sem Supabase.');
  assert.equal((await fetch(root+'/path-nao-existe')).status,404);
  assert.equal((await fetch(root+'/health')).status,200);
  console.log('BipStart: teste de rota e sintaxe concluído.');
}finally{server.kill('SIGTERM')}
