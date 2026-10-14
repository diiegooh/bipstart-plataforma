import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {spawn} from 'node:child_process';

test('a prévia do link usa CARDÁPIO (NOME DA LOJA) sem mostrar outras lojas',async()=>{
 const names={
  'gamalperfumes-3392813':'gamalperfumes',
  'adega-especial':'Adega <Especial> & Amigos'
 };
 const backend=http.createServer(async(req,res)=>{
  if(req.method!=='POST'||req.url!=='/rest/v1/rpc/bipstart_public_menu'){
   res.writeHead(404);return res.end();
  }
  let data='';
  for await(const part of req)data+=part.toString();
  const slug=JSON.parse(data).p_slug;
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify(names[slug]?{name:names[slug],items:[]}:null));
 });
 await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
 const port=33381;
 const origin='http://127.0.0.1:'+port;
 const app=spawn(process.execPath,['server.mjs'],{
  env:{...process.env,PORT:String(port),SUPABASE_URL:'http://127.0.0.1:'+backend.address().port,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},
  stdio:'pipe'
 });
 let diagnostics='';
 app.stderr.on('data',data=>{diagnostics+=data.toString()});
 try{
  let ready=false;
  for(let i=0;i<40;i++){
   if(app.exitCode!==null)break;
   try{if((await fetch(origin+'/health')).ok){ready=true;break}}catch{}
   await new Promise(r=>setTimeout(r,120));
  }
  assert.ok(ready,'Servidor não iniciou: '+diagnostics);
  for(const [slug,name] of Object.entries(names)){
   const res=await fetch(origin+'/cardapio?loja='+slug);
   assert.equal(res.status,200);
   const html=await res.text();
   const safe=name.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
   assert.ok(html.includes('<title>CARDÁPIO ('+safe+')</title>'));
   assert.ok(html.includes('<meta property="og:title" content="CARDÁPIO ('+safe+')">'));
   assert.ok(html.includes('<meta name="twitter:title" content="CARDÁPIO ('+safe+')">'));
   assert.ok(!html.includes('Confira nosso cardápio!'));
   if(slug==='gamalperfumes-3392813')assert.ok(!html.includes('Adega &lt;Especial&gt;'));
  }
  const unknown=await fetch(origin+'/cardapio?loja=nao-existe');
  assert.equal(unknown.status,200);
  const missing=await unknown.text();
  assert.ok(missing.includes('<title>Cardápio digital • BipStart</title>'));
  assert.ok(!missing.includes('property="og:title"'));
  const invalid=await fetch(origin+'/cardapio?loja=x');
  assert.equal(invalid.status,200);
  assert.ok((await invalid.text()).includes('<title>Cardápio digital • BipStart</title>'));
 }finally{
  app.kill('SIGTERM');
  await new Promise(resolve=>backend.close(resolve));
 }
});
