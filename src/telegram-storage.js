// Telegram channel media storage adapter for the Scanstoon single-Worker MVP.
// Loaded as plain JavaScript by scripts/build.mjs, after src/worker.js.
const TG_MEDIA_LIMIT = 20000000; // Telegram Bot API getFile max 20 MB.
const TG_MIME_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif']);
function tgHex(bytes){return Array.from(bytes).map(n=>n.toString(16).padStart(2,'0')).join('');}
async function tgSign(id,exp,secret){return tgHex(await hmac(new TextEncoder().encode(secret),id+':'+exp));}
function tgMediaFromMessage(message){
  const photos=Array.isArray(message.photo)?message.photo:[];
  const picture=photos.filter(x=>x&&typeof x.file_id==='string'&&typeof x.file_unique_id==='string'&&(x.file_size||0)<=TG_MEDIA_LIMIT).sort((a,b)=>(b.width||0)*(b.height||0)-(a.width||0)*(a.height||0))[0];
  if(picture)return {file_id:picture.file_id,file_unique_id:picture.file_unique_id,file_size:picture.file_size||0,mime_type:'image/jpeg'};
  const doc=message.document;
  if(doc&&TG_MIME_TYPES.has(doc.mime_type)&&typeof doc.file_id==='string'&&typeof doc.file_unique_id==='string'&&(doc.file_size||0)<=TG_MEDIA_LIMIT)return {file_id:doc.file_id,file_unique_id:doc.file_unique_id,file_size:doc.file_size||0,mime_type:doc.mime_type};
  return null;
}
function tgSlug(value){return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)&&value.length<=100;}
async function telegramStorageUpdate(message,env){
  if(!env.TELEGRAM_CHANNEL_ID || String(message?.chat?.id)!==String(env.TELEGRAM_CHANNEL_ID))return good({received:true,ignored:true});
  const text=String(message.text||'').trim(),parts=text.split('|').map(x=>x.trim());
  if(parts.length===5&&parts[0]==='#comic'&&tgSlug(parts[1])&&parts[2].length>=1&&parts[2].length<=180&&['manga','manhwa','manhua','webtoon','donghua','original'].includes(parts[3])&&parts[4].length<=2000){
    const [tag,slug,title,type,synopsis]=parts;
    const id='telegram:'+slug;
    await env.DB.prepare("INSERT OR IGNORE INTO comics(id,slug,title,subtitle,type,status,synopsis,genres,source_type) VALUES(?,?,?,'',?,'ongoing',?,'','original')").bind(id,slug,title,type,synopsis).run();
    return good({received:true,stored:'comic'});
  }
  const caption=String(message.caption||'').trim().split('|').map(x=>x.trim());
  if(caption.length!==5||caption[0]!=='#page'||!tgSlug(caption[1])||! /^\d+$/.test(caption[2])||! /^\d+$/.test(caption[3]))return good({received:true,ignored:true});
  const [tag,slug,chapterString,pageString,title]=caption;
  const chapter=Number(chapterString),page=Number(pageString),media=tgMediaFromMessage(message);
  if(!Number.isSafeInteger(chapter)||chapter<1||chapter>100000||!Number.isSafeInteger(page)||page<1||page>5000||title.length>180||!media||!Number.isSafeInteger(message.message_id))return good({received:true,ignored:true});
  const comic=await env.DB.prepare("SELECT id FROM comics WHERE slug=? AND source_type='original'").bind(slug).first();
  if(!comic)return fail(409,'COMIC_NOT_FOUND','Daftarkan judul orisinal terlebih dahulu.');
  const chapterId='telegram:'+slug+':'+chapter;
  await env.DB.prepare('INSERT OR IGNORE INTO chapters(id,comic_id,number,title) VALUES(?,?,?,?)').bind(chapterId,comic.id,chapter,title||('Chapter '+chapter)).run();
  const existing=await env.DB.prepare('SELECT id FROM chapters WHERE comic_id=? AND number=?').bind(comic.id,chapter).first();
  if(!existing)return fail(503,'DATABASE_ERROR','Chapter gagal disimpan.');
  const mediaId='telegram:'+String(message.chat.id)+':'+message.message_id;
  await env.DB.prepare('INSERT INTO telegram_media(id,chapter_id,page_number,file_id,file_unique_id,file_size,mime_type,chat_id,message_id) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(chapter_id,page_number) DO UPDATE SET file_id=excluded.file_id,file_unique_id=excluded.file_unique_id,file_size=excluded.file_size,mime_type=excluded.mime_type,chat_id=excluded.chat_id,message_id=excluded.message_id').bind(mediaId,existing.id,page,media.file_id,media.file_unique_id,media.file_size,media.mime_type,String(message.chat.id),message.message_id).run();
  return good({received:true,stored:'page'});
}
async function telegramStorageRoute(request,env,url){
  const path=url.pathname;
  const chapterRoute=path.match(/^\/api\/storage\/comics\/([a-z0-9-]+)\/chapters\/(\d+)\/pages$/);
  if(chapterRoute&&request.method==='GET'){
    if(!env.TELEGRAM_BOT_TOKEN||!env.MEDIA_SIGNING_SECRET)return fail(503,'STORAGE_NOT_CONFIGURED','Telegram storage belum dikonfigurasi.');
    const user=await telegramUser(request,env); // Validates signed Telegram Mini App initData.
    if(!user)return fail(401,'UNAUTHORIZED','Buka Scanstoon melalui bot Telegram.');
    const chapter=Number(chapterRoute[2]);
    if(!Number.isSafeInteger(chapter)||chapter<1||chapter>100000)return fail(400,'BAD_CHAPTER','Chapter tidak valid.');
    const rows=await env.DB.prepare("SELECT m.id,m.page_number FROM telegram_media m JOIN chapters ch ON ch.id=m.chapter_id JOIN comics c ON c.id=ch.comic_id WHERE c.slug=? AND c.source_type='original' AND ch.number=? ORDER BY m.page_number ASC").bind(chapterRoute[1],chapter).all();
    const expires=Math.floor(Date.now()/1000)+600;
    const data=await Promise.all(rows.results.map(async r=>({page:r.page_number,url:'/api/storage/media/'+encodeURIComponent(r.id)+'?expires='+expires+'&sig='+await tgSign(r.id,expires,env.MEDIA_SIGNING_SECRET)})));
    return good(data);
  }
  const mediaRoute=path.match(/^\/api\/storage\/media\/([a-zA-Z0-9:_-]+)$/);
  if(mediaRoute&&request.method==='GET'){
    if(!env.TELEGRAM_BOT_TOKEN||!env.MEDIA_SIGNING_SECRET)return fail(503,'STORAGE_NOT_CONFIGURED','Telegram storage belum dikonfigurasi.');
    const id=mediaRoute[1],exp=Number(url.searchParams.get('expires')),sig=url.searchParams.get('sig')||'';
    const now=Math.floor(Date.now()/1000);
    if(!Number.isSafeInteger(exp)||exp<now||exp>now+600||!/^[a-f0-9]{64}$/i.test(sig)||!secureEqual(sig.toLowerCase(),await tgSign(id,exp,env.MEDIA_SIGNING_SECRET)))return fail(403,'FORBIDDEN','URL media tidak sah atau kedaluwarsa.');
    const row=await env.DB.prepare('SELECT file_id,file_size,mime_type FROM telegram_media WHERE id=?').bind(id).first();
    if(!row)return fail(404,'NOT_FOUND','Media tidak ditemukan.');
    if(row.file_size>TG_MEDIA_LIMIT)return fail(413,'FILE_TOO_LARGE','Media melebihi batas unduh Bot API.');
    const token=env.TELEGRAM_BOT_TOKEN;
    const response=await fetch('https://api.telegram.org/bot'+token+'/getFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file_id:row.file_id})});
    if(!response.ok)return fail(502,'TELEGRAM_UNAVAILABLE','Telegram getFile tidak tersedia.');
    const info=await response.json();
    const filePath=info?.result?.file_path;
    if(!info.ok||typeof filePath!=='string'||!/^[A-Za-z0-9_./-]+$/.test(filePath)||filePath.includes('..'))return fail(502,'TELEGRAM_UNAVAILABLE','Telegram tidak mengembalikan file yang valid.');
    const data=await fetch('https://api.telegram.org/file/bot'+token+'/'+filePath);
    if(!data.ok||!data.body)return fail(502,'TELEGRAM_UNAVAILABLE','File Telegram gagal diunduh.');
    return new Response(data.body,{headers:{'Content-Type':TG_MIME_TYPES.has(row.mime_type)?row.mime_type:'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  }
  return fail(404,'NOT_FOUND','Storage endpoint tidak ditemukan.');
}


// One-time webhook bootstrap, invoked by a temporary Cloudflare Cron Trigger.
// It never reads secret values back to a client, and refuses to displace another webhook.
async function telegramBootstrap(env) {
  const db=env.DB;
  async function record(status,webhookUrl,username,channelStatus,errorCode){
    await db.prepare("INSERT INTO telegram_setup_status(id,status,webhook_url,bot_username,channel_status,error_code,updated_at) VALUES(1,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET status=excluded.status,webhook_url=excluded.webhook_url,bot_username=excluded.bot_username,channel_status=excluded.channel_status,error_code=excluded.error_code,updated_at=CURRENT_TIMESTAMP").bind(status,webhookUrl||'',username||'',channelStatus||'',errorCode||'').run();
  }
  const previous=await db.prepare("SELECT status FROM telegram_setup_status WHERE id=1").first();
  if(previous?.status==='ok') return;
  const token=env.TELEGRAM_BOT_TOKEN||env.TELEGRAM_TOKEN_BOT;
  const hookSecret=env.TELEGRAM_WEBHOOK_SECRET;
  if(!token||!hookSecret){await record('blocked','','','','MISSING_TOKEN_OR_SECRET');return;}
  const target='https://scanstoon.ikomik-core.workers.dev/telegram/webhook';
  const api='https://api.telegram.org/bot'+token+'/';
  let username='',channelStatus='unverified';
  try{
    const call=async(method,payload)=>{
      const response=await fetch(api+method,payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{method:'GET'});
      if(!response.ok)return null;
      const json=await response.json();
      return json?.ok?json.result:null;
    };
    const me=await call('getMe');
    if(!me||!Number.isSafeInteger(me.id)){await record('blocked','','','','BOT_TOKEN_INVALID');return;}
    username=String(me.username||'').slice(0,120);
    if(env.TELEGRAM_CHANNEL_ID){
      const member=await call('getChatMember',{chat_id:env.TELEGRAM_CHANNEL_ID,user_id:me.id});
      channelStatus=member&&['administrator','creator'].includes(member.status)?'admin':'not_admin_or_inaccessible';
    }else channelStatus='channel_missing';
    const previousWebhook=await call('getWebhookInfo');
    if(!previousWebhook){await record('error','',username,channelStatus,'WEBHOOK_INFO_FAILED');return;}
    const current=String(previousWebhook.url||'');
    if(current&&current!==target){await record('blocked',current,username,channelStatus,'EXISTING_WEBHOOK_OTHER_URL');return;}
    const applied=await call('setWebhook',{url:target,secret_token:hookSecret,allowed_updates:['message','channel_post'],drop_pending_updates:false});
    if(applied!==true){await record('error',current,username,channelStatus,'SET_WEBHOOK_FAILED');return;}
    const confirmed=await call('getWebhookInfo');
    if(!confirmed||confirmed.url!==target){await record('error',current,username,channelStatus,'WEBHOOK_VERIFICATION_FAILED');return;}
    await record('ok',target,username,channelStatus,'');
  }catch(err){
    // No exception details: Telegram's internal fetch URL contains a bot token.
    await record('error','',username,channelStatus,'TELEGRAM_API_UNAVAILABLE');
  }
}


// Idempotent default Mini App menu setup. Runs only from a temporary Cron Trigger.
// No bot tokens are persisted in D1 or returned to the client.
async function telegramMenuBootstrap(env){
  const db=env.DB;
  const record=async(status,url,errorCode)=>{
    await db.prepare("INSERT INTO telegram_menu_setup(id,status,menu_url,error_code,updated_at) VALUES(1,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET status=excluded.status,menu_url=excluded.menu_url,error_code=excluded.error_code,updated_at=CURRENT_TIMESTAMP").bind(status,url||'',errorCode||'').run();
  };
  const previous=await db.prepare('SELECT status FROM telegram_menu_setup WHERE id=1').first();
  if(previous?.status==='ok')return;
  const webhook=await db.prepare('SELECT status FROM telegram_setup_status WHERE id=1').first();
  if(webhook?.status!=='ok'){await record('blocked','','WEBHOOK_NOT_READY');return;}
  const token=env.TELEGRAM_BOT_TOKEN||env.TELEGRAM_TOKEN_BOT;
  if(!token){await record('blocked','','BOT_TOKEN_MISSING');return;}
  const target='https://scanstoon.ikomik-core.workers.dev';
  const sameTarget=(value)=>{try{const u=new URL(value);return u.origin===target&&u.pathname==='/'&&!u.search&&!u.hash;}catch{return false;}};
  const api='https://api.telegram.org/bot'+token+'/';
  try{
    const call=async(method,body)=>{
      const res=await fetch(api+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
      if(!res.ok)return null;
      const data=await res.json();
      return data?.ok?data.result:null;
    };
    const existing=await call('getChatMenuButton');
    if(!existing){await record('error','','MENU_READ_FAILED');return;}
    if(existing.type==='web_app'){
      if(sameTarget(existing.web_app?.url)){await record('ok',target,'');return;}
      await record('blocked','','EXISTING_MENU_OTHER_URL');return;
    }
    const changed=await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Buka Scanstoon',web_app:{url:target}}});
    if(changed!==true){await record('error','','MENU_WRITE_FAILED');return;}
    const confirmed=await call('getChatMenuButton');
    if(confirmed?.type!=='web_app'||!sameTarget(confirmed?.web_app?.url)){await record('error','','MENU_VERIFY_FAILED_'+String(confirmed?.type||'unknown').slice(0,24));return;}
    await record('ok',target,'');
  }catch(error){
    // Error details may expose the token embedded in the Telegram API URL.
    await record('error','','BOT_API_UNAVAILABLE');
  }
}
