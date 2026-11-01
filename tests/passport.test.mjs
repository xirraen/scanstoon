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
  const state={orders:new Map(),entitlements:new Map(),users:new Map(),refunds:new Map(),tickets:new Map()};
  function query(sql,bind){
    if(sql.startsWith('INSERT INTO users'))return {meta:{changes:1}};
    if(sql.startsWith('DELETE FROM passport_orders'))return {meta:{changes:0}};
    if(sql.startsWith('SELECT id,checkout_at,stars_amount FROM passport_orders'))return [...state.orders.values()].find(o=>o.user_id===bind[0]&&o.status==='pending')||null;
    if(sql.startsWith('UPDATE passport_orders SET checkout_at=CURRENT_TIMESTAMP')){
      const order=state.orders.get(bind[0]);
      if(order&&order.status==='pending'&&!order.checkout_at){order.checkout_at=new Date().toISOString();return {meta:{changes:1}};}
      return {meta:{changes:0}};
    }
    if(sql.startsWith('UPDATE passport_orders SET checkout_at=NULL')){
      const order=state.orders.get(bind[0]);if(order&&order.status==='pending')order.checkout_at=null;
      return {meta:{changes:1}};
    }
    if(sql.startsWith('SELECT telegram_payment_charge_id FROM passport_refunds')){
      const row=state.refunds.get(bind[0]);return row&&row.order_id===bind[1]?row:null;
    }
    if(sql.startsWith('INSERT OR IGNORE INTO passport_refunds')){
      const [charge,order_id,user_id,stars_amount]=bind;
      if(!state.refunds.has(charge))state.refunds.set(charge,{telegram_payment_charge_id:charge,order_id,user_id,stars_amount});
      return {meta:{changes:1}};
    }
    if(sql.startsWith('DELETE FROM passport_entitlements')){
      const [uid]=bind;
      const valid=[...state.orders.values()].some(o=>o.user_id===uid&&o.status==='paid'&&!state.refunds.has(o.telegram_payment_charge_id));
      if(!valid)state.entitlements.delete(uid);
      return {meta:{changes:1}};
    }
    if(sql.startsWith('INSERT INTO passport_support_tickets')){
      state.tickets.set(bind[0],{id:bind[0],user_id:bind[1],issue:''});return {meta:{changes:1}};
    }
    if(sql.startsWith('UPDATE passport_support_tickets')){
      const ticket=state.tickets.get(bind[1]);
      if(!ticket||ticket.user_id!==bind[2])return {meta:{changes:0}};
      ticket.issue=bind[0];return {meta:{changes:1}};
    }
    if(sql.startsWith('SELECT id,granted_at FROM passport_entitlements'))return state.entitlements.get(bind[0])||null;
    if(sql.startsWith('SELECT id FROM passport_entitlements'))return state.entitlements.get(bind[0])||null;
    if(sql.startsWith('SELECT COALESCE(SUM(o.stars_amount)'))return {amount:[...state.orders.values()].filter(o=>o.user_id===bind[0]&&o.status==='paid'&&!state.refunds.has(o.telegram_payment_charge_id)).reduce((sum,o)=>sum+o.stars_amount,0)};
    if(sql.startsWith('INSERT INTO passport_orders')){
      state.orders.set(bind[0],{id:bind[0],user_id:bind[1],stars_amount:bind[2],status:'pending',checkout_at:null,created_at:new Date().toISOString().slice(0,19).replace('T',' ')});return {meta:{changes:1}};
    }
    if(sql.startsWith('SELECT id,user_id,stars_amount,status,created_at,checkout_at FROM passport_orders'))return state.orders.get(bind[0])||null;
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
      if(order&&order.status==='paid'&&order.telegram_payment_charge_id===bind[2]&&!state.refunds.has(bind[3])&&!state.entitlements.has(order.user_id)){
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
  const env={TELEGRAM_BOT_TOKEN:botToken,TELEGRAM_WEBHOOK_SECRET:webhookSecret,DB:db,PASSPORT_SALES_ENABLED:'true',PASSPORT_STARS_PRICE:'250',PASSPORT_SUPPORT_CHAT_ID:'123456789'};
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
    assert.match(premium.passport_id,/^TOON-[0-9A-F]{14}$/);
    assert.ok(!premium.passport_id.includes('12345'), 'passport must not leak raw Telegram ID');
    const duplicate=await update(paid);
    assert.equal((await duplicate.json()).data.duplicate,true);
    assert.equal((await (await get('/api/passport')).json()).data.stars_spent,250);
    assert.equal((await get('/api/passport/invoice',{method:'POST'})).status,409);
    const refund=await update({message:{from:{id:12345},refunded_payment:{currency:'XTR',total_amount:250,invoice_payload:payload,telegram_payment_charge_id:'charge-123'}}});
    assert.equal((await refund.json()).data.refunded,true);
    const afterRefund=(await (await get('/api/passport')).json()).data;
    assert.equal(afterRefund.premium,false);
    assert.equal(afterRefund.stars_spent,0);
    const repeatedRefund=await update({message:{from:{id:12345},refunded_payment:{currency:'XTR',total_amount:250,invoice_payload:payload,telegram_payment_charge_id:'charge-123'}}});
    assert.equal((await repeatedRefund.json()).data.refunded,true);
    assert.equal((await (await get('/api/passport')).json()).data.premium,false);
    const replayedSuccess=await update(paid);
    assert.equal((await replayedSuccess.json()).data.duplicate,true);
    assert.equal((await (await get('/api/passport')).json()).data.stars_spent,0);
    const afterRefundInvoice=await get('/api/passport/invoice',{method:'POST'});
    assert.equal(afterRefundInvoice.status,200);
    const newPayload=actions.at(-1).payload.payload;
    const newInvoice=await get('/api/passport/invoice',{method:'POST'});
    assert.equal(newInvoice.status,200);
    assert.equal(actions.at(-1).payload.payload,newPayload,'reuses pending order instead of creating duplicates');
    const denied=await update({pre_checkout_query:{id:'q3',from:{id:12345},currency:'XTR',total_amount:250,invoice_payload:newPayload}});
    assert.equal((await denied.json()).data.approved,true);
    assert.equal((await get('/api/passport/invoice',{method:'POST'})).status,409);
    const secondDenied=await update({pre_checkout_query:{id:'q4',from:{id:12345},currency:'XTR',total_amount:250,invoice_payload:newPayload}});
    assert.equal((await secondDenied.json()).data.approved,false,'second checkout cannot approve same order');
    // Refund may arrive ahead of the success service message.
    const earlyRefund=await update({message:{from:{id:12345},refunded_payment:{currency:'XTR',total_amount:250,invoice_payload:newPayload,telegram_payment_charge_id:'charge-early'}}});
    assert.equal((await earlyRefund.json()).data.refunded,true);
    const latePayment=await update({message:{from:{id:12345},successful_payment:{currency:'XTR',total_amount:250,invoice_payload:newPayload,telegram_payment_charge_id:'charge-early'}}});
    assert.equal((await latePayment.json()).data.refunded,true);
    assert.equal((await (await get('/api/passport')).json()).data.premium,false);
    assert.equal((await (await get('/api/passport')).json()).data.stars_spent,0);

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

test('Private support tickets accept only owner submissions and safely acknowledge payment reports',async()=>{
 const token='test-bot-token',sec='topsecret',db=makeDb(),sent=[];
 const env={TELEGRAM_BOT_TOKEN:token,TELEGRAM_WEBHOOK_SECRET:sec,DB:db};
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
  const p=JSON.parse(opts.body);sent.push(p);
  return {ok:true,json:async()=>({ok:true,result:true})};
 };
 const send=async(message)=>worker.fetch(new Request(endpoint+'/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':sec,'Content-Type':'application/json'},body:JSON.stringify({message})}),env);
 try{
  const base={from:{id:777,first_name:'User'},chat:{id:777,type:'private'}};
  const create=await send({...base,text:'/start paysupport'});
  assert.equal(create.status,200);
  assert.equal((await create.json()).data.ticket_created,true);
  assert.equal(db.state.tickets.size,1);
  const ticket=[...db.state.tickets.keys()][0];
  assert.match(ticket,/^PS-[0-9A-F]{12}$/);
  const bad=await send({...base,from:{id:888},chat:{id:888,type:'private'},text:'/ticket '+ticket+' please help with refund'});
  assert.equal((await bad.json()).data.invalid,true);
  assert.equal(db.state.tickets.get(ticket).issue,'');
  const success=await send({...base,text:'/ticket '+ticket+' Stars payment not showing in Scanstoon'});
  assert.equal((await success.json()).data.submitted,true);
  assert.match(db.state.tickets.get(ticket).issue,/not showing/);
  assert.ok(sent.some(x=>String(x.text).includes('Laporan untuk tiket')));
 }finally{globalThis.fetch=oldFetch;}
});

test('Pre-checkout rejects all orders when sales are paused, even if invoice exists',async()=>{
 const token='test-bot-token',sec='topsecret',db=makeDb(),answer=[];
 const env={TELEGRAM_BOT_TOKEN:token,TELEGRAM_WEBHOOK_SECRET:sec,DB:db,PASSPORT_SALES_ENABLED:'true',PASSPORT_STARS_PRICE:'250',PASSPORT_SUPPORT_CHAT_ID:'12345678'};
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{const p=JSON.parse(opts.body);answer.push({method:String(url).split('/').pop(),payload:p});return {ok:true,json:async()=>({ok:true,result:String(url).endsWith('createInvoiceLink')?'https://t.me/$test':true})};};
 try{
  const signed=signInit(token,111),init={method:'POST',headers:{'X-Telegram-Init-Data':signed}};
  const inv=await worker.fetch(new Request(endpoint+'/api/passport/invoice',init),env);
  assert.equal(inv.status,200);
  const payload=answer.at(-1).payload.payload;
  env.PASSPORT_SALES_ENABLED='false';
  const res=await worker.fetch(new Request(endpoint+'/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':sec,'Content-Type':'application/json'},body:JSON.stringify({pre_checkout_query:{id:'paused',from:{id:111},currency:'XTR',total_amount:250,invoice_payload:payload}})}),env);
  assert.equal((await res.json()).data.approved,false);
  assert.equal(answer.at(-1).payload.ok,false);
  assert.equal(db.state.entitlements.size,0);
 }finally{globalThis.fetch=oldFetch;}
});
