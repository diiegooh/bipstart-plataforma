import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';

for(const file of ['server.mjs','public/app.js','public/cliente.js','public/cardapio.js']){
  execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
}
// Modelos Supabase devem conter link temporário real, sem credenciais hardcoded.
for(const template of ['emails/confirmar-cadastro.html','emails/recuperar-senha.html']){
  const body=readFileSync(template,'utf8');
  assert.ok(body.includes('{{ .ConfirmationURL }}'),template+' sem link de confirmação');
  assert.ok(body.includes('BipStart'),template+' sem identidade da marca');
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
  const files=['/','/style.css','/app.js','/cliente','/cliente.css','/cliente.js','/bipstart-logo.svg','/cardapio','/cardapio.js'];
  for(const file of files){
    const r=await fetch(root+file);
    assert.equal(r.status,200,file);
    const content=await r.text();
    assert.ok(content.length>200,file+' vazio');
    console.log('OK',file,content.length);
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
  const cfg=await fetch(root+'/api/public-config').then(r=>r.json());
  assert.equal(cfg.enabled,false,'Não deve abrir cadastros sem Supabase.');
  assert.equal((await fetch(root+'/path-nao-existe')).status,404);
  assert.equal((await fetch(root+'/health')).status,200);
  console.log('BipStart: teste de rota e sintaxe concluído.');
}finally{server.kill('SIGTERM')}
