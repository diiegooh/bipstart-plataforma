import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';

for(const file of ['server.mjs','public/app.js','public/cliente.js','public/cardapio.js']){
  execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
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
  const files=['/','/style.css','/app.js','/cliente','/cliente.css','/cliente.js','/cardapio','/cardapio.js'];
  for(const file of files){
    const r=await fetch(root+file);
    assert.equal(r.status,200,file);
    const content=await r.text();
    assert.ok(content.length>200,file+' vazio');
    console.log('OK',file,content.length);
  }
  const cfg=await fetch(root+'/api/public-config').then(r=>r.json());
  assert.equal(cfg.enabled,false,'Não deve abrir cadastros sem Supabase.');
  assert.equal((await fetch(root+'/path-nao-existe')).status,404);
  assert.equal((await fetch(root+'/health')).status,200);
  console.log('BipStart: teste de rota e sintaxe concluído.');
}finally{server.kill('SIGTERM')}
