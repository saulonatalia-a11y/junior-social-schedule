const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(ROOT, 'uploads');
const DB = path.join(DATA, 'db.json');
for (const d of [DATA, UPLOADS]) fs.mkdirSync(d, { recursive: true });
if (!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify({ posts: [], meta: { connected: false } }, null, 2));

loadEnv(path.join(ROOT, '.env'));
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const oauthStates = new Map();

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const i = s.indexOf('=');
    const key = s.slice(0, i).trim();
    const value = s.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
function readDb() { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
function writeDb(db) { fs.writeFileSync(DB, JSON.stringify(db, null, 2)); }
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function text(res, status, body, type='text/plain; charset=utf-8') { res.writeHead(status, { 'Content-Type': type }); res.end(body); }
function parseBody(req, limit = 35 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > limit) { reject(new Error('Arquivo muito grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}
function safeName(name='arquivo') { return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120); }
function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.json':'application/json; charset=utf-8'})[ext] || 'application/octet-stream';
}
function metaConfig() {
  return {
    clientId: process.env.META_CLIENT_ID || '',
    clientSecret: process.env.META_CLIENT_SECRET || '',
    redirectUri: 'https://junior-social-schedule.onrender.com/api/meta/callback',
    authUrl: process.env.META_AUTH_URL || 'https://www.instagram.com/oauth/authorize',
    tokenUrl: process.env.META_TOKEN_URL || 'https://api.instagram.com/oauth/access_token',
    graphUrl: process.env.META_GRAPH_URL || 'https://graph.instagram.com',
    scopes: 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights'
  };
}
function requireMetaConfig() {
  const c = metaConfig();
  if (!c.clientId || !c.clientSecret) throw new Error('Configure META_CLIENT_ID e META_CLIENT_SECRET no arquivo .env.');
  return c;
}
async function exchangeCode(code) {
  const c = requireMetaConfig();
  const form = new FormData();
  form.set('client_id', c.clientId);
  form.set('client_secret', c.clientSecret);
  form.set('grant_type', 'authorization_code');
  form.set('redirect_uri', c.redirectUri);
  form.set('code', code);
  const r = await fetch(c.tokenUrl, { method:'POST', body:form });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error_message || data.error?.message || 'Falha ao trocar código OAuth.');
  return data;
}
async function metaGet(pathname, token) {
  const c = metaConfig();
  const u = new URL(c.graphUrl.replace(/\/$/,'') + pathname);
  u.searchParams.set('access_token', token);
  const r = await fetch(u); const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error?.message || 'Erro na API do Instagram.');
  return data;
}
async function metaPost(pathname, params, token) {
  const c = metaConfig();
  const form = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(c.graphUrl.replace(/\/$/,'') + pathname, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:form });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error?.message || 'Erro ao publicar no Instagram.');
  return data;
}
function scheduledTimeMs(post){
  if(!post?.date||!post?.time)return NaN;
  // O painel agenda em horário de Brasília (UTC-03:00).
  return new Date(`${post.date}T${post.time}:00-03:00`).getTime();
}

async function publishPost(post) {
  const db = readDb();
  const meta = db.meta || {};
  if (!meta.connected || !meta.accessToken || !meta.userId) throw new Error('Instagram ainda não está conectado.');
  if (!post.media?.length) throw new Error('Adicione pelo menos uma mídia.');
  if (!/^https:\/\//i.test(PUBLIC_BASE_URL)) throw new Error('Para publicar automaticamente, PUBLIC_BASE_URL precisa ser uma URL HTTPS pública para a Meta acessar as mídias.');

  const urls = post.media.map(m => new URL(m.serverUrl, PUBLIC_BASE_URL).href);
  const base = `/${encodeURIComponent(meta.userId)}`;
  let creation;
  if (post.type === 'carousel') {
    const children = [];
    for (let i=0;i<urls.length;i++) {
      const m = post.media[i];
      const params = m.type?.startsWith('video') ? { media_type:'VIDEO', video_url:urls[i], is_carousel_item:'true' } : { image_url:urls[i], is_carousel_item:'true' };
      const child = await metaPost(`${base}/media`, params, meta.accessToken); children.push(child.id);
    }
    creation = await metaPost(`${base}/media`, { media_type:'CAROUSEL', children:children.join(','), caption:[post.caption,post.hashtags].filter(Boolean).join('\n\n') }, meta.accessToken);
  } else {
    const isVideo = post.media[0].type?.startsWith('video');
    const params = { caption:[post.caption,post.hashtags].filter(Boolean).join('\n\n') };
    if (post.type === 'reel') { params.media_type='REELS'; params.video_url=urls[0]; }
    else if (post.type === 'story') { params.media_type='STORIES'; if (isVideo) params.video_url=urls[0]; else params.image_url=urls[0]; delete params.caption; }
    else if (isVideo) { params.media_type='VIDEO'; params.video_url=urls[0]; }
    else params.image_url=urls[0];
    creation = await metaPost(`${base}/media`, params, meta.accessToken);
  }
  if (!creation?.id) throw new Error('A Meta não retornou o ID do container.');
  const published = await metaPost(`${base}/media_publish`, { creation_id: creation.id }, meta.accessToken);
  return published;
}

async function api(req, res, u) {
  if (req.method === 'GET' && u.pathname === '/api/health') return json(res,200,{ok:true,version:'2.0.1',timezone:'America/Sao_Paulo',now:new Date().toISOString()});
  if (req.method === 'GET' && u.pathname === '/api/posts') return json(res,200,readDb().posts || []);
  if (req.method === 'POST' && u.pathname === '/api/posts') {
    const p = await parseBody(req); const db = readDb();
    p.id = crypto.randomUUID(); p.createdAt = new Date().toISOString();
    p.status = p.status || 'Agendado'; p.publishAttempts = 0;
    db.posts.unshift(p); writeDb(db); return json(res,201,p);
  }
  if (req.method === 'DELETE' && u.pathname.startsWith('/api/posts/')) {
    const id = decodeURIComponent(u.pathname.split('/').pop()); const db=readDb();
    const before=db.posts.length; db.posts=db.posts.filter(p=>p.id!==id); writeDb(db); return json(res,200,{ok:db.posts.length<before});
  }
  if (req.method === 'POST' && u.pathname === '/api/media') {
    const b = await parseBody(req); if (!b.dataUrl?.includes(',')) return json(res,400,{error:'Mídia inválida'});
    const [,base64] = b.dataUrl.split(',',2); const ext = path.extname(b.name||'') || (b.type==='video/mp4'?'.mp4':'.jpg');
    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName(path.basename(b.name||'media', path.extname(b.name||'')))}${ext}`;
    fs.writeFileSync(path.join(UPLOADS, filename), Buffer.from(base64,'base64'));
    return json(res,201,{serverUrl:`/uploads/${filename}`,name:b.name||filename,type:b.type||'application/octet-stream'});
  }
  if (req.method === 'GET' && u.pathname === '/api/meta/status') {
    const m=readDb().meta||{}; return json(res,200,{connected:!!m.connected,username:m.username||'',userId:m.userId||'',profilePictureUrl:m.profilePictureUrl||'',configured:!!(process.env.META_CLIENT_ID&&process.env.META_CLIENT_SECRET)});
  }
  if (req.method === 'GET' && u.pathname === '/api/meta/connect') {
    try {
      const c=requireMetaConfig();
      const auth = new URL('https://www.instagram.com/oauth/authorize');
      auth.searchParams.set('force_reauth','true');
      auth.searchParams.set('client_id',c.clientId);
      auth.searchParams.set('redirect_uri',c.redirectUri);
      auth.searchParams.set('response_type','code');
      auth.searchParams.set('scope',c.scopes);
      return json(res,200,{url:auth.href});
    } catch(e) { return json(res,400,{error:e.message}); }
  }
  if (req.method === 'GET' && u.pathname === '/api/meta/callback') {
    try {
      const code=u.searchParams.get('code');
      if (!code) throw new Error('Retorno OAuth inválido: código ausente.');
      const token=await exchangeCode(code); const accessToken=token.access_token; let profile={id:token.user_id||'',username:'',profile_picture_url:''};
      try { profile=await metaGet('/me?fields=id,username,profile_picture_url',accessToken); } catch {}
      const db=readDb(); db.meta={connected:true,accessToken,userId:String(profile.id||token.user_id||''),username:profile.username||'',profilePictureUrl:profile.profile_picture_url||'',connectedAt:new Date().toISOString()}; writeDb(db);
      res.writeHead(302,{Location:'/index.html?instagram=connected'}); return res.end();
    } catch(e) { return text(res,400,`Falha ao conectar Instagram: ${e.message}`); }
  }
  if (req.method === 'POST' && u.pathname === '/api/meta/disconnect') {
    const db=readDb(); db.meta={connected:false}; writeDb(db); return json(res,200,{ok:true});
  }
  if (req.method === 'POST' && /^\/api\/posts\/[^/]+\/publish$/.test(u.pathname)) {
    const id=decodeURIComponent(u.pathname.split('/')[3]); const db=readDb(); const p=db.posts.find(x=>x.id===id); if(!p)return json(res,404,{error:'Post não encontrado'});
    try { const result=await publishPost(p); p.status='Publicado'; p.publishedAt=new Date().toISOString(); p.instagramMediaId=result.id||''; p.lastError=''; writeDb(db); return json(res,200,{ok:true,result}); }
    catch(e){console.error('PUBLISH_ERROR', {id:p.id,type:p.type,message:e.message});p.status='Erro';p.lastError=e.message;p.publishAttempts=(p.publishAttempts||0)+1;writeDb(db);return json(res,400,{error:e.message});}
  }
  return false;
}

function staticFile(req,res,u){
  let rel=decodeURIComponent(u.pathname); if(rel==='/' ) rel='/index.html';
  const file=path.normalize(path.join(ROOT,rel)); if(!file.startsWith(ROOT)) return text(res,403,'Proibido');
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory()) return text(res,404,'Não encontrado');
  res.writeHead(200,{'Content-Type':mime(file),'Cache-Control':rel.startsWith('/uploads/')?'public, max-age=31536000':'no-cache'}); fs.createReadStream(file).pipe(res);
}

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  try { if(u.pathname.startsWith('/api/')){const done=await api(req,res,u); if(done!==false)return;} staticFile(req,res,u); }
  catch(e){ console.error(e); json(res,500,{error:e.message||'Erro interno'}); }
});
server.listen(PORT,()=>console.log(`Junior Social Scheduler: http://localhost:${PORT}`));

setInterval(async()=>{
  const db=readDb(); const now=Date.now(); let changed=false;
  for(const p of db.posts){
    if(p.status!=='Agendado'||!p.date||!p.time)continue;
    const due=scheduledTimeMs(p); if(!Number.isFinite(due)||due>now)continue;
    try{ console.log('SCHEDULE_DUE',{id:p.id,type:p.type,date:p.date,time:p.time,due:new Date(due).toISOString()});const result=await publishPost(p); p.status='Publicado';p.publishedAt=new Date().toISOString();p.instagramMediaId=result.id||'';p.lastError='';console.log('SCHEDULE_PUBLISHED',{id:p.id,instagramMediaId:p.instagramMediaId}); }
    catch(e){ console.error('SCHEDULE_PUBLISH_ERROR',{id:p.id,type:p.type,message:e.message});p.status=e.message.includes('ainda não está conectado')||e.message.includes('PUBLIC_BASE_URL')?'Agendado':'Erro';p.lastError=e.message;p.publishAttempts=(p.publishAttempts||0)+1; }
    changed=true;
  }
  if(changed)writeDb(db);
},10000).unref();
