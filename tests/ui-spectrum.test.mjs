import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('Spectrum v0.3 Mini App keeps a valid inline application',()=>{
  const match=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match,'inline Mini App JavaScript must exist');
  assert.doesNotThrow(()=>new Script(match[1]),'browser code should parse');
});

test('Spectrum v0.3 includes all five accessible primary tabs',()=>{
  for(const tab of ['Beranda','Katalog','Pustaka','Aktivitas','Akun']){
    assert.ok(html.includes(tab),'Missing tab '+tab);
  }
  assert.match(html,/aria-label="Navigasi utama"/);
  assert.match(html,/data-go="explore"/);
});

test('Spectrum v0.3 includes mobile and Telegram-aware navigation',()=>{
  for(const term of [
    'Scanstoon Spectrum UI v0.3',
    '.bottomnav',
    'safe-area-inset-bottom',
    'prefers-reduced-motion',
    'tg.BackButton',
    'HapticFeedback',
    'home-welcome',
    'welcome-search',
    'cover-badge',
    'data-theme="light"'
  ]) assert.ok(html.includes(term),'Missing new UI hook: '+term);
  assert.match(html,/meta name="viewport"/);
});

test('Original covers and core existing reading flows remain intact',()=>{
  for(const term of ['SCANSTOON / ', 'reader-pages','telegramPages','scs_b_','scs_h_','scs_day_']){
    assert.ok(html.includes(term),'Missing integration: '+term);
  }
  assert.doesNotMatch(html,/ЯМИКО|YAMIKO/i);
});
