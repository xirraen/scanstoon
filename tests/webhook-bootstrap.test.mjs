import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/worker.js';

const canonical='https://scanstoon.ikomik-core.workers.dev/';
const webhook=canonical+'telegram/webhook';

function database(){
 const writes=[];
 let webhookStatus='ok';
 return {
  writes,
  prepare(sql){
   return {
    async first(){
     if(sql.startsWith('SELECT status FROM telegram_setup_status'))return {status:webhookStatus};
     if(sql.startsWith('SELECT status FROM telegram_menu_setup'))return {status:'ok'};
     throw Error('Unexpected read: '+sql);
    },
    bind(...args){
     const kind=sql.startsWith('INSERT INTO telegram_setup_status')?'webhook':sql.startsWith('INSERT INTO telegram_menu_setup')?'menu':null;
     if(!kind)throw Error('Unexpected write: '+sql);
     return {async run(){writes.push({kind,args});if(kind==='webhook')webhookStatus=args[0];return {meta:{changes:1}};}};
    }
   };
  }
 };
}

test('Bootstrap reconciles Stars webhook AND repairs old bot menu URL despite stored ok',async()=>{
 const db=database(),requests=[];
 let webhookSet=false,menuSet=false;
 const old=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  const method=String(url).split('/').pop();
  const body=init?.body?JSON.parse(init.body):null;
  requests.push({method,body});
  if(method==='setWebhook'){
   assert.equal(body.url,webhook);
   assert.deepEqual(body.allowed_updates,['message','channel_post','pre_checkout_query']);
   assert.equal(body.drop_pending_updates,false);
   webhookSet=true;
  }
  if(method==='setChatMenuButton'){
   assert.equal(body.menu_button.web_app.url,canonical);
   menuSet=true;
  }
  const result=method==='getMe'?{id:456,username:'ScanstoonBot'}:
   method==='getWebhookInfo'?{url:webhook,allowed_updates:webhookSet?['message','channel_post','pre_checkout_query']:['message','channel_post']}:
   method==='getChatMenuButton'?{type:'web_app',web_app:{url:menuSet?canonical:'https://old-scanstoon.example/'}}:
   method==='setWebhook'||method==='setChatMenuButton'?true:null;
  return {ok:true,json:async()=>({ok:true,result})};
 };
 try{
  const promises=[];
  worker.scheduled({cron:'* * * * *'}, {TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_WEBHOOK_SECRET:'secret-token',DB:db}, {waitUntil(p){promises.push(p);}});
  await Promise.all(promises);
  assert.equal(requests.filter(r=>r.method==='setWebhook').length,1);
  assert.equal(requests.filter(r=>r.method==='setChatMenuButton').length,1);
  assert.equal(db.writes.filter(x=>x.kind==='webhook').at(-1).args[0],'ok');
  assert.equal(db.writes.filter(x=>x.kind==='menu').at(-1).args[0],'ok');
  const order=requests.map(r=>r.method);
  assert.ok(order.indexOf('setChatMenuButton')>order.indexOf('setWebhook'),'menu only reconciled after successful webhook');
 }finally{globalThis.fetch=old;}
});

test('Bootstrap never overwrites an unrelated webhook or publishes menu after blocked status',async()=>{
 const db=database(),requests=[];
 const old=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  const method=String(url).split('/').pop();requests.push(method);
  const result=method==='getMe'?{id:456,username:'ScanstoonBot'}:
   method==='getWebhookInfo'?{url:'https://another-bot.example/telegram/webhook',allowed_updates:['message']}:
   method==='setWebhook'?true:null;
  return {ok:true,json:async()=>({ok:true,result})};
 };
 try{
  const promises=[];
  worker.scheduled({cron:'* * * * *'}, {TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_WEBHOOK_SECRET:'secret-token',DB:db}, {waitUntil(p){promises.push(p);}});
  await Promise.all(promises);
  assert.ok(!requests.includes('setWebhook'));
  assert.ok(!requests.includes('setChatMenuButton'));
  assert.equal(db.writes.filter(x=>x.kind==='webhook').at(-1).args[0],'blocked');
  assert.equal(db.writes.filter(x=>x.kind==='webhook').at(-1).args[4],'EXISTING_WEBHOOK_OTHER_URL');
  assert.equal(db.writes.filter(x=>x.kind==='menu').at(-1).args[0],'blocked');
 }finally{globalThis.fetch=old;}
});
