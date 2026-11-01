import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import worker from '../dist/worker.js';

async function launch(mode){
  const response=await worker.fetch(new Request('https://scanstoon.example/'),{});
  assert.equal(response.status,200);
  const html=await response.text();
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const variables={},listeners={},calls=[];
  const nodes=new Map(['content','bottomnav','sidenav','avatar-letter','toast','reader-progress'].map(id=>[id,{innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){},toggle(){}}}]));
  const events={},tg={
    initData:mode==='browser'?'':'TelegramInitDataTest',
    initDataUnsafe:{user:{first_name:'Test'}},
    platform:mode==='browser'?'unknown':mode,
    colorScheme:'dark',isFullscreen:false,safeAreaInset:{top:24,bottom:12},contentSafeAreaInset:{top:36,bottom:28},
    expand(){calls.push('expand')},ready(){calls.push('ready')},
    requestFullscreen:mode==='old'?undefined:function(){calls.push('requestFullscreen')},
    onEvent(name,handler){events[name]=handler},
    setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){}
  };
  const doc={documentElement:{dataset:{},style:{setProperty(k,v){variables[k]=v}}},body:{classList:{toggle(){}}},
    getElementById(id){return nodes.get(id)||null},
    addEventListener(type,cb){listeners[type]=cb}
  };
  const fetch=async(url)=>({ok:true,json:async()=>({success:true,data:String(url).startsWith('/api/comics')?[]:{premium:false,stars_spent:0,sales_enabled:false,price_stars:250}})});
  const localStorage={getItem(){return null},setItem(){}};
  const webapp=mode==='browser'?{...tg,platform:'unknown',initData:''}:tg;
  runInNewContext(script,{
    document:doc,window:{Telegram:{WebApp:webapp},matchMedia(){return {matches:true,addEventListener(){}}},addEventListener(){},scrollTo(){}},
    fetch,URL,Blob,Promise,Date,console,location:{hash:'#/home'},navigator:{},
    localStorage,requestAnimationFrame(callback){callback()},
    setTimeout(){return 1},clearTimeout(){},innerHeight:800,scrollY:0
  },{timeout:2000});
  return {doc,tg,events,calls,variables,nodes,listeners,html};
}

test('Fullscreen requested exactly once from both Android and iOS entry points',async()=>{
  for(const mode of ['android','ios']){
    const env=await launch(mode);
    assert.equal(env.doc.documentElement.dataset.runtime,'telegram');
    assert.equal(env.doc.documentElement.dataset.fullscreen,'off');
    assert.equal(env.calls.filter(x=>x==='requestFullscreen').length,1);
    assert.ok(env.calls.includes('ready'));
    assert.equal(env.variables['--scs-safe-top'],'36px');
    assert.equal(env.variables['--scs-safe-bottom'],'28px');
    env.tg.isFullscreen=true;
    env.events.fullscreenChanged();
    assert.equal(env.doc.documentElement.dataset.fullscreen,'on');
    env.tg.safeAreaInset.top=48;
    env.events.safeAreaChanged();
    assert.equal(env.variables['--scs-safe-top'],'48px');
    env.tg.contentSafeAreaInset.bottom=30;
    env.events.contentSafeAreaChanged();
    assert.equal(env.variables['--scs-safe-bottom'],'30px');
    env.tg.isFullscreen=false;
    env.events.fullscreenFailed({error:'UNSUPPORTED'});
    assert.equal(env.doc.documentElement.dataset.fullscreen,'off');
  }
});

test('Unsupported Telegram fullscreen does not break controls or startup',async()=>{
  const env=await launch('old');
  assert.equal(env.doc.documentElement.dataset.fullscreen,'off');
  assert.ok(env.calls.includes('ready'));
  assert.ok(!env.calls.includes('requestFullscreen'));
  const target={dataset:{immersive:'1'}};
  env.listeners.click({target:{closest(){return target}}});
  assert.match(env.nodes.get('toast').textContent,/tidak didukung/);
  assert.match(env.nodes.get('bottomnav').innerHTML,/Beranda/);
});

test('Ordinary browser never attempts Telegram fullscreen',async()=>{
  const env=await launch('browser');
  assert.equal(env.doc.documentElement.dataset.runtime,'browser');
  assert.equal(env.calls.filter(x=>x==='requestFullscreen').length,0);
  assert.match(env.html,/scs-runtime-header/);
  assert.match(env.html,/max\(66px,var\(--scs-safe-top\)/);
  assert.match(env.html,/--scs-safe-bottom/);
});

test('Bot chat Main Mini App link requests fullscreen before the webview loads',async()=>{
  const sent=[],old=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,result:true})};};
  try{
    const response=await worker.fetch(new Request('https://scanstoon.example/telegram/webhook',{
      method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':'test-secret'},
      body:JSON.stringify({message:{chat:{id:999,type:'private'},text:'/start'}})
    }),{TELEGRAM_BOT_TOKEN:'bot-token',TELEGRAM_WEBHOOK_SECRET:'test-secret'});
    assert.equal(response.status,200);
    assert.equal(sent[0].reply_markup.inline_keyboard[0][0].url,'https://t.me/ScanstoonBot?startapp&mode=fullscreen');
    assert.equal(sent[0].reply_markup.inline_keyboard[0][0].web_app,undefined);
  }finally{globalThis.fetch=old;}
});
