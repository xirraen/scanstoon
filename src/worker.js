// Scanstoon MVP Cloudflare Worker. PAGE is generated from public/index.html by scripts/build.mjs.
const json = (data, status = 200, cache = false) => new Response(JSON.stringify(data), {status, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':cache?'public, max-age=60':'no-store','X-Content-Type-Options':'nosniff'}});
const good = (data, meta) => json({success:true,data,...(meta?{meta}:{})});
const fail = (status, code, message) => json({success:false,error:{code,message}},status);
const mapComic = (r) => r ? {...r, genres:(r.genres||'').split(',').filter(Boolean)} : null;
const textBytes = (value) => new TextEncoder().encode(value);
function secureEqual(a,b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff=0;
  for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function hmac(key, value) {
  const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',k,textBytes(value)));
}
async function telegramUser(request, env) {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  const raw=request.headers.get('X-Telegram-Init-Data')||'';
  if (!raw || raw.length>8192) return null;
  const params=new URLSearchParams(raw);
  const hash=params.get('hash');
  const authDate=Number(params.get('auth_date'));
  const now=Math.floor(Date.now()/1000);
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash) || !Number.isSafeInteger(authDate) || authDate>now+60 || now-authDate>86400) return null;
  const check=Array.from(params.entries()).filter(([k])=>k!=='hash'&&k!=='signature').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  const secret=await hmac(textBytes('WebAppData'),env.TELEGRAM_BOT_TOKEN);
  const signature=await hmac(secret,check);
  const digest=Array.from(signature).map(n=>n.toString(16).padStart(2,'0')).join('');
  if (!secureEqual(digest,hash.toLowerCase())) return null;
  let user;
  try {user=JSON.parse(params.get('user')||'null');} catch {return null;}
  if (!user || !Number.isSafeInteger(user.id) || user.id<=0) return null;
  const id='tg_'+user.id;
  await env.DB.prepare('INSERT INTO users(id,telegram_id,display_name,username) VALUES(?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username').bind(id,String(user.id),String(user.first_name||'').slice(0,128),String(user.username||'').slice(0,64)).run();
  return {id,display_name:String(user.first_name||''),username:String(user.username||'')};
}
// Digital goods in Telegram must be paid exclusively with Telegram Stars (XTR).
// Premium is an account badge + digital .toon passport. No automatic token or NFT issuance.
const PASSPORT_STARS_DEFAULT=250;
function passportPrice(env){
  const value=Number(env.PASSPORT_STARS_PRICE||PASSPORT_STARS_DEFAULT);
  return Number.isSafeInteger(value)&&value>=1&&value<=10000?value:PASSPORT_STARS_DEFAULT;
}
function passportSalesEnabled(env){return env.PASSPORT_SALES_ENABLED==='true';}
async function passportStatus(env,user){
  const [entitled,spent]=await Promise.all([
    env.DB.prepare('SELECT id,granted_at FROM passport_entitlements WHERE user_id=?').bind(user.id).first(),
    env.DB.prepare("SELECT COALESCE(SUM(stars_amount),0) AS amount FROM passport_orders WHERE user_id=? AND status='paid'").bind(user.id).first()
  ]);
  return {premium:!!entitled,passport_id:entitled?'TOON-'+user.id.toUpperCase():null,member_since:entitled?.granted_at||null,stars_spent:Math.max(0,Number(spent?.amount||0)),price_stars:passportPrice(env),sales_enabled:passportSalesEnabled(env)};
}
async function telegramBotMethod(env,method,payload){
  const res=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/'+method,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
  });
  const result=await res.json();
  if(!res.ok||!result.ok)throw new Error('Telegram Bot API '+method+' returned '+(result.error_code||res.status));
  return result.result;
}
async function passportInvoice(env,user){
  const price=passportPrice(env),orderId=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO passport_orders(id,user_id,stars_amount,status) VALUES(?,?,?,'pending')").bind(orderId,user.id,price).run();
  const link=await telegramBotMethod(env,'createInvoiceLink',{
    title:'Paspor .toon Premium',
    description:'Paspor digital dan badge Premium Scanstoon, pembayaran satu kali tanpa langganan.',
    payload:'toon:'+orderId,currency:'XTR',
    prices:[{label:'Paspor .toon Premium',amount:price}]
  });
  if(typeof link!=='string'||!/^https:\/\/t\.me\//.test(link))throw new Error('Telegram invoice link format invalid');
  return {url:link,price_stars:price,order_id:orderId};
}
function passportPayload(raw){
  const m=String(raw||'').match(/^toon:([a-f0-9-]{36})$/);
  return m?m[1]:null;
}
async function passportCheckout(env,query){
  const orderId=passportPayload(query?.invoice_payload);
  const userId=query?.from?.id;
  let accepted=false;
  if(orderId&&Number.isSafeInteger(userId)&&userId>0&&query.currency==='XTR'){
    const order=await env.DB.prepare("SELECT id,user_id,stars_amount,status,created_at FROM passport_orders WHERE id=?").bind(orderId).first();
    if(order&&order.user_id==='tg_'+userId&&order.status==='pending'&&Number(query.total_amount)===order.stars_amount){
      const existing=await env.DB.prepare('SELECT id FROM passport_entitlements WHERE user_id=?').bind(order.user_id).first();
      const created=new Date(String(order.created_at).replace(' ','T')+'Z').getTime();
      accepted=!existing&&Number.isFinite(created)&&Date.now()-created<30*60*1000;
    }
  }
  const result=await telegramBotMethod(env,'answerPreCheckoutQuery',{
    pre_checkout_query_id:String(query.id),ok:accepted,
    ...(!accepted?{error_message:'Invoice tidak valid, telah kedaluwarsa, atau Paspor sudah aktif. Buka kembali Scanstoon.'}:{})
  });
  return {received:true,approved:accepted,answered:result===true};
}
async function passportPayment(env,message){
  const payment=message?.successful_payment,orderId=passportPayload(payment?.invoice_payload);
  const tgId=message?.from?.id,charge=String(payment?.telegram_payment_charge_id||'');
  if(!orderId||!Number.isSafeInteger(tgId)||tgId<=0||!charge||charge.length>200||payment.currency!=='XTR')return {received:true,ignored:true};
  const order=await env.DB.prepare('SELECT id,user_id,status,stars_amount,telegram_payment_charge_id FROM passport_orders WHERE id=?').bind(orderId).first();
  if(!order||order.user_id!=='tg_'+tgId||Number(payment.total_amount)!==order.stars_amount)return {received:true,ignored:true};
  if(order.status==='paid')return {received:true,duplicate:true};
  const result=await env.DB.batch([
    env.DB.prepare("UPDATE passport_orders SET status='paid',telegram_payment_charge_id=?,paid_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status='pending' AND stars_amount=?").bind(charge,orderId,order.user_id,order.stars_amount),
    env.DB.prepare("INSERT OR IGNORE INTO passport_entitlements(id,user_id,source) SELECT ?,user_id,'telegram_stars' FROM passport_orders WHERE id=? AND status='paid' AND telegram_payment_charge_id=?").bind('passport:'+order.user_id,orderId,charge)
  ]);
  return {received:true,fulfilled:true};
}
async function api(request,env,url) {
  if (url.pathname==='/api/health') return good({status:'ok',version:'0.6.0',service:'scanstoon'});
  if (!env.DB) return fail(503,'DATABASE_UNAVAILABLE','Database belum dikonfigurasi.');
  const method=request.method;
  if (method==='GET' && url.pathname==='/api/telegram/status') {
    const row=await env.DB.prepare('SELECT status,channel_status,error_code,updated_at FROM telegram_setup_status WHERE id=1').first();
    const menu=await env.DB.prepare('SELECT status, error_code, updated_at FROM telegram_menu_setup WHERE id=1').first();
    return good({webhook:row?.status||'pending',channel:row?.channel_status||'unverified',menu:menu?.status||'pending',menu_error:menu?.error_code||null,error_code:row?.error_code||null,checked_at:row?.updated_at||null});
  }
  if (url.pathname.startsWith('/api/storage/')) return await telegramStorageRoute(request,env,url);
  if (method==='GET' && url.pathname==='/api/home') {
    const [popular,latest]=await Promise.all([
      env.DB.prepare('SELECT * FROM comics ORDER BY score DESC LIMIT 8').all(),
      env.DB.prepare('SELECT * FROM comics ORDER BY updated_at DESC,score DESC LIMIT 8').all()
    ]);
    return good({popular:popular.results.map(mapComic),latest:latest.results.map(mapComic)});
  }
  if (method==='GET' && (url.pathname==='/api/comics'||url.pathname==='/api/search')) {
    const u=url.searchParams;
    const page=Math.max(1,Math.min(1000,parseInt(u.get('page')||'1',10)||1));
    const limit=Math.max(1,Math.min(48,parseInt(u.get('limit')||'24',10)||24));
    const q=(u.get('q')||'').trim().slice(0,80);
    const type=(u.get('type')||'').toLowerCase();
    const genre=(u.get('genre')||'').toLowerCase().slice(0,40);
    const status=(u.get('status')||'').toLowerCase();
    if(type && !['manga','manhwa','manhua','webtoon','donghua','original'].includes(type)) return fail(400,'INVALID_TYPE','Tipe tidak dikenal.');
    if(status && !['ongoing','completed','hiatus'].includes(status)) return fail(400,'INVALID_STATUS','Status tidak dikenal.');
    const where=[],bind=[];
    if(q){where.push('(title LIKE ? OR subtitle LIKE ? OR synopsis LIKE ?)');bind.push('%'+q+'%','%'+q+'%','%'+q+'%');}
    if(type){where.push('type=?');bind.push(type);}
    if(status){where.push('status=?');bind.push(status);}
    if(genre){where.push("(','||LOWER(genres)||',') LIKE ?");bind.push('%,'+genre+',%');}
    const predicate=where.length?' WHERE '+where.join(' AND '):'';
    const sort=['latest','title'].includes(u.get('sort'))?u.get('sort'):'popular';
    const order=sort==='title'?'title COLLATE NOCASE ASC':sort==='latest'?'updated_at DESC,score DESC':'score DESC';
    const [rows,count]=await Promise.all([
      env.DB.prepare('SELECT * FROM comics'+predicate+' ORDER BY '+order+' LIMIT ? OFFSET ?').bind(...bind,limit,(page-1)*limit).all(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM comics'+predicate).bind(...bind).first()
    ]);
    return good(rows.results.map(mapComic),{page,limit,total:count.count});
  }
  const match=url.pathname.match(/^\/api\/comics\/([a-z0-9-]+)(?:\/chapters)?$/);
  if(method==='GET'&&match){
    const slug=match[1];
    const row=await env.DB.prepare('SELECT * FROM comics WHERE slug=?').bind(slug).first();
    if(!row)return fail(404,'NOT_FOUND','Judul tidak ditemukan.');
    if(url.pathname.endsWith('/chapters')){
      const chapters=await env.DB.prepare('SELECT id,number,title,released_at FROM chapters WHERE comic_id=? ORDER BY number DESC').bind(row.id).all();
      return good(chapters.results);
    }
    const chapters=await env.DB.prepare('SELECT id,number,title,released_at FROM chapters WHERE comic_id=? ORDER BY number DESC').bind(row.id).all();
    return good({...mapComic(row),chapters:chapters.results});
  }
  const user=await telegramUser(request,env);
  if(!user) return fail(401,'UNAUTHORIZED','Buka melalui Telegram untuk menyinkronkan data akun.');
  if(method==='GET'&&url.pathname==='/api/me') return good(user);
  if(method==='GET'&&url.pathname==='/api/passport')return good(await passportStatus(env,user));
  if(method==='POST'&&url.pathname==='/api/passport/invoice'){
    if(!passportSalesEnabled(env))return fail(503,'SALES_NOT_READY','Pembelian Paspor .toon belum diaktifkan oleh pengelola.');
    const status=await passportStatus(env,user);
    if(status.premium)return fail(409,'ALREADY_PREMIUM','Paspor .toon Premium sudah aktif.');
    try{return good(await passportInvoice(env,user));}
    catch(error){console.error('passport_invoice_failed',String(error));return fail(502,'PAYMENT_UNAVAILABLE','Tidak dapat membuka invoice Telegram Stars saat ini.');}
  }
  if(method==='GET'&&url.pathname==='/api/bookmarks') {
    const rows=await env.DB.prepare('SELECT c.* FROM bookmarks b JOIN comics c ON c.id=b.comic_id WHERE b.user_id=? ORDER BY b.created_at DESC').bind(user.id).all();
    return good(rows.results.map(mapComic));
  }
  if(method==='GET'&&url.pathname==='/api/history') {
    const rows=await env.DB.prepare('SELECT c.*,h.chapter_number,h.percent,h.updated_at AS last_read_at FROM reading_history h JOIN comics c ON c.id=h.comic_id WHERE h.user_id=? ORDER BY h.updated_at DESC LIMIT 30').bind(user.id).all();
    return good(rows.results.map(mapComic));
  }
  const bookmark=url.pathname.match(/^\/api\/bookmarks\/([a-z0-9-]+)$/);
  if(bookmark && (method==='PUT'||method==='DELETE')) {
    const c=await env.DB.prepare('SELECT id FROM comics WHERE slug=?').bind(bookmark[1]).first();
    if(!c) return fail(404,'NOT_FOUND','Judul tidak ditemukan.');
    if(method==='PUT') await env.DB.prepare('INSERT OR IGNORE INTO bookmarks(user_id,comic_id) VALUES(?,?)').bind(user.id,c.id).run();
    else await env.DB.prepare('DELETE FROM bookmarks WHERE user_id=? AND comic_id=?').bind(user.id,c.id).run();
    return good({bookmarked:method==='PUT'});
  }
  const history=url.pathname.match(/^\/api\/history\/([a-z0-9-]+)$/);
  if(history&&method==='PUT'){
    let body;
    try{body=await request.json();}catch{return fail(400,'BAD_BODY','JSON tidak valid.');}
    const chapter=Number(body.chapter_number),percent=Number(body.percent);
    if(!Number.isSafeInteger(chapter)||chapter<1||chapter>10000||!Number.isSafeInteger(percent)||percent<0||percent>100) return fail(400,'BAD_PROGRESS','Progress tidak valid.');
    const c=await env.DB.prepare('SELECT id FROM comics WHERE slug=?').bind(history[1]).first();
    if(!c) return fail(404,'NOT_FOUND','Judul tidak ditemukan.');
    await env.DB.prepare('INSERT INTO reading_history(user_id,comic_id,chapter_number,percent) VALUES(?,?,?,?) ON CONFLICT(user_id,comic_id) DO UPDATE SET chapter_number=excluded.chapter_number,percent=excluded.percent,updated_at=CURRENT_TIMESTAMP').bind(user.id,c.id,chapter,percent).run();
    return good({saved:true});
  }
  return fail(404,'NOT_FOUND','Endpoint tidak ditemukan.');
}
async function telegramWebhook(request,env) {
  if(request.method!=='POST') return fail(405,'METHOD_NOT_ALLOWED','Method tidak valid.');
  if(!env.TELEGRAM_WEBHOOK_SECRET||!env.TELEGRAM_BOT_TOKEN) return fail(503,'BOT_NOT_CONFIGURED','Bot belum dikonfigurasi.');
  if(!secureEqual(request.headers.get('X-Telegram-Bot-Api-Secret-Token')||'',env.TELEGRAM_WEBHOOK_SECRET)) return fail(403,'FORBIDDEN','Webhook secret tidak valid.');
  let update;
  try{update=await request.json();}catch{return fail(400,'BAD_BODY','JSON tidak valid.');}
  if(update?.channel_post) return await telegramStorageUpdate(update.channel_post,env);
  if(update?.pre_checkout_query){
    if(!env.DB)return fail(503,'DATABASE_UNAVAILABLE','Database tidak tersedia.');
    return good(await passportCheckout(env,update.pre_checkout_query));
  }
  if(update?.message?.successful_payment){
    if(!env.DB)return fail(503,'DATABASE_UNAVAILABLE','Database tidak tersedia.');
    return good(await passportPayment(env,update.message));
  }
  const chat=update?.message?.chat?.id;
  const command=String(update?.message?.text||'').trim().split(/\s+/)[0].split('@')[0];
  if(chat && ['/terms','/paysupport'].includes(command)) {
    const message=command==='/terms'?
      'Paspor .toon Premium: paspor digital dan badge Premium Scanstoon untuk akun Telegram pembeli. Pembayaran satu kali via Telegram Stars; tidak membuka chapter eksklusif. Akses berlaku selama layanan Scanstoon beroperasi. Simpan bukti transaksi. Lihat kebijakan/refund di https://github.com/xirraen/scanstoon/issues':
      'Bantuan pembayaran Paspor .toon: catat charge ID dari bukti Telegram, lalu buat laporan privat ke pengelola bot. Jalur awal: https://github.com/xirraen/scanstoon/issues . Jangan kirim token atau kata sandi.';
    await telegramBotMethod(env,'sendMessage',{chat_id:chat,text:message});
    return good({received:true});
  }
  if(chat && ['/start','/app','/help'].includes(command)) {
    const base=env.APP_URL||new URL(request.url).origin;
    const payload={chat_id:chat,text:'Scanstoon — katalog komik orisinal, daftar bacaan, dan pelacak progres. Buka aplikasinya melalui tombol berikut.',reply_markup:{inline_keyboard:[[{text:'Buka Scanstoon',web_app:{url:base}}]]}};
    await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  }
  return good({received:true});
}
export default {
  async fetch(request,env){
    env={...env,TELEGRAM_BOT_TOKEN:env.TELEGRAM_BOT_TOKEN||env.TELEGRAM_TOKEN_BOT};
    try{
      const url=new URL(request.url);
      if(url.pathname.startsWith('/api/')) return await api(request,env,url);
      if(url.pathname==='/telegram/webhook') return await telegramWebhook(request,env);
      if(request.method!=='GET'&&request.method!=='HEAD') return fail(405,'METHOD_NOT_ALLOWED','Method tidak valid.');
      return new Response(request.method==='HEAD'?null:PAGE,{status:200,headers:{
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'public, max-age=60',
        'X-Content-Type-Options':'nosniff',
        'Referrer-Policy':'strict-origin-when-cross-origin',
        'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors https://web.telegram.org https://*.telegram.org"
      }});
    }catch(error){console.error('scanstoon_request_error',String(error));return fail(500,'SERVER_ERROR','Terjadi masalah pada server.');}
  },
  async scheduled(event,env,ctx){
    ctx.waitUntil(Promise.all([telegramBootstrap(env),telegramMenuBootstrap(env)]));
  }
};