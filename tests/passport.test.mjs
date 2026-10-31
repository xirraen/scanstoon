import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../dist/worker.js';

const endpoint='https://scanstoon.example';
function signInit(token,userId){
  const fields={auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:userId,first_name:'Reader'})};
  const check=Object.keys(fields).sort().map(key=>key+'='+fields[key]).join('\n');
  const key=createHmac('sha256','WebAppData').update(token).digest();
  const hash=createHmac('sha256',key).update(check).digest('hex');
  return new URLSearchParams({...fields,hash}).toString();
}
function makeDb(){
  const state={orders:new Map(),entitlements:new Map(),users:new Map()};
  function query(sql,bind){
    if(sql.startsWith('INSERT INTO users'))return {meta:{changes:1}};
    if(sql.startsWith('SELECT id,granted_at FROM passport_entitlements'))return state.entitlements.get(bind[0])||null;
    if(sql.startsWith('SELECT id FROM passport_entitlements'))return state.entitlements.get(bind[0])||null;
    if(sql.startsWith('SELECT COALESCE(SUM(stars_amount)'))return {amount:[...state.orders.values()].filter(o=>o.user_id===bind[0]&&o.status==='paid').reduce((sum,o)=>sum+o.stars_amount,0)};
    if(sql.startsWith('INSERT INTO passport_orders')){
      state.orders.set(bind[0],{id:bind[0],user_id:bind[1],stars_amount:bind[2],status:'pending',created_at:new Date().toISOString().slice(0,19).replace('T',' ')});return {meta:{changes:1}};
    }
    if(sql.startsWith('SELECT id,user_id,stars_amount,status,created_at FROM passport_orders'))return state.orders.get(bind[0])||null;
    if(sql.startsWith('SELECT id,user_id,status,stars_amount,telegram_payment_charge_id FROM passport_orders'))return state.orders.get(bind[0])||null;
    if(sql.startsWith('UPDATE passport_orders')){
      const order=state.orders.get(bind[1]);
      if(order&&order.user_id===bind[2]&&order.status==='pending'&&order.stars_amount===bind[3]){
        if([...state.orders.values()].some(o=>o.telegram_payment_charge_id===bind[0]))throw Error('duplicate charge');
        order.status='paid';order.telegram_payment_charge_id=bind[0];return {meta:{changes:1}};
      }
      return {meta:{changes:0}};
    }
    if(sql.startsWith('INSERT OR IGNORE INTO passport_entitlements')){
      const order=state.orders.get(bind[1]);
      if(order&&order.status==='paid'&&order.telegram_payment_charge_id===bind[2]&&!state.entitlements.has(order.user_id)){
        state.entitlements.set(order.user_id,{id:bind[0],granted_at:'2026-10-31 00:00:00'});return {meta:{changes:1}};
      }
      return {meta:{changes:0}};
    }
    throw new Error('Unhandled SQL '+sql);
  }
  return {
    state,
    prepare(sql){
      return {
        bind(...bind){return {first:async()=>query(sql,bind),run:async()=>query(sql,bind),_sql:sql,_bind:bind};}
      };
    },
    async batch(commands){return commands.map(command=>query(command._sql,command._bind));}
  };
}

test('Passport Stars payment requires signed Telegram user, verified receipt and one-time entitlement', async () => {
  const botToken='test-bot-token', webhookSecret='topsecret',db=makeDb();
  const env={TELEGRAM_BOT_TOKEN:botToken,TELEGRAM_WEBHOOK_SECRET:webhookSecret,DB:db,PASSPORT_SALES_ENABLED:'true',PASSPORT_STARS_PRICE:'250'};
  const signed=signInit(botToken,12345);
  const actions=[];
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async (url,opts)=>{
    const name=String(url).split('/').pop();
    const payload=JSON.parse(opts.body);
    actions.push({name,payload});
    return {ok:true,json:async()=>({ok:true,result:name==='createInvoiceLink'?'https://t.me/$scanstoon-unit-test':true})};
  };
  try{
    const get=(path,init={})=>worker.fetch(new Request(endpoint+path,{...init,headers:{...init.headers,'X-Telegram-Init-Data':signed}}),env);
    const initial=await get('/api/passport');
    assert.equal(initial.status,200);
    const initialData=(await initial.json()).data;
    assert.equal(initialData.premium,false);
    assert.equal(initialData.stars_spent,0);
    assert.equal(initialData.price_stars,250);
    assert.equal(initialData.sales_enabled,true);

    const anonymous=await worker.fetch(new Request(endpoint+'/api/passport/invoice',{method:'POST'}),env);
    assert.equal(anonymous.status,401);
    const invoice=await get('/api/passport/invoice',{method:'POST'});
    assert.equal(invoice.status,200);
    const invoiceData=(await invoice.json()).data;
    assert.equal(invoiceData.price_stars,250);
    assert.equal(actions[0].name,'createInvoiceLink');
    assert.equal(actions[0].payload.currency,'XTR');
    assert.equal(actions[0].payload.prices[0].amount,250);
    const payload=actions[0].payload.payload;

    const update=async obj=>worker.fetch(new Request(endpoint+'/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':webhookSecret,'Content-Type':'application/json'},body:JSON.stringify(obj)}),env);

    const unauthWebhook=await worker.fetch(new Request(endpoint+'/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'bad','Content-Type':'application/json'},body:JSON.stringify({message:{from:{id:12345},successful_payment:{currency:'XTR',total_amount:250,invoice_payload:payload,telegram_payment_charge_id:'evil'}}})}),env);
    assert.equal(unauthWebhook.status,403);
    assert.equal((await (await get('/api/passport')).json()).data.premium,false);

    const wrong=await update({pre_checkout_query:{id:'q1',from:{id:12345},currency:'XTR',total_amount:251,invoice_payload:payload}});
    assert.equal((await wrong.json()).data.approved,false);
    assert.equal(actions.at(-1).payload.ok,false);
    const allowed=await update({pre_checkout_query:{id:'q2',from:{id:12345},currency:'XTR',total_amount:250,invoice_payload:payload}});
    assert.equal((await allowed.json()).data.approved,true);
    assert.equal(actions.at(-1).payload.ok,true);
    // Precheckout alone must never award Premium.
    assert.equal((await (await get('/api/passport')).json()).data.premium,false);

    const stranger=await update({message:{from:{id:99999},successful_payment:{currency:'XTR',total_amount:250,invoice_payload:payload,telegram_payment_charge_id:'fake-charge'}}});
    assert.equal((await stranger.json()).data.ignored,true);
    assert.equal((await (await get('/api/passport')).json()).data.premium,false);

    const paid={message:{from:{id:12345},successful_payment:{currency:'XTR',total_amount:250,invoice_payload:payload,telegram_payment_charge_id:'charge-123'}}};
    const payment=await update(paid);
    assert.equal((await payment.json()).data.fulfilled,true);
    const premium=(await (await get('/api/passport')).json()).data;
    assert.equal(premium.premium,true);
    assert.equal(premium.stars_spent,250);
    assert.match(premium.passport_id,/^TOON-TG_12345$/);
    const duplicate=await update(paid);
    assert.equal((await duplicate.json()).data.duplicate,true);
    assert.equal((await (await get('/api/passport')).json()).data.stars_spent,250);
    assert.equal((await get('/api/passport/invoice',{method:'POST'})).status,409);
  }finally{globalThis.fetch=oldFetch;}
});

test('Passport requires explicit sales activation and does not accept falsified account identity',async()=>{
  const token='test-bot-token';
  const env={TELEGRAM_BOT_TOKEN:token,DB:makeDb()};
  const signed=signInit(token,123);
  const response=await worker.fetch(new Request(endpoint+'/api/passport/invoice',{method:'POST',headers:{'X-Telegram-Init-Data':signed}}),env);
  assert.equal(response.status,503);
  assert.equal((await response.json()).error.code,'SALES_NOT_READY');
});
