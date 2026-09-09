import './style.css';
import { ModelViewer } from './viewer.js';

const $=selector=>document.querySelector(selector);
const app=$('#app');
const icon=(name)=>({orbit:'↻',pin:'⌖',paint:'◉',undo:'↶',redo:'↷',home:'⌂',trash:'×',send:'↗',check:'✓'}[name]||name);
app.innerHTML=`
<header class="app-header"><div class="brand-mark">◈</div><div class="brand"><strong>形體審閱</strong><span>OpenClaw · 3D Review</span></div><span class="prototype">初版 0.1</span><div class="header-right"><span class="connection-dot"></span><span id="connection-status">連接中</span><button class="quiet" id="help-button" aria-label="使用說明">?</button></div></header>
<main class="workspace">
 <aside class="chat-panel" aria-label="OpenClaw 對話">
  <div class="panel-heading"><div><span class="eyebrow">YOUR CREATIVE PARTNER</span><h1>同一個模型，<br>一齊諗清楚。</h1></div><span class="agent-avatar">P</span></div>
  <div class="chat-context"><span class="tiny-dot"></span>同一個 OpenClaw 會話<span id="agent-activity"></span></div>
  <div id="chat-messages" class="chat-messages" aria-live="polite"><div class="welcome"><span class="eyebrow">由位置，講到想法。</span><p>喺右邊落標籤或者塗選，<br>再交畀 Agent。你可以喺呢度<br>講「一號收幼啲，二號唔好郁」。</p><div class="welcome-steps"><span>01 標記</span><span>02 提交</span><span>03 講點改</span></div></div></div>
  <div id="chat-error" class="inline-error" hidden></div>
  <form id="chat-form" class="chat-composer"><label class="sr-only" for="chat-input">修改說明</label><textarea id="chat-input" rows="3" placeholder="講講你想點改…" maxlength="12000"></textarea><div class="composer-footer"><span>文字即可，不需要開語音</span><button id="chat-send" aria-label="發送修改說明" type="submit">${icon('send')}</button></div></form>
 </aside>
 <section class="review-panel" aria-label="模型審閱">
  <div class="model-heading"><div><span class="eyebrow">CURRENT MODEL</span><h2 id="model-name">等候 Agent 交付模型</h2></div><div class="model-meta"><span class="version-chip" id="model-version">—</span><span id="save-status">準備中</span></div></div>
  <div class="viewer-shell">
   <div id="viewer"></div>
   <div class="viewer-top"><span class="scene-pill" id="review-status">載入模型</span><span class="scene-pill subtle" id="model-info"></span></div>
   <div class="toolbar" role="toolbar" aria-label="模型操作工具">
    <button data-mode="orbit" class="tool active" title="旋轉／移動" aria-label="旋轉模式">${icon('orbit')}<span>檢視</span></button>
    <button data-mode="pin" class="tool" title="點擊表面放標籤" aria-label="點標籤模式">${icon('pin')}<span>標籤</span></button>
    <button data-mode="paint" class="tool" title="畫筆只標可見表面" aria-label="畫筆模式">${icon('paint')}<span>畫筆</span></button>
    <div class="tool-divider"></div><button class="tool small" id="undo" title="撤銷 Ctrl/⌘ Z" aria-label="撤銷">${icon('undo')}</button><button class="tool small" id="redo" title="重做" aria-label="重做">${icon('redo')}</button><button class="tool small" id="home-view" title="回到預設視角" aria-label="重設視角">${icon('home')}</button>
   </div>
   <div id="tool-options" class="tool-options" hidden><div class="palette" role="group" aria-label="標注顏色"></div><label id="radius-control">大小 <input id="brush-size" type="range" min="6" max="60" value="22" aria-label="畫筆大小"></label><label id="label-control">編號 <select id="label-style" aria-label="標籤編號方式"><option value="numbers">1, 2, 3</option><option value="letters">A, B, C</option></select></label><button class="quiet-dark" id="new-region">＋ 新區域</button></div>
   <aside class="annotations-panel"><div class="annotations-heading"><strong>本輪標記 <span id="annotation-count">0</span></strong><button id="toggle-annotations" class="quiet-dark" aria-label="收合標記列表">−</button></div><div id="annotations-list"><div class="annotation-empty">將想改嘅位置<br>標記喺模型上。</div></div></aside>
   <div id="loading" class="loading-overlay"><div class="spinner"></div><strong id="loading-text">準備審閱空間</strong><span>模型載入完成後就可以開始標記</span></div>
   <div class="viewer-bottom"><span id="tool-hint">左鍵旋轉 · 右鍵平移 · 滾輪縮放</span><span class="axis-label">3D SPACE</span></div>
  </div>
  <div id="pending-banner" class="pending-banner" hidden><span>新模型已準備好，暫時唔會更換你正標記嘅版本。</span></div>
  <div id="resume-banner" class="pending-banner" hidden><span>另一個視窗持有審閱草稿。</span><button id="resume-review" class="quiet">接續已保存草稿</button></div>
  <footer class="review-footer"><div class="submission-status"><span id="feedback-status">標注會附帶三維位置及當前版本</span><a id="download-feedback" hidden>下載標注</a></div><button id="finish-review" class="secondary-button" disabled>結束本輪審閱</button><button id="submit-feedback" class="primary-button" disabled>交畀 Agent ${icon('send')}</button></footer>
 </section>
</main><div id="toast" role="status" hidden></div>
<dialog id="help-dialog"><button id="close-help" class="dialog-close" aria-label="關閉">×</button><span class="eyebrow">QUICK START</span><h2>睇、標記，再講點改。</h2><p>檢視模式：左鍵旋轉，右鍵平移，滾輪縮放。</p><p>標籤：點模型表面，放上數字或字母。畫筆：只塗選目前睇到嘅表面；轉動模型可以繼續標另一面。</p><p>一個標籤或一片區域對應一個編號。想分開另一個要求，撳「新區域」。可以撤銷、重做，亦可以刪除個別標記。</p><p>「交畀 Agent」保存並提交標記。喺左邊講修改要求；Agent 未明白就會問清楚。提交本身唔會自動改模型。</p><p>標注期間模型會鎖住。完成本輪、標記已提交後，撳「結束本輪審閱」，Agent 才可以交付新版。草稿會自動保存。</p><p class="muted">初版：GLB／STL，最多 80 MB、60 萬面。動畫、骨架及壓縮 GLB 暫未支援。這是審閱工具，唔會直接雕刻模型。</p></dialog>`;

const base=new URL('./',location.href);
const endpoint=path=>new URL(path,base).href;
const clientId=sessionStorage.getItem('3d-review-client')||crypto.randomUUID();sessionStorage.setItem('3d-review-client',clientId);
const colors=['#e76d5c','#e6b64b','#6ab398','#629bd8','#ae82ce'];let color=colors[0];
let state=null,loadedId=null,annotations=[],selectedId=null,mode='orbit',revision=0,editSeq=0,savedSeq=0;
let saveFlight=null,saveTimer=null,renderFrame=null,loadFlight=null,beginFlight=null,submissionKey=null,submitting=false;
let undoStack=[],redoStack=[],lastChatSignature='',optimistic=[],initialDraftRestored=false;
let pendingChat=null;try{pendingChat=JSON.parse(sessionStorage.getItem('3d-review-chat-outbox'));if(pendingChat?.text)$('#chat-input').value=pendingChat.text;}catch{}
const clone=x=>structuredClone(x);
async function api(path,data,method='POST'){
  const options=data===undefined?{}:{method,headers:{'Content-Type':'application/json','X-Review-Client':'1'},body:JSON.stringify(data)};
  const res=await fetch(endpoint(`api/${path}`),options);let json;try{json=await res.json();}catch{throw new Error('服務連線中斷，草稿仍會保留。');}
  if(!res.ok){const err=new Error(json.error||'操作未完成。');err.code=json.code;throw err;}return json;
}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,6500);}
function owner(){return {versionId:loadedId,clientId};}
function draftKey(){return `3d-review-draft-${loadedId}`;}
function cacheDraft(){try{localStorage.setItem(draftKey(),JSON.stringify({annotations,revision,dirty:editSeq>savedSeq,camera:viewer.cameraState()}));}catch{toast('本機暫存空間不足；請保持頁面開啟，等伺服器保存。');}}
function historyPush(){undoStack.push(JSON.stringify(annotations));while(undoStack.length>20||undoStack.reduce((n,x)=>n+x.length,0)>8_000_000)undoStack.shift();redoStack=[];}
function nextLabel(){const used=new Set(annotations.map(a=>a.label));for(let n=1;n<=1000;n++){let label=String(n);if($('#label-style').value==='letters'){label='';let v=n;while(v){v--;label=String.fromCharCode(65+v%26)+label;v=Math.floor(v/26);}}if(!used.has(label))return label;}}
function changed(){editSeq++;submissionKey=null;cacheDraft();renderAnnotations();$('#save-status').textContent='保存中…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>flushDraft().catch(e=>toast(e.message)),500);updateButtons();}
async function beginEdit(){
  if(!loadedId||!viewer.enabled||submitting)return false;
  if(beginFlight)return beginFlight;
  beginFlight=(async()=>{const result=await api('review/begin',owner());state={...state,...result};historyPush();updateButtons();return true;})();
  try{return await beginFlight;}finally{beginFlight=null;}
}
function onPin(pin){if(annotations.length>=200)return toast('本輪最多 200 個標記。');const item={id:crypto.randomUUID(),type:'pin',label:nextLabel(),color,...pin};annotations.push(item);selectedId=item.id;changed();}
function onPaint(faces){
  const existing=annotations.filter(a=>a.type==='region').reduce((n,a)=>n+Object.values(a.faces).reduce((m,f)=>m+f.length,0),0);
  if(existing+Object.values(faces).reduce((n,f)=>n+f.length,0)>20000){toast('本輪標注接近上限，請先完成並提交呢一批。');return;}
  let region=annotations.find(a=>a.id===selectedId&&a.type==='region'&&a.color===color);
  if(!region){if(annotations.length>=200)return;region={id:crypto.randomUUID(),type:'region',label:nextLabel(),color,faces:{}};annotations.push(region);selectedId=region.id;}
  let added=false;for(const [meshId,ids]of Object.entries(faces)){const set=new Set(region.faces[meshId]||[]);const before=set.size;for(const id of ids)set.add(id);if(set.size!==before)added=true;region.faces[meshId]=[...set].sort((a,b)=>a-b);}
  if(added)changed();
}
const viewer=new ModelViewer($('#viewer'),{onReady:data=>api('ready',{...owner(),...data}),onEdit:beginEdit,onPin,onPaint,onStrokeEnd:()=>{clearTimeout(saveTimer);flushDraft().catch(e=>toast(e.message));},onError:toast});
viewer.onSelect=id=>{selectedId=id;renderAnnotations();};viewer.setRadius(22);

async function flushDraft(){
  if(saveFlight){await saveFlight;if(editSeq>savedSeq)return flushDraft();return;}
  if(editSeq===savedSeq||!loadedId)return;
  const seq=editSeq,modelId=loadedId,payload={...owner(),revision,annotations:viewer.serializeAnnotations(annotations),camera:viewer.cameraState()};
  saveFlight=(async()=>{
    try{
      const draft=await api('draft',payload,'PUT');
      if(loadedId!==modelId)return;
      revision=draft.revision;savedSeq=seq;state.draft={...draft,annotations:undefined,annotationCount:annotations.length};cacheDraft();$('#save-status').textContent=editSeq===savedSeq?'草稿已保存':'保存中…';
    }catch(e){$('#save-status').textContent='未同步 · 草稿仍在本機';throw e;}
    finally{saveFlight=null;updateButtons();}
  })();
  await saveFlight;if(editSeq>savedSeq)return flushDraft();
}
function updateButtons(){
  const ready=!!loadedId&&viewer.enabled,foreign=state?.locked&&!state?.owned;
  $('#submit-feedback').disabled=!ready||foreign||!annotations.length||submitting;
  $('#finish-review').disabled=!ready||!state?.owned||editSeq!==savedSeq||submitting||!!saveFlight||(annotations.length>0&&state?.draft?.submittedRevision!==revision);
  $('#undo').disabled=!undoStack.length||foreign||submitting;$('#redo').disabled=!redoStack.length||foreign||submitting;
  $('#review-status').textContent=state?.locked?(state.owned?'審閱中 · 模型已鎖定':'其他視窗審閱中'):'目前版本 · 可以開始標記';
  $('#pending-banner').hidden=!state?.pending;$('#resume-banner').hidden=!foreign;
  document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=!ready||foreign||submitting);
}
function renderAnnotations(){
  if(renderFrame)return;
  renderFrame=requestAnimationFrame(()=>{
    renderFrame=null;viewer.setAnnotations(annotations,selectedId);$('#annotation-count').textContent=annotations.length;
    const list=$('#annotations-list');list.replaceChildren();
    if(!annotations.length){const div=document.createElement('div');div.className='annotation-empty';div.textContent='將想改嘅位置\n標記喺模型上。';list.append(div);}
    for(const a of annotations){
      const row=document.createElement('div');row.className=`annotation-row ${a.id===selectedId?'selected':''}`;row.dataset.annotationId=a.id;
      const select=document.createElement('button');select.className='annotation-select';
      const badge=document.createElement('span');badge.className='annotation-badge';badge.style.background=a.color;badge.textContent=a.label;
      const text=document.createElement('span');const title=document.createElement('strong');title.textContent=a.type==='pin'?'點標籤':'塗選區域';const detail=document.createElement('small');detail.textContent=a.type==='pin'?'已固定在模型表面':`${Object.values(a.faces).reduce((n,x)=>n+x.length,0).toLocaleString()} 個三角面`;
      text.append(title,detail);select.append(badge,text);select.addEventListener('click',()=>{selectedId=a.id;color=a.color;updatePalette();viewer.focusAnnotation(a);renderAnnotations();});
      const remove=document.createElement('button');remove.className='delete-annotation';remove.textContent='×';remove.setAttribute('aria-label',`刪除標記 ${a.label}`);remove.disabled=!!(state?.locked&&!state?.owned)||submitting;
      remove.addEventListener('click',async()=>{try{if(!await beginEdit())return;annotations=annotations.filter(x=>x.id!==a.id);if(selectedId===a.id)selectedId=null;changed();await flushDraft();}catch(e){toast(e.message);}});
      row.append(select,remove);list.append(row);
    }
  });
}
function setMode(next){mode=next;viewer.setMode(next);document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));$('#tool-options').hidden=next==='orbit';$('#radius-control').hidden=next!=='paint';$('#new-region').hidden=next!=='paint';$('#tool-hint').textContent=next==='paint'?'只塗可見表面 · 右鍵平移 · 切回檢視可旋轉':next==='pin'?'點模型表面落標籤 · 標籤會跟隨模型':'左鍵旋轉 · 右鍵平移 · 滾輪縮放';}
function updatePalette(){document.querySelectorAll('.color-button').forEach(b=>b.classList.toggle('active',b.dataset.color===color));}
for(const c of colors){const b=document.createElement('button');b.className='color-button';b.dataset.color=c;b.style.background=c;b.setAttribute('aria-label',`選擇顏色 ${c}`);b.addEventListener('click',()=>{color=c;updatePalette();});$('.palette').append(b);}updatePalette();
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('#brush-size').addEventListener('input',e=>viewer.setRadius(Number(e.target.value)));
$('#home-view').addEventListener('click',()=>viewer.home());
$('#new-region').addEventListener('click',()=>{selectedId=null;renderAnnotations();setMode('paint');toast('下一筆會建立獨立編號嘅新區域。');});
$('#toggle-annotations').addEventListener('click',()=>{$('#annotations-list').hidden=!$('#annotations-list').hidden;$('#toggle-annotations').textContent=$('#annotations-list').hidden?'+':'−';});
async function travelHistory(redo=false){const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack;if(!from.length)return;try{const savedUndo=[...undoStack],savedRedo=[...redoStack];if(!await beginEdit())return;undoStack=savedUndo;redoStack=savedRedo;const actualFrom=redo?redoStack:undoStack,actualTo=redo?undoStack:redoStack;actualTo.push(JSON.stringify(annotations));annotations=JSON.parse(actualFrom.pop());selectedId=null;changed();await flushDraft();}catch(e){toast(e.message);}}
$('#undo').addEventListener('click',()=>travelHistory());$('#redo').addEventListener('click',()=>travelHistory(true));
window.addEventListener('keydown',e=>{if(['TEXTAREA','INPUT','SELECT'].includes(document.activeElement?.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();travelHistory(e.shiftKey);}});
$('#help-button').addEventListener('click',()=>$('#help-dialog').showModal());$('#close-help').addEventListener('click',()=>$('#help-dialog').close());

async function loadActive(fullState){
  const model=fullState.active;if(!model)return;
  loadedId=model.id;initialDraftRestored=false;annotations=[];selectedId=null;revision=0;editSeq=0;savedSeq=0;undoStack=[];redoStack=[];submissionKey=null;
  $('#model-name').textContent=model.name;$('#model-version').textContent=model.version;$('#model-info').textContent=`${model.format.toUpperCase()} · ${model.units}`;
  $('#loading').hidden=false;$('#loading-text').textContent='載入並核對模型版本';$('#save-status').textContent='核對中…';
  try{
    const stats=await viewer.load(model,endpoint(`api/models/${model.filename}`));
    if(!stats)return;
    $('#model-info').textContent=`${model.triangles.toLocaleString()} 面 · ${model.format.toUpperCase()} · ${model.units}`;
    const d=fullState.draft;annotations=clone(d?.annotations||[]);revision=d?.revision||0;
    let cached;try{cached=JSON.parse(localStorage.getItem(draftKey()));}catch{}
    if(cached?.dirty){
      if(cached.revision===revision&&(!state.locked||state.owned)){await api('review/begin',owner());annotations=cached.annotations;viewer.restoreCamera(cached.camera);editSeq=1;state.locked=true;state.owned=true;toast('已恢復上次未同步嘅草稿。');}
      else toast('本機另有草稿備份，未覆蓋伺服器版本。請保留此頁並聯絡 Agent 處理。');
    }else if(d?.camera)viewer.restoreCamera(d.camera);
    initialDraftRestored=true;renderAnnotations();$('#loading').hidden=true;$('#save-status').textContent=editSeq>savedSeq?'恢復草稿中…':annotations.length?'草稿已保存':'未開始標記';updateButtons();
    if(editSeq>savedSeq)await flushDraft();
  }catch(e){$('#loading-text').textContent=e.message;$('#loading .spinner').hidden=true;toast(e.message);}
}
async function pollState(){
  try{
    const incoming=await api(`state?clientId=${encodeURIComponent(clientId)}`);
    if(loadFlight)return;
    if(incoming.active?.id!==loadedId){
      if(loadedId&&editSeq>savedSeq){toast('偵測到版本不同，已保留當前草稿，停止自動換版。');return;}
      const full=await api(`state?clientId=${encodeURIComponent(clientId)}&full=1`);state=full;
      if(full.active){loadFlight=loadActive(full);await loadFlight;loadFlight=null;}
      else{$('#loading-text').textContent='等候 Agent 交付第一個模型';$('#loading .spinner').hidden=true;}
    }else state=incoming;
    updateButtons();
  }catch(e){$('#save-status').textContent='服務暫時離線';}
}
$('#submit-feedback').addEventListener('click',async()=>{
  if(submitting)return;submitting=true;updateButtons();$('#submit-feedback').textContent='提交中…';
  try{
    await flushDraft();submissionKey ||=state?.submissions?.findLast(s=>s.versionId===loadedId&&s.revision===revision)?.id||crypto.randomUUID();
    const result=await api('feedback',{...owner(),revision,submissionId:submissionKey});
    state.draft={...state.draft,submittedRevision:revision};
    $('#feedback-status').textContent='已交到會話，等候 Agent 回覆；可以喺左邊補充修改要求。';
    $('#download-feedback').href=endpoint(`api/submissions/${result.id}`);$('#download-feedback').hidden=false;
    toast('標記已提交到 OpenClaw 會話，模型仍然鎖定。');pollChat();
  }catch(e){$('#feedback-status').textContent=e.message;toast(e.message);}
  finally{submitting=false;$('#submit-feedback').textContent='交畀 Agent ↗';updateButtons();}
});
$('#finish-review').addEventListener('click',async()=>{try{await flushDraft();state=await api('review/finish',owner());toast('本輪審閱已結束，已提交標記仍有保存。');await pollState();}catch(e){toast(e.message);}});
$('#resume-review').addEventListener('click',async()=>{try{state=await api('review/resume',owner());annotations=clone(state.draft?.annotations||[]);revision=state.draft?.revision||0;editSeq=0;savedSeq=0;renderAnnotations();updateButtons();toast('已接續原有草稿。');}catch(e){toast(e.message);}});

function displayText(m){let text=m.text;const input=text.match(/<input>([\s\S]*?)<\/input>/);if(input)return input[1];if(text.startsWith('[3D 審閱標記提交'))return text.split('\n\n')[0].replace(/^\[3D 審閱標記提交[^\]]*\]/,'已提交一批三維標記');return text.split('\n\n[3D 工作台上下文：')[0];}
function renderChat(messages){
  const signature=JSON.stringify(messages.map(m=>[m.id,m.text]));if(signature===lastChatSignature)return;lastChatSignature=signature;
  const box=$('#chat-messages'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<100;
  if(!messages.length)return;box.replaceChildren();
  for(const m of messages){const div=document.createElement('div');div.className=`chat-message ${m.role}`;const name=document.createElement('span');name.className='chat-speaker';name.textContent=m.role==='user'?'你':'POP · OpenClaw';const p=document.createElement('div');p.className='message-text';p.textContent=displayText(m);div.append(name,p);box.append(div);}
  if(nearBottom)box.scrollTop=box.scrollHeight;
}
async function pollChat(){try{const data=await api('chat');$('.connection-dot').classList.toggle('online',data.connected);$('#connection-status').textContent=data.connected?'OpenClaw 已連接':'離線 · 草稿保留';$('#agent-activity').textContent=data.busy?'處理中':'';const messages=data.messages||[];optimistic=optimistic.filter(o=>!messages.some(m=>m.role==='user'&&displayText(m)===o.text));renderChat([...messages,...optimistic]);}catch{$('#connection-status').textContent='連線暫停';$('.connection-dot').classList.remove('online');}}
$('#chat-form').addEventListener('submit',async e=>{
  e.preventDefault();const text=$('#chat-input').value.trim();if(!text)return;$('#chat-send').disabled=true;$('#chat-error').hidden=true;
  if(pendingChat?.text!==text)pendingChat={messageId:crypto.randomUUID(),text};
  const {messageId}=pendingChat;sessionStorage.setItem('3d-review-chat-outbox',JSON.stringify(pendingChat));
  try{await api('chat',{message:text,messageId});optimistic.push({id:messageId,role:'user',text});$('#chat-input').value='';pendingChat=null;sessionStorage.removeItem('3d-review-chat-outbox');await pollChat();}
  catch(e){$('#chat-error').textContent='尚未確認送達，文字仍保留喺輸入框。請先查看原會話再決定重試。';$('#chat-error').hidden=false;}
  finally{$('#chat-send').disabled=false;}
});
window.addEventListener('beforeunload',e=>{if(editSeq>savedSeq){cacheDraft();e.preventDefault();e.returnValue='';}});
await pollState();pollChat();setInterval(pollState,2200);setInterval(pollChat,5000);setInterval(()=>{if(state?.owned)api('review/heartbeat',{clientId}).catch(()=>{});},10000);

// Read-only diagnostics for browser acceptance checks; never mutate review state.
window.__reviewDiagnostics=()=>({versionId:loadedId,revision,annotationCount:annotations.length,dirty:editSeq>savedSeq,annotations:viewer.serializeAnnotations(annotations),camera:viewer.cameraState(),viewer:viewer.stats(),locked:state?.locked,owned:state?.owned});
