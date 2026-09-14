const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const state={type:'feed',media:[],posts:[],month:new Date(),api:true,stickers:[],selectedStickerId:null};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
async function api(url,opts={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||'Erro no servidor');return d}
async function loadPosts(){try{state.posts=await api('/api/posts');state.api=true}catch{state.api=false;state.posts=JSON.parse(localStorage.getItem('jb_posts')||'[]')}renderAll()}
function saveLocal(){localStorage.setItem('jb_posts',JSON.stringify(state.posts));renderAll()}
function showView(name){$$('.view').forEach(v=>v.classList.toggle('active',v.id===name+'View'));$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$('#pageTitle').textContent=({dashboard:'Dashboard',calendar:'Calendário',create:'Criar publicação',library:'Biblioteca'})[name]||'';}
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('#newPostBtn').onclick=()=>showView('create');
$$('#typeTabs button').forEach(b=>b.onclick=()=>{state.type=b.dataset.type;$$('#typeTabs button').forEach(x=>x.classList.toggle('active',x===b));$('#storyTools').classList.toggle('hidden',state.type!=='story');updatePreview()});
['caption','hashtags'].forEach(id=>$('#'+id).addEventListener('input',updatePreview));
$('#mediaInput').addEventListener('change',e=>{[...e.target.files].forEach(file=>{const url=URL.createObjectURL(file);state.media.push({url,type:file.type,name:file.name,file});});renderMedia();updatePreview();renderLibrary()});
function renderMedia(){const s=$('#mediaStrip');s.innerHTML='';state.media.forEach((m,i)=>{const wrap=document.createElement('div');wrap.className='media-thumb-wrap';const el=document.createElement(m.type.startsWith('video')?'video':'img');el.src=m.url;el.className='media-thumb';if(el.tagName==='VIDEO')el.muted=true;const x=document.createElement('button');x.className='remove-media';x.textContent='×';x.onclick=()=>{state.media.splice(i,1);renderMedia();updatePreview();renderLibrary()};wrap.append(el,x);s.append(wrap)})}
function updatePreview(){
  const media=$('#previewMedia'),layer=$('#storyStickerLayer');
  [...media.children].forEach(el=>{if(el!==layer)el.remove()});
  if(state.media[0]){
    const m=state.media[0],el=document.createElement(m.type.startsWith('video')?'video':'img');
    el.src=m.url;if(el.tagName==='VIDEO'){el.controls=true;el.muted=true}media.insertBefore(el,layer);
  }else{
    const empty=document.createElement('span');empty.textContent='Sua mídia aparecerá aqui';media.insertBefore(empty,layer);
  }
  $('#previewCaption').textContent=$('#caption').value||'Sua legenda...';
  $('#previewHashtags').textContent=$('#hashtags').value||'';
  const isStory=state.type==='story';
  $('#phonePreview').classList.toggle('story-preview',isStory);
  $('#storyTools').classList.toggle('hidden',!isStory);
  layer.classList.toggle('hidden',!isStory);
  renderStickers();
}
function stickerDefaults(type){
  const base={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),type,x:50,y:55,width:100,height:100,bgColor:'#ffffff',textColor:'#111111',radius:16,fontSize:14,opacity:100};
  if(type==='poll')return{...base,question:'Qual você escolheria hoje?',a:'SIM 🔥',b:'COM CERTEZA 😍'};
  if(type==='link')return{...base,url:$('#link').value||'https://',label:'Saiba mais'};
  if(type==='mention')return{...base,text:'@juniorburgerofc'};
  if(type==='hashtag')return{...base,text:'#juniorburgeroficial'};
  if(type==='location')return{...base,text:$('#location').value||'Junior Burger'};
  return{...base,text:'Digite seu texto'};
}
function addSticker(type){
  const s=stickerDefaults(type);state.stickers.push(s);state.selectedStickerId=s.id;renderStickers();renderStickerEditor();
}
function selectedSticker(){return state.stickers.find(s=>s.id===state.selectedStickerId)||null}
function stickerInner(s){
  if(s.type==='poll')return `<div class="sticker-poll-q">${escapeHtml(s.question||'Enquete')}</div><div class="sticker-poll-options"><span>${escapeHtml(s.a||'SIM')}</span><span>${escapeHtml(s.b||'NÃO')}</span></div>`;
  if(s.type==='link')return `<span class="sticker-icon">🔗</span><span>${escapeHtml(s.label||'Link')}</span>`;
  if(s.type==='mention')return escapeHtml(s.text||'@perfil');
  if(s.type==='hashtag')return escapeHtml(s.text||'#hashtag');
  if(s.type==='location')return `<span class="sticker-icon">📍</span><span>${escapeHtml(s.text||'Localização')}</span>`;
  return escapeHtml(s.text||'Texto');
}
function renderStickers(){
  const layer=$('#storyStickerLayer');if(!layer)return;layer.innerHTML='';
  if(state.type!=='story')return;
  state.stickers.forEach(s=>{
    const el=document.createElement('div');
    el.className=`story-sticker sticker-${s.type} ${s.stylePreset||'ig-white'}${s.id===state.selectedStickerId?' selected':''}`;
    el.dataset.id=s.id;el.style.left=s.x+'%';el.style.top=s.y+'%';el.style.transform='translate(-50%,-50%)';el.style.width=(s.width||100)+'%';el.style.height=(s.height||100)+'%';el.style.setProperty('--sticker-bg',s.bgColor||'#ffffff');el.style.setProperty('--sticker-color',s.textColor||'#111111');el.style.setProperty('--sticker-radius',(s.radius??16)+'px');el.style.setProperty('--sticker-font',(s.fontSize??14)+'px');el.style.opacity=String((s.opacity??100)/100);
    el.innerHTML=stickerInner(s);layer.append(el);
    el.addEventListener('pointerdown',startStickerDrag);
    el.addEventListener('click',e=>{e.stopPropagation();state.selectedStickerId=s.id;renderStickers();renderStickerEditor()});
  });
}
function startStickerDrag(e){
  e.preventDefault();e.stopPropagation();
  const id=e.currentTarget.dataset.id;state.selectedStickerId=id;const s=selectedSticker();if(!s)return;
  const layer=$('#storyStickerLayer'),rect=layer.getBoundingClientRect();
  const move=ev=>{s.x=Math.max(4,Math.min(96,((ev.clientX-rect.left)/rect.width)*100));s.y=Math.max(4,Math.min(96,((ev.clientY-rect.top)/rect.height)*100));renderStickers()};
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);renderStickerEditor()};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
}
function field(label,id,value,placeholder=''){
  return `<label>${label}<input id="${id}" value="${escapeHtml(value||'')}" placeholder="${escapeHtml(placeholder)}"></label>`;
}
function renderStickerEditor(){
  const box=$('#stickerEditor');if(!box)return;const s=selectedSticker();
  if(!s){box.className='sticker-editor empty-sticker-editor';box.innerHTML='Selecione um sticker na prévia para editar.';return}
  box.className='sticker-editor';
  let body=`<div class="sticker-editor-head"><strong>${({poll:'Enquete',link:'Link',mention:'Menção',hashtag:'Hashtag',location:'Localização',text:'Texto'})[s.type]}</strong><button type="button" id="deleteSticker">Excluir</button></div>`;
  if(s.type==='poll')body+=`<div class="interactive-warning"><strong>Enquete votável</strong><span>Para os seguidores votarem de verdade, este Story será parado no horário agendado para você abrir o Instagram e adicionar a enquete oficial antes de publicar.</span></div>`+field('Pergunta','stickerQuestion',s.question,'Sua pergunta')+`<div class="two-col">${field('Opção 1','stickerA',s.a,'SIM')}${field('Opção 2','stickerB',s.b,'NÃO')}</div>`;
  else if(s.type==='link')body+=field('URL','stickerUrl',s.url,'https://...')+field('Texto do botão','stickerLabel',s.label,'Saiba mais');
  else body+=field(s.type==='mention'?'@ Menção':s.type==='hashtag'?'# Hashtag':s.type==='location'?'Localização':'Texto','stickerText',s.text,'');
  body+=`<div class="two-col"><label>Largura <strong id="stickerWidthValue">${Math.round(s.width||100)}%</strong><input id="stickerWidth" type="range" min="12" max="180" step="1" value="${s.width||100}"></label><label>Altura <strong id="stickerHeightValue">${Math.round(s.height||100)}%</strong><input id="stickerHeight" type="range" min="10" max="180" step="1" value="${s.height||100}"></label></div><div class="appearance-title">Estilo do Instagram</div><div class="ig-style-presets"><button type="button" data-style="ig-white">Clássico</button><button type="button" data-style="ig-black">Dark</button><button type="button" data-style="ig-gradient">Gradiente</button><button type="button" data-style="ig-neon">Neon</button><button type="button" data-style="ig-outline">Contorno</button><button type="button" data-style="ig-clear">Sem fundo</button></div><div class="appearance-grid"><label>Cor do fundo<input id="stickerBg" type="color" value="${s.bgColor||'#ffffff'}"></label><label>Cor do texto<input id="stickerColor" type="color" value="${s.textColor||'#111111'}"></label><label>Arredondamento <strong id="stickerRadiusValue">${Math.round(s.radius??16)}px</strong><input id="stickerRadius" type="range" min="0" max="40" step="1" value="${s.radius??16}"></label><label>Tamanho da fonte <strong id="stickerFontValue">${Math.round(s.fontSize??14)}px</strong><input id="stickerFont" type="range" min="8" max="32" step="1" value="${s.fontSize??14}"></label><label>Opacidade <strong id="stickerOpacityValue">${Math.round(s.opacity??100)}%</strong><input id="stickerOpacity" type="range" min="20" max="100" step="1" value="${s.opacity??100}"></label></div><small>Os botões acima imitam os visuais mais usados no Instagram. Você ainda pode ajustar as cores manualmente.</small>`;
  box.innerHTML=body;
  $('#deleteSticker').onclick=()=>{state.stickers=state.stickers.filter(x=>x.id!==s.id);state.selectedStickerId=null;renderStickers();renderStickerEditor()};
  const bind=(id,key)=>{const el=$('#'+id);if(el)el.oninput=()=>{s[key]=el.value;renderStickers()}};
  bind('stickerQuestion','question');bind('stickerA','a');bind('stickerB','b');bind('stickerUrl','url');bind('stickerLabel','label');bind('stickerText','text');
  const width=$('#stickerWidth'),height=$('#stickerHeight');if(width)width.oninput=()=>{s.width=Number(width.value);$('#stickerWidthValue').textContent=Math.round(s.width)+'%';renderStickers()};if(height)height.oninput=()=>{s.height=Number(height.value);$('#stickerHeightValue').textContent=Math.round(s.height)+'%';renderStickers()};const bg=$('#stickerBg'),color=$('#stickerColor'),radius=$('#stickerRadius'),font=$('#stickerFont'),opacity=$('#stickerOpacity');if(bg)bg.oninput=()=>{s.bgColor=bg.value;renderStickers()};if(color)color.oninput=()=>{s.textColor=color.value;renderStickers()};if(radius)radius.oninput=()=>{s.radius=Number(radius.value);$('#stickerRadiusValue').textContent=s.radius+'px';renderStickers()};if(font)font.oninput=()=>{s.fontSize=Number(font.value);$('#stickerFontValue').textContent=s.fontSize+'px';renderStickers()};if(opacity)opacity.oninput=()=>{s.opacity=Number(opacity.value);$('#stickerOpacityValue').textContent=s.opacity+'%';renderStickers()};$('[data-style]').forEach(btn=>btn.onclick=()=>{const p=btn.dataset.style;if(p==='light'){s.bgColor='#ffffff';s.textColor='#111111';s.opacity=100}else if(p==='dark'){s.bgColor='#111111';s.textColor='#ffffff';s.opacity=100}else if(p==='gradient'){s.bgColor='#a142f4';s.textColor='#ffffff';s.opacity=100}else if(p==='clear'){s.bgColor='#ffffff';s.textColor='#ffffff';s.opacity=35}renderStickerEditor();renderStickers()});
}
$$('[data-add-sticker]').forEach(b=>b.addEventListener('click',()=>addSticker(b.dataset.addSticker)));
$('#storyStickerLayer').addEventListener('click',()=>{state.selectedStickerId=null;renderStickers();renderStickerEditor()});
function readFileDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
async function uploadMedia(){if(!state.api)return state.media.map(m=>({name:m.name,type:m.type}));const out=[];for(const m of state.media){if(m.serverUrl){out.push(m);continue}const dataUrl=await readFileDataURL(m.file);out.push(await api('/api/media',{method:'POST',body:JSON.stringify({name:m.name,type:m.type,dataUrl})}))}return out}
async function buildPost(){const date=$('#postDate').value,time=$('#postTime').value,status=$('#postStatus').value;if(!date){toast('Escolha uma data.');return null}if(!state.media.length&&status==='Agendado'){toast('Adicione uma foto ou vídeo.');return null}const media=await uploadMedia();return{type:state.type,caption:$('#caption').value,hashtags:$('#hashtags').value,location:$('#location').value,link:$('#link').value,date,time,status,stickers:state.type==='story'?state.stickers:[],media}}
async function createPost(){try{const p=await buildPost();if(!p)return;if(state.api){const saved=await api('/api/posts',{method:'POST',body:JSON.stringify(p)});state.posts.unshift(saved)}else{p.id=Date.now();state.posts.unshift(p);saveLocal()}renderAll();toast('Publicação salva no horário de Brasília.');showView('calendar')}catch(e){toast(e.message)}}
$('#savePost').onclick=createPost;
$('#clearForm').onclick=()=>{state.media=[];state.stickers=[];state.selectedStickerId=null;renderMedia();['caption','location','link'].forEach(id=>$('#'+id).value='');$('#hashtags').value='#juniorburgeroficial';renderStickerEditor();updatePreview()};
function labelType(t){return({feed:'Feed',carousel:'Carrossel',story:'Story',reel:'Reel'})[t]||t}
function fmtDate(d){if(!d)return'';const [y,m,day]=d.split('-');return `${day}/${m}/${y}`}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function renderDashboard(){const groups={Agendado:0,Rascunho:0,Publicado:0,Erro:0};state.posts.forEach(p=>groups[p.status]=(groups[p.status]||0)+1);$('#statScheduled').textContent=groups.Agendado||0;$('#statDrafts').textContent=groups.Rascunho||0;$('#statPublished').textContent=groups.Publicado||0;$('#statErrors').textContent=groups.Erro||0;const list=$('#upcomingList');const sorted=[...state.posts].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,10);list.classList.toggle('empty-state',!sorted.length);list.innerHTML=sorted.length?'':'Nenhuma publicação agendada.';sorted.forEach(p=>{const d=document.createElement('div');d.className='post-row';d.innerHTML=`<div><strong>${labelType(p.type)} • ${escapeHtml(p.status||'')}</strong><small>${fmtDate(p.date)} ${p.time||''}</small><p>${escapeHtml((p.caption||'Sem legenda').slice(0,80))}</p>${p.lastError?`<div class="post-error">${escapeHtml(p.lastError)}</div>`:''}</div><div class="row-actions">${p.status==='Aguardando Instagram'?'<button data-open-instagram="1">Abrir Instagram</button>':`<button data-pub="${p.id}">Publicar</button>`}<button data-del="${p.id}">Excluir</button></div>`;list.append(d)});$('[data-del]').forEach(b=>b.onclick=()=>deletePost(b.dataset.del));$('[data-pub]').forEach(b=>b.onclick=()=>publishNow(b.dataset.pub));$('[data-open-instagram]').forEach(b=>b.onclick=()=>window.open('https://www.instagram.com/','_blank'))}
async function deletePost(id){try{if(state.api)await api('/api/posts/'+encodeURIComponent(id),{method:'DELETE'});state.posts=state.posts.filter(p=>String(p.id)!==String(id));if(!state.api)saveLocal();renderAll();toast('Post excluído.')}catch(e){toast(e.message)}}
async function publishNow(id){if(!state.api)return toast('Abra pelo servidor para publicar.');try{toast('Enviando para o Instagram...');await api(`/api/posts/${encodeURIComponent(id)}/publish`,{method:'POST'});await loadPosts();toast('Publicado com sucesso.')}catch(e){await loadPosts();toast('Falhou: '+e.message)}}
function renderCalendar(){const y=state.month.getFullYear(),m=state.month.getMonth();$('#calendarTitle').textContent=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(state.month);const grid=$('#calendarGrid');grid.innerHTML='';['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(w=>{const h=document.createElement('div');h.className='weekday';h.textContent=w;grid.append(h)});const first=new Date(y,m,1),start=new Date(y,m,1-first.getDay());for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const cell=document.createElement('div');cell.className='cal-cell'+(d.getMonth()!==m?' muted-day':'');cell.innerHTML=`<div class="cal-day">${d.getDate()}</div>`;state.posts.filter(p=>p.date===iso).forEach(p=>{const e=document.createElement('div');e.className='event '+p.type;e.textContent=`${p.time||''} ${labelType(p.type)}`;cell.append(e)});grid.append(cell)}}
$('#prevMonth').onclick=()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()-1,1);renderCalendar()};
$('#nextMonth').onclick=()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()+1,1);renderCalendar()};
function renderLibrary(){const g=$('#libraryGrid');g.innerHTML='';const all=state.posts.flatMap(p=>p.media||[]);if(!all.length){g.classList.add('empty-state');g.innerHTML='As mídias dos seus posts aparecerão aqui.';return}g.classList.remove('empty-state');all.forEach(m=>{const el=document.createElement(m.type?.startsWith('video')?'video':'img');el.src=m.serverUrl||m.url||'';if(el.tagName==='VIDEO'){el.controls=true;el.muted=true}g.append(el)})}
async function refreshMetaStatus(){if(!state.api){$('#instagramStatus').textContent='Servidor offline';return}try{const s=await api('/api/meta/status');$('#instagramStatus').textContent=s.connected?`Conectado${s.username?' @'+s.username:''}`:(s.configured?'Pronto para conectar':'Falta configurar Meta');$('#instagramButton').textContent=s.connected?'Reconectar Instagram':'Conectar Instagram';if(s.username&&$('#previewUsername'))$('#previewUsername').textContent=s.username;if($('#previewAvatar')){if(s.profilePictureUrl){$('#previewAvatar').innerHTML=`<img src="${s.profilePictureUrl}" alt="Foto do Instagram" referrerpolicy="no-referrer">`}else{$('#previewAvatar').textContent=(s.username||'JB').slice(0,2).toUpperCase()}}}catch(e){$('#instagramStatus').textContent=e.message}}
$('#instagramButton').onclick=async()=>{if(!state.api)return toast('Abra pelo servidor.');try{const d=await api('/api/meta/connect');location.href=d.url}catch(e){toast(e.message)}};
function setToday(){const d=new Date(),iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;$('#postDate').value=iso}
function renderAll(){renderDashboard();renderCalendar();renderLibrary();updatePreview();renderStickerEditor()}
async function enableNotifications(){
  if(!('Notification' in window))return;
  if(Notification.permission==='default'){try{await Notification.requestPermission()}catch{}}
}
let lastManualAlert='';
async function checkManualStories(){
  if(!state.api)return;
  try{
    const posts=await api('/api/posts');
    const waiting=posts.filter(p=>p.status==='Aguardando Instagram');
    if(waiting.length){
      const newest=waiting[0];
      if(lastManualAlert!==newest.id){
        lastManualAlert=newest.id;
        toast('Story pronto: abra o Instagram e adicione a enquete.');
        if('Notification' in window&&Notification.permission==='granted'){
          new Notification('Story pronto para finalizar',{body:'Abra o Instagram, adicione a enquete e publique o Story.'});
        }
      }
    }
  }catch{}
}
setToday();loadPosts();refreshMetaStatus();enableNotifications();checkManualStories();setInterval(checkManualStories,15000);if(new URLSearchParams(location.search).get('instagram')==='connected'){toast('Instagram conectado com sucesso.');history.replaceState({},'',location.pathname)}
