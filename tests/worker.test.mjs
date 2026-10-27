import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/worker.js';

const make = (path, init) => new Request('https://scanstoon.example' + path, init);
const json = async response => JSON.parse(await response.text());

test('health responds without credentials or D1', async () => {
  const response = await worker.fetch(make('/api/health'), {});
  assert.equal(response.status, 200);
  const result = await json(response);
  assert.equal(result.success, true);
  assert.equal(result.data.status, 'ok');
});

test('static Mini App is served with restrictive CSP', async () => {
  const response = await worker.fetch(make('/'), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(await response.text(), /Scanstoon/i);
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
