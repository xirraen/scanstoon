import test from 'node:test';
import assert from 'node:assert/strict';
import {Script,runInNewContext} from 'node:vm';
import worker from '../dist/worker.js';

const base='https://scanstoon.example';
const runtime=async(route)=>{
 const r=await worker.fetch(new Request(base+route),{});
 return {response:r,html:await r.text()};
};

test('All entry URLs deliver same v0.9 app, no stale HTML or accidental alternate layout',async()=>{
 const routes=['/','/?startapp=main','/?tgWebAppStartParam=home','/app','/index.html'];
 const views=await Promise.all(routes.map(runtime));
 const expected=views[0].html;
 for(let i=0;i<views.length;i++){
  const {response,html}=views[i];
  assert.equal(response.status,200,routes[i]);
  assert.equal(html,expected,'different HTML for '+routes[i]);
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(response.headers.get('x-scanstoon-release'),'0.9.0');
 }
 assert.match(expected,/html\[data-runtime="telegram"\] \.topbar\{display:none!important\}/);
 assert.match(expected,/scs_pref_theme/);
 assert.match(expected,/loadInitialData/);
 assert.match(expected,/scanstoon_public_catalog_v1/);
 assert.doesNotMatch(expected,/Promise\.allSettled\(\[call\('\/api\/comics/);
 assert.match(expected,/data-retry-load/);
 const js=expected.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Script(js));
});

function launch(html,{mode,storagePref='light',localTheme='dark'}){
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const nodes=new Map(['content','bottomnav','sidenav','avatar-letter','toast','reader-progress'].map(id=>[id,{innerHTML:'',classList:{add(){},remove(){}},style:{},textContent:''}]));
 const appStorage=new Map([['scanstoon_preferences',JSON.stringify({theme:localTheme,view:'grid'})]]);
 const changed=[];
 const webapp={
  initData:'tg-signed-runtime-test',
  initDataUnsafe:{user:{id:456,first_name:'Pembaca'}},
  platform:mode==='main'?'android':'ios',
  colorScheme:'dark',
  ready(){},expand(){},setHeaderColor(c){changed.push(c);},setBackgroundColor(){},setBottomBarColor(){},
  CloudStorage:{
   getKeys(cb){cb(null,[])},
   getItems(keys,cb){
    const out={};for(const key of keys)if(key==='scs_pref_theme')out[key]=storagePref;
    cb(null,out);
   },
   setItem(key,val,cb){cb(null,true);}
  }
 };
 const document={
  documentElement:{dataset:{}},
  body:{classList:{toggle(){}}},
  getElementById(id){return nodes.get(id)||null},
  addEventListener(){},
 };
 const location={hash:'#/home'};
 const window={
  Telegram:{WebApp:webapp},
  matchMedia(){return {matches:false,addEventListener(){}}},
  addEventListener(){},
  scrollTo(){}
 };
 const fetch=async(path)=>{
  const data=String(path).startsWith('/api/comics')?[]:String(path).startsWith('/api/home')?{popular:[],latest:[]}:
    String(path).startsWith('/api/passport')?{premium:false,stars_spent:0,price_stars:250,sales_enabled:false}:[];
  return {ok:true,json:async()=>({success:true,data})};
 };
 const globals={document,window,location,fetch,URL,Blob,console,Date,Promise,
   navigator:{},
   localStorage:{getItem(k){return appStorage.get(k)||null},setItem(k,v){appStorage.set(k,v)}},
   clearTimeout(){},setTimeout(){return 1},requestAnimationFrame(cb){cb()},
   innerHeight:800,scrollY:0
 };
 runInNewContext(script,globals,{timeout:2000});
 return {nodes,document,changed,appStorage};
}

test('Chat button and Main Mini App use same mobile shell and Telegram-synced theme',async()=>{
 const {html}=await runtime('/');
 const main=launch(html,{mode:'main',localTheme:'dark',storagePref:'light'});
 const chat=launch(html,{mode:'chat',localTheme:'system',storagePref:'light'});
 for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));
 for(const item of [main,chat]){
  assert.equal(item.document.documentElement.dataset.runtime,'telegram');
  assert.equal(item.document.documentElement.dataset.theme,'light');
  assert.equal(JSON.parse(item.appStorage.get('scanstoon_preferences')).theme,'light');
  assert.ok(item.changed.includes('#e8eaf1'));
  assert.match(item.nodes.get('content').innerHTML,/Katalog belum tersedia/);
  assert.match(item.nodes.get('bottomnav').innerHTML,/Akun/);
  assert.doesNotMatch(item.nodes.get('content').innerHTML,/Menyiapkan dunia ceritamu/);
 }
 assert.equal(main.nodes.get('content').innerHTML,chat.nodes.get('content').innerHTML);
 assert.equal(main.nodes.get('bottomnav').innerHTML,chat.nodes.get('bottomnav').innerHTML);
});

test('Telegram /start button uses pinned canonical Worker URL',async()=>{
 const calls=[];
 const original=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
  calls.push({url:String(url),payload:JSON.parse(opts.body)});
  return {ok:true,json:async()=>({ok:true,result:true})};
 };
 try{
  const response=await worker.fetch(new Request(base+'/telegram/webhook',{
   method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':'secret'},
   body:JSON.stringify({message:{chat:{id:111},text:'/start'}})
  }),{TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_WEBHOOK_SECRET:'secret',APP_URL:'https://outdated.example/'});
  assert.equal(response.status,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].payload.reply_markup.inline_keyboard[0][0].web_app.url,
    'https://scanstoon.ikomik-core.workers.dev/');
 }finally{globalThis.fetch=original;}
});
