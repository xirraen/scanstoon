import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import worker from '../dist/worker.js';

function comic(){return {id:'test',slug:'neon-reverie',title:'Neon Reverie',subtitle:'Original demo',type:'manhwa',status:'ongoing',score:99,art_code:2,genres:['fantasy'],updated_at:'2026-11-01 00:00:00'};}

async function run({scenario='pending',cache=false}={}){
 const response=await worker.fetch(new Request('https://scanstoon.example/'),{});
 const html=await response.text();
 const match=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(match,'Inline Scanstoon app exists');
 const nodes=new Map(['content','bottomnav','sidenav','avatar-letter','toast','reader-progress'].map(id=>[id,{innerHTML:'',textContent:'',style:{},classList:{toggle(){},add(){},remove(){}}}]));
 const stored=new Map();
 if(cache)stored.set('scanstoon_public_catalog_v1',JSON.stringify({savedAt:Date.now(),items:[comic()]}));
 const timers=[];
 const doc={documentElement:{dataset:{},scrollHeight:1000},body:{classList:{toggle(){}}},
  getElementById(id){return nodes.get(id)||null;},addEventListener(){}};
 const win={Telegram:{WebApp:{initData:'',initDataUnsafe:{},platform:'android',colorScheme:'dark',ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){}}},
  matchMedia(){return {matches:true,addEventListener(){}}},addEventListener(){},scrollTo(){}};
 const requests=[];
 const get=async url=>{
  requests.push(String(url));
  if(scenario==='pending')return new Promise(()=>{});
  if(scenario==='failure')throw Error('network unavailable');
  return {ok:true,json:async()=>({success:true,data:[comic()]})};
 };
 const env={document:doc,window:win,location:{hash:'#/home'},navigator:{},fetch:get,
  URL,Blob,Promise,Date,console,innerHeight:800,scrollY:0,
  localStorage:{getItem(k){return stored.get(k)||null;},setItem(k,v){stored.set(k,v);}},
  setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},
  clearTimeout(){},requestAnimationFrame(fn){fn();}
 };
 runInNewContext(match[1],env,{timeout:2000});
 return {doc,nodes,stored,requests,timers};
}
const textOf=s=>s.nodes.get('content').innerHTML;

test('Never-resolving API cannot block Scanstoon homepage or navigation',async()=>{
 const a=await run({scenario:'pending'});
 assert.match(textOf(a),/Setiap panel/);
 assert.match(textOf(a),/Katalog belum tersedia/);
 assert.match(textOf(a),/Menghubungkan ke katalog/);
 assert.doesNotMatch(textOf(a),/Menyiapkan dunia ceritamu/);
 assert.match(a.nodes.get('bottomnav').innerHTML,/Akun/);
 assert.equal(a.requests.length,1);
 assert.equal(a.requests[0],'/api/comics?limit=48');
 assert.ok(a.timers.some(x=>x.ms===5500),'startup has finite timeout');
 a.timers.find(x=>x.ms===5500).fn();
 assert.match(textOf(a),/Coba lagi/);
 assert.match(textOf(a),/Koneksi katalog lambat/);
 assert.match(a.nodes.get('bottomnav').innerHTML,/Pustaka/);
});

test('Cached comic is rendered before API resolves and stays usable when network fails',async()=>{
 const a=await run({scenario:'failure',cache:true});
 assert.match(textOf(a),/Neon Reverie/);
 assert.match(textOf(a),/Setiap panel/);
 for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.match(textOf(a),/Menampilkan katalog tersimpan/);
 assert.match(textOf(a),/Neon Reverie/);
 assert.match(textOf(a),/Coba lagi/);
});

test('Single successful response renders catalog and stores public cache only',async()=>{
 const a=await run({scenario:'success'});
 for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.requests.length,1);
 assert.match(textOf(a),/Neon Reverie/);
 assert.doesNotMatch(textOf(a),/Katalog belum tersedia/);
 assert.equal(JSON.parse(a.stored.get('scanstoon_public_catalog_v1')).items[0].slug,'neon-reverie');
 assert.match(a.nodes.get('bottomnav').innerHTML,/Beranda/);
});
