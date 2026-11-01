import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/worker.js';

const url='https://scanstoon.ikomik-core.workers.dev/telegram/webhook';

function database(){
 const writes=[];
 return {
  writes,
  prepare(sql){
   return {
    async first(){
     if(sql.startsWith('SELECT status FROM telegram_setup_status'))return {status:'ok'}; // previous healthy status
     if(sql.startsWith('SELECT status FROM telegram_menu_setup'))return {status:'ok'};
     throw Error('Unexpected query: '+sql);
    },
    bind(...args){
     if(!sql.startsWith('INSERT INTO telegram_setup_status'))throw Error('Unexpected write: '+sql);
     return {async run(){writes.push(args);return {meta:{changes:1}};}};
    }
   };
  }
 };
}

test('Scheduled bootstrap upgrades an already-healthy webhook to pre_checkout_query',async()=>{
 const db=database(),requests=[];
 let applied=false;
 const old=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  const method=String(url).split('/').pop();
  const body=init?.body?JSON.parse(init.body):null;
  requests.push({method,body});
  if(method==='setWebhook'){assert.equal(body.url,'https://scanstoon.ikomik-core.workers.dev/telegram/webhook');assert.deepEqual(body.allowed_updates,['message','channel_post','pre_checkout_query']);assert.equal(body.drop_pending_updates,false);applied=true;}
  const value=method==='getMe'?{id:456,username:'Sc_stoon_Test'}:
    method==='getWebhookInfo'?{url:'https://scanstoon.ikomik-core.workers.dev/telegram/webhook',allowed_updates:applied?['message','channel_post','pre_checkout_query']:['message','channel_post']}:
    method==='setWebhook'?true:null;
  return {ok:true,async json(){return {ok:true,result:value};}};
 };
 try{
  const promises=[];
  worker.scheduled({cron:'* * * * *'}, {TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_WEBHOOK_SECRET:'secret-token',DB:db}, {waitUntil(p){promises.push(p);}});
  await Promise.all(promises);
  assert.equal(requests.filter(r=>r.method==='setWebhook').length,1);
  assert.equal(db.writes.at(-1)[0],'ok');
  assert.equal(db.writes.at(-1)[4],'');
 }finally{globalThis.fetch=old;}
});

test('Bootstrap never replaces an unrelated existing webhook',async()=>{
 const db=database(),requests=[];
 const old=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  const method=String(url).split('/').pop();requests.push(method);
  const value=method==='getMe'?{id:456,username:'Sc_stoon_Test'}:
    method==='getWebhookInfo'?{url:'https://another-bot.example/telegram/webhook',allowed_updates:['message']}:
    method==='setWebhook'?true:null;
  return {ok:true,async json(){return {ok:true,result:value};}};
 };
 try{
  const promises=[];
  worker.scheduled({cron:'* * * * *'}, {TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_WEBHOOK_SECRET:'secret-token',DB:db}, {waitUntil(p){promises.push(p);}});
  await Promise.all(promises);
  assert.ok(!requests.includes('setWebhook'));
  assert.equal(db.writes.at(-1)[0],'blocked');
  assert.equal(db.writes.at(-1)[4],'EXISTING_WEBHOOK_OTHER_URL');
 }finally{globalThis.fetch=old;}
});
