import test from 'node:test';
import assert from 'node:assert/strict';
import {Script, runInNewContext} from 'node:vm';
import worker from '../dist/worker.js';

const make = (path, init) => new Request('https://scanstoon.example' + path, init);
const json = async response => JSON.parse(await response.text());

test('health responds without credentials or D1', async () => {
  const response = await worker.fetch(make('/api/health'), {});
  assert.equal(response.status, 200);
  const result = await json(response);
  assert.equal(result.success, true);
  assert.equal(result.data.status, 'ok');
  assert.equal(result.data.version, '0.5.0');
});

test('static Mini App is served with restrictive CSP', async () => {
  const response = await worker.fetch(make('/'), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(await response.text(), /Scanstoon/i);
});

test('video-inspired Scanstoon mobile interface is valid and original', async () => {
  const response = await worker.fetch(make('/'), {});
  const html = await response.text();
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'inline client app exists');
  assert.doesNotThrow(() => new Script(match[1]), 'client script parses');
  for (const feature of ['Aktivitas', 'Filter katalog', 'genre-select', 'status-select', 'data-view="list"', 'data-theme-toggle', 'data-export-backup', 'reader-progress']) {
    assert.ok(html.includes(feature), 'missing UI: ' + feature);
  }
  assert.doesNotMatch(html, /ЯМИКО|YAMIKO/i, 'third-party brand should not appear');
});


test('Scanstoon profile sheet renders actual counters, menu cards and themes', async () => {
  const response = await worker.fetch(make('/'), {});
  const html = await response.text();
  assert.match(html, /profile-screen/);
  assert.match(html, /p-grid-card/);
  assert.match(html, /p-theme-choice/);
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inline, 'client JavaScript exists');
  assert.doesNotThrow(() => new Script(inline), 'JavaScript is valid');
  const elements = new Map(['content','bottomnav','sidenav','avatar-letter','toast','reader-progress'].map(id => [id, {innerHTML:'',style:{},textContent:'',classList:{add(){},remove(){}}}]));
  const listeners = new Map();
  const stored = new Map();
  const headerColors=[];
  const hashListeners=[];
  const document = {
    documentElement: {dataset:{}},
    body: {classList:{toggle() {}}},
    getElementById(id){return elements.get(id)||null;},
    addEventListener(type,listener){const list=listeners.get(type)||[];list.push(listener);listeners.set(type,list);}
  };
  const window = {
    Telegram:{WebApp:{initData:'',initDataUnsafe:{user:{first_name:'<img src=x onerror=alert(1)>',username:'reader'}},ready(){},expand(){},setHeaderColor(c){headerColors.push(c)},setBackgroundColor(){},setBottomBarColor(){}}},
    matchMedia(){return {matches:false,addEventListener(){}};},
    addEventListener(event,listener){if(event==='hashchange')hashListeners.push(listener)},
    scrollTo(){}
  };
  const location={hash:'#/profile'};
  const fetch=async url => ({
    ok:true,
    async json(){return {success:true,data:url.startsWith('/api/comics')?[]:{popular:[],latest:[]}};}
  });
  const globals={document,window,location,fetch,URL,Blob,console,Date,Promise,
    navigator:{},
    localStorage:{getItem(key){return stored.get(key)||null;},setItem(key,val){stored.set(key,val);}},
    clearTimeout(){},setTimeout(){return 1;},requestAnimationFrame(callback){callback();},innerHeight:800,scrollY:0
  };
  runInNewContext(inline,globals,{timeout:2000});
  await new Promise(resolve => setImmediate(resolve));
  let content=elements.get('content').innerHTML;
  assert.match(content, /class="profile-screen"/);
  assert.match(content, /Penjelajah cerita/);
  assert.match(content, /0 \/ 10/);
  assert.match(content, /Katalog/);
  assert.match(content, /Notifikasi/);
  assert.match(content, /Cadangkan data/);
  assert.match(content, /data-theme-choice="system"/);
  assert.match(content, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(content, /<img src=x/);
  const click=listeners.get('click')[0];
  click({target:{closest(){return {dataset:{profileAction:'identity'}};}}});
  content=elements.get('content').innerHTML;
  assert.match(content, /Identitas pembaca/);
  click({target:{closest(){return {dataset:{themeChoice:'light'}};}}});
  assert.equal(document.documentElement.dataset.theme,'light');
  assert.equal(JSON.parse(stored.get('scanstoon_preferences')).theme,'light');
  assert.ok(headerColors.includes('#e8eaf1'), 'Telegram header changes with light theme');
  click({target:{closest(){return {dataset:{profileAction:'history'}};}}});
  assert.equal(location.hash,'#/library');
  location.hash='#/profile';
  hashListeners[0]();
  click({target:{closest(){return {dataset:{profileAction:'achievements'}};}}});
  content=elements.get('content').innerHTML;
  assert.match(content, /PENCAPAIAN MEMBACA/);
  assert.match(content, /Langkah Pertama/);
  assert.match(content, /0 dari 6 tercapai/);
  click({target:{closest(){return {dataset:{profileAction:'favorites'}};}}});
  assert.equal(location.hash,'#/library');
  hashListeners[0]();
  assert.match(elements.get('content').innerHTML, /id="saved-titles"/);
});

test('Telegram webhook rejects unauthenticated requests', async () => {
  const response = await worker.fetch(make('/telegram/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret' },
    body: JSON.stringify({channel_post: {chat: {id: -1001}, text: '#comic|test|test|original|test'}})
  }), {TELEGRAM_TOKEN_BOT:'test-token', TELEGRAM_WEBHOOK_SECRET:'expected-secret'});
  assert.equal(response.status, 403);
  assert.equal((await json(response)).error.code, 'FORBIDDEN');
});

test('chapter images require verified Telegram initData', async () => {
  const response = await worker.fetch(make('/api/storage/comics/original-title/chapters/1/pages'), {
    TELEGRAM_TOKEN_BOT:'test-token', MEDIA_SIGNING_SECRET:'not-a-real-secret',
    DB: { prepare() { throw new Error('No DB access should occur before auth'); } }
  });
  assert.equal(response.status, 401);
  assert.equal((await json(response)).error.code, 'UNAUTHORIZED');
});

test('unsigned media requests are rejected before database access', async () => {
  const response = await worker.fetch(make('/api/storage/media/test-id'), {
    TELEGRAM_TOKEN_BOT:'test-token', MEDIA_SIGNING_SECRET:'not-a-real-secret',
    DB: { prepare() { throw new Error('Unsigned requests must never query D1'); } }
  });
  assert.equal(response.status, 403);
  assert.equal((await json(response)).error.code, 'FORBIDDEN');
});

test('setup status returns non-sensitive data only', async () => {
  const env = {
    TELEGRAM_TOKEN_BOT: 'private-test-token',
    TELEGRAM_WEBHOOK_SECRET: 'private-test-webhook-secret',
    MEDIA_SIGNING_SECRET: 'private-test-signing-secret',
    DB: {
      prepare(query) {
        return {async first() {
          return query.includes('telegram_menu_setup')
            ? {status:'ok', error_code:''}
            : {status:'ok', channel_status:'admin', error_code:'', updated_at:'2026-10-28'};
        }};
      }
    }
  };
  const response = await worker.fetch(make('/api/telegram/status'), env);
  assert.equal(response.status, 200);
  const body = await response.text();
  const parsed = JSON.parse(body);
  assert.equal(parsed.data.webhook, 'ok');
  assert.equal(parsed.data.channel, 'admin');
  assert.equal(parsed.data.menu, 'ok');
  for(const secret of [env.TELEGRAM_TOKEN_BOT, env.TELEGRAM_WEBHOOK_SECRET, env.MEDIA_SIGNING_SECRET]) {
    assert.equal(body.includes(secret), false);
  }
});

test('static paths reject POST without routing to Telegram', async () => {
  const response = await worker.fetch(make('/unknown', {method:'POST'}), {});
  assert.equal(response.status, 405);
});
