(function(){
"use strict";
var REGISTRY_KEY="worksdb-registry-v1";
var DEFAULT_DB={id:"current-dashboard",name:"FMシアター『キムチの嫌いな俺』",type:"劇伴制作管理",status:"稼働中",owner:"堀本陸",color:"#ffb347",url:"",note:"楽曲ステータス、詳細メモ、AI要約、ガント、Google Sheets同期を備えた現在の制作管理DB。",self:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
var MASTER_KEY="worksdb-master-v1";
var ARCHIVED_PROJECT_IDS={"current-dashboard":true};
var ARCHIVED_PROJECT_NAME="FMシアター『キムチの嫌いな俺』";
function regIsArchivedProject(entry){return !!(entry&&(ARCHIVED_PROJECT_IDS[entry.id]||entry.name===ARCHIVED_PROJECT_NAME))}
var registry={entries:[]},registryQuery="",registryFilter="all",PROJECT_DASHBOARD_TITLE=document.title;
var masterSettings={spreadsheetId:"",spreadsheetUrl:"",webAppUrl:"",connected:false},masterSyncing=false;
function regEl(id){return document.getElementById(id)}
function regEsc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function regId(){return"db-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7)}
function regColor(value){return/^#[0-9a-f]{6}$/i.test(value||"")?value:"#6fd6ff"}
function regHref(entry){
  if (!entry) return "";
  var rawUrl = typeof entry === "string" ? entry : (entry.url || entry.webAppUrl || "");
  if (rawUrl) {
    try {
      var u = new URL(rawUrl.trim(), window.location.href);
      if (/^(https?:|file:)$/.test(u.protocol)) return u.href;
    } catch(e){}
  }
  if (entry.spreadsheetId) {
    return "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(entry.spreadsheetId) + "/edit";
  }
  if (entry && entry.id && !entry.self) {
    return "ScheduleBoard.html?project=" + encodeURIComponent(entry.id);
  }
  return "";
}

function regLoad(){
  var saved=null;
  try{saved=JSON.parse(localStorage.getItem(REGISTRY_KEY))}catch(e){}
  var entries=saved&&Array.isArray(saved.entries)?saved.entries.filter(function(x){return x&&typeof x==="object"&&!regIsArchivedProject(x)}):[];
  registry={entries:entries};

  regSave();
}
function regSave(message){try{localStorage.setItem(REGISTRY_KEY,JSON.stringify(registry))}catch(e){}if(message)regToast(message)}
function regToast(message){var node=regEl("registry-toast");node.textContent=message;node.hidden=false;clearTimeout(regToast.timer);regToast.timer=setTimeout(function(){node.hidden=true},2200)}
function masterExtractSheetId(value){var text=String(value||"").trim(),match=text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);return match?match[1]:(/^[a-zA-Z0-9_-]{20,}$/.test(text)?text:"")}
function regSheetUrl(id){return id?"https://docs.google.com/spreadsheets/d/"+encodeURIComponent(id)+"/edit":""}
function regProjectFormData(form){
  var data=Object.fromEntries(new FormData(form).entries());
  var progressRaw=String(data.spreadsheetUrl||"").trim();
  var progressId=masterExtractSheetId(progressRaw);
  var scheduleRaw=String(data.scheduleSpreadsheetUrl||"").trim();
  var scheduleId=masterExtractSheetId(scheduleRaw)||progressId;
  data.spreadsheetId=progressId;
  data.spreadsheetUrl=progressId?regSheetUrl(progressId):progressRaw;
  data.scheduleSpreadsheetId=scheduleId;
  data.scheduleSpreadsheetUrl=scheduleId?regSheetUrl(scheduleId):scheduleRaw;
  data.sheetGid=Math.max(0,parseInt(data.sheetGid,10)||0);
  data.scheduleGid=Math.max(0,parseInt(data.scheduleGid,10)||0);
  data.trackSheetName=String(data.trackSheetName||"").trim()||"進捗管理";
  data.scheduleSheetName=String(data.scheduleSheetName||"").trim()||"制作スケジュール";
  data.webAppUrl=String(data.webAppUrl||"").trim();
  return data
}
function regProjectFormView(entry){
  var view=Object.assign({},entry||{});
  view.spreadsheetUrl=view.spreadsheetUrl||view.spreadsheetId||"";
  view.scheduleSpreadsheetUrl=view.scheduleSpreadsheetUrl||view.scheduleSpreadsheetId||"";
  view.trackSheetName=view.trackSheetName||(view.bridge&&view.bridge.trackSheetName)||"進捗管理";
  view.scheduleSheetName=view.scheduleSheetName||(view.bridge&&view.bridge.scheduleSheetName)||"制作スケジュール";
  if(view.scheduleGid==null&&view.bridge)view.scheduleGid=view.bridge.scheduleSheetGid;
  return view
}
function masterLoadSettings(){try{var saved=JSON.parse(localStorage.getItem(MASTER_KEY));if(saved&&typeof saved==="object")masterSettings=Object.assign(masterSettings,saved)}catch(e){}masterUpdateUi()}
function masterPersist(){try{localStorage.setItem(MASTER_KEY,JSON.stringify(masterSettings))}catch(e){}masterUpdateUi()}
function masterConnected(){return !!String(masterSettings.webAppUrl||"").trim()}
function masterUpdateUi(message,isError){
  var button=regEl("master-status-btn"),state=regEl("master-connection-state"),link=regEl("master-open-sheet");
  if(button){button.textContent=masterSyncing?"管理シート: 同期中…":(masterConnected()?"管理シート: 接続済み":"管理シート: ローカル");button.classList.toggle("studio-btn--cyan",masterConnected())}
  if(state){state.innerHTML='<strong>'+(isError?'同期できません':(masterConnected()?'管理シートに接続済み':'現在はローカル保存です'))+'</strong>'+regEsc(message||(masterConnected()?'案件マスターを正本として使用します。':'URLを保存すると案件マスターを正本として同期します。'))}
  if(link){var id=masterSettings.spreadsheetId||masterExtractSheetId(masterSettings.spreadsheetUrl);link.hidden=!id;if(id)link.href="https://docs.google.com/spreadsheets/d/"+encodeURIComponent(id)+"/edit"}
}
function masterApiUrl(action,params){var base=String(masterSettings.webAppUrl||"").trim(),url=base+(base.indexOf("?")>=0?"&":"?")+"action="+encodeURIComponent(action);Object.keys(params||{}).forEach(function(key){if(params[key]!=null&&params[key]!=="")url+="&"+encodeURIComponent(key)+"="+encodeURIComponent(params[key])});return url}
function masterGet(action,params){return fetch(masterApiUrl(action,params),{cache:"no-store",redirect:"follow"}).then(function(res){if(!res.ok)throw new Error("HTTP "+res.status);return res.json()}).then(function(data){if(!data||!data.ok)throw new Error(data&&data.error||"管理シート応答エラー");return data})}
function masterPost(action,payload){var body=Object.assign({action:action},payload||{});return fetch(masterSettings.webAppUrl,{method:"POST",cache:"no-store",redirect:"follow",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body)}).then(function(res){if(!res.ok)throw new Error("HTTP "+res.status);return res.json()}).then(function(data){if(!data||!data.ok)throw new Error(data&&data.error||"管理シート応答エラー");return data})}
function masterNormalizeEntry(item){var entry=Object.assign({},item||{});entry.id=entry.id||regId();entry.name=entry.name||"名称未設定";entry.status=entry.status||"準備中";entry.color=entry.color||"#6fd6ff";entry.self=entry.id===DEFAULT_DB.id;entry.webAppUrl=entry.webAppUrl||masterSettings.webAppUrl||"";return entry}
async function masterSyncFromSheet(showToast){
  if(!masterConnected())return false;
  masterSyncing=true;masterUpdateUi("案件一覧を読み込んでいます。");
  try{
    var data=await masterGet("list_projects");
    if(data.spreadsheetId)masterSettings.spreadsheetId=data.spreadsheetId;
    if(data.spreadsheetUrl)masterSettings.spreadsheetUrl=data.spreadsheetUrl;
    var archivedFromMaster=Array.isArray(data.projects)?data.projects.filter(regIsArchivedProject):[];
    archivedFromMaster.forEach(function(x){masterPost("archive_project",{projectId:x.id}).catch(function(){})});
    if(Array.isArray(data.projects)){registry={entries:data.projects.filter(function(x){return !regIsArchivedProject(x)}).map(masterNormalizeEntry)};regSave();regRender()}
    masterSettings.connected=true;masterSettings.lastSync=data.syncedAt||new Date().toISOString();masterPersist();masterUpdateUi((data.projects||[]).length+"件を同期しました。");
    if(showToast)regToast("管理シートから案件一覧を同期しました");
    masterApplyRoute();return true;
  }catch(err){masterSettings.connected=false;masterPersist();masterUpdateUi(String(err.message||err),true);if(showToast)regToast("管理シートに接続できません。ローカル一覧を表示します");return false}
  finally{masterSyncing=false;masterUpdateUi()}
}
async function masterSyncEntry(entry,createNew){
  if(!masterConnected())return entry;
  var data=await masterPost(createNew?"create_project":"upsert_project",{project:entry});
  var saved=masterNormalizeEntry(data.project||entry),index=registry.entries.findIndex(function(x){return x.id===entry.id});
  if(index>=0)registry.entries[index]=saved;else registry.entries.unshift(saved);
  regSave();return saved
}
async function masterUploadAll(){
  if(!masterConnected()){regToast("先に管理WebアプリURLを保存してください");return}
  masterSyncing=true;masterUpdateUi("現在の一覧を送信しています。");
  try{for(var i=0;i<registry.entries.length;i++)await masterPost("upsert_project",{project:registry.entries[i]});await masterSyncFromSheet(false);regToast("現在の案件一覧を管理シートへ送りました")}
  catch(err){masterUpdateUi(String(err.message||err),true);regToast("管理シートへの送信に失敗しました")}
  finally{masterSyncing=false;masterUpdateUi()}
}
function masterOpen(){masterLoadSettings();regEl("master-spreadsheet-id").value=masterSettings.spreadsheetUrl||masterSettings.spreadsheetId||"";regEl("master-webapp-url").value=masterSettings.webAppUrl||"";regEl("master-dialog").showModal()}
function masterClose(){var dialog=regEl("master-dialog");if(dialog&&dialog.open)dialog.close()}
async function masterCopy(){var output=regEl("master-code-output"),ok=false;try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(output.value);ok=true}}catch(e){}if(!ok){output.focus();output.select();ok=document.execCommand("copy")}if(ok){regEl("master-copy-state").hidden=false;setTimeout(function(){regEl("master-copy-state").hidden=true},1800);regToast("管理用Code.gsをコピーしました")}}
function masterLoadCode(){
  var output=regEl("master-code-output");
  if(!output)return Promise.resolve("");
  return fetch("gas/Code.gs",{cache:"no-store"})
    .then(function(res){if(!res.ok)throw new Error("HTTP "+res.status);return res.text()})
    .then(function(code){output.value=code;return code})
    .catch(function(){output.value="Code.gsを読み込めませんでした。READMEの手順どおりローカルHTTPサーバーから開いてください。";return""});
}
function regRouteId(){try{return new URL(window.location.href).searchParams.get("project")||""}catch(e){return""}}
function regSetRoute(id){try{var url=new URL(window.location.href);if(id)url.searchParams.set("project",id);else url.searchParams.delete("project");history.replaceState({project:id||""},"",url.href)}catch(e){}}
function masterApplyRoute(){var id=regRouteId(),entry=id&&regFind(id);if(entry)regShowProject(entry,true)}
function regStats(){regEl("registry-total").textContent=registry.entries.length;regEl("registry-active").textContent=registry.entries.filter(function(x){return x.status==="稼働中"}).length;regEl("registry-done").textContent=registry.entries.filter(function(x){return x.status==="完了"}).length}
function switchScheduleTab(mode) {
  var ganttView = document.getElementById("view-gantt-container");
  var boardView = document.getElementById("view-board-container");
  var ganttTabBtn = document.getElementById("tab-btn-gantt");
  var boardTabBtn = document.getElementById("tab-btn-board");

  if (mode === "board") {
    if (ganttView) ganttView.classList.add("hidden");
    if (boardView) boardView.classList.remove("hidden");
    if (ganttTabBtn) { ganttTabBtn.classList.remove("is-active"); ganttTabBtn.className = "studio-btn studio-btn--ghost"; }
    if (boardTabBtn) { boardTabBtn.classList.add("is-active"); boardTabBtn.className = "studio-btn studio-btn--cyan is-active"; }
    if (window.WorksDBDashboard && typeof window.WorksDBDashboard.renderNativeScheduleBoard === "function") {
      window.WorksDBDashboard.renderNativeScheduleBoard();
    }
  } else {
    if (ganttView) ganttView.classList.remove("hidden");
    if (boardView) boardView.classList.add("hidden");
    if (ganttTabBtn) { ganttTabBtn.classList.add("is-active"); ganttTabBtn.className = "studio-btn studio-btn--cyan is-active"; }
    if (boardTabBtn) { boardTabBtn.classList.remove("is-active"); boardTabBtn.className = "studio-btn studio-btn--ghost"; }
  }
}

function filterScheduleBoardIframe(projectRef) {
  switchScheduleTab("board");
  var entry=projectRef&&typeof projectRef==="object"?projectRef:(projectRef?regFind(projectRef):null);
  var projectId=entry?entry.id:"";
  var projectName=entry?entry.name:(typeof projectRef==="string"?projectRef:"");
  var title = document.getElementById("schedule-board-panel-title");
  var openNewTabBtn = document.getElementById("btn-open-schedule-newtab");
  if (projectName) {
    if (title) title.textContent = "制作スケジュール（" + projectName + "）";
    if (openNewTabBtn) openNewTabBtn.href = "ScheduleBoard.html?project=" + encodeURIComponent(projectId||projectName);
  } else {
    if (title) title.textContent = "制作スケジュール（全案件一括管理）";
    if (openNewTabBtn) openNewTabBtn.href = "ScheduleBoard.html";
  }
  if (window.WorksDBDashboard && typeof window.WorksDBDashboard.renderNativeScheduleBoard === "function") {
    window.WorksDBDashboard.renderNativeScheduleBoard(projectName);
  }
  if (title) title.scrollIntoView({ behavior: "smooth", block: "start" });
}
function regShowProject(entry,skipRoute) {
  if (!entry) return;
  if (!skipRoute) regSetRoute(entry.id);
  if (window.WorksDBDashboard && typeof window.WorksDBDashboard.setActiveProject === "function") {
    window.WorksDBDashboard.setActiveProject(entry);
  }
  var titleEl = document.querySelector(".dashboard-title");
  if (titleEl) titleEl.textContent = entry.name;
  var target = regHref(entry);
  if (entry.url && target && !/DBindex\.html/i.test(target) && !/docs\.google\.com\/spreadsheets/i.test(target)) {
    window.location.assign(target);
    return;
  }
  regClose();
  switchScheduleTab("gantt");
  window.scrollTo(0, 0);
}

function regRender(){
  regStats();
  var query=(regEl("registry-search").value||"").trim().toLowerCase();
  var filter=regEl("registry-status-filter").value||"all";
  var normalizedFilter=String(filter).trim().toLowerCase();
  var showAll=!normalizedFilter||["all","__all__","すべて","全て","すべての状態","全ての状態"].indexOf(normalizedFilter)>=0;
  var list=registry.entries.filter(function(x){var hay=[x.name,x.type,x.owner,x.note].join(" ").toLowerCase();return(!query||hay.indexOf(query)>=0)&&(showAll||x.status===filter)});
  var grid=regEl("registry-grid");
  if(!list.length){grid.innerHTML='<div class="registry-empty"><strong>該当するDBがありません</strong>検索条件を変更するか、新しいDBを追加してください。</div>';return}
  grid.innerHTML=list.map(function(x){
    var primary='<button type="button" class="studio-btn studio-btn--cyan" data-reg-show="'+regEsc(x.id)+'">案件を開く</button>';
    var deleteButton=x.self?"":'<button type="button" class="studio-btn studio-btn--ghost registry-card-menu" data-reg-delete="'+regEsc(x.id)+'" title="削除">削除</button>';
    var schedButton='<button type="button" class="studio-btn studio-btn--ghost registry-card-menu" data-reg-sched="'+regEsc(x.id)+'" title="この案件のスケジュールを表示">予定</button>';
    var ready=!!(x.spreadsheetId||x.spreadsheetUrl||x.webAppUrl);
    var deadline=x.deadline?String(x.deadline):"未設定";
    return'<article class="registry-card" style="--registry-color:'+regColor(x.color)+'">'+
      '<div class="registry-card-top"><div><p class="registry-type">'+regEsc(x.type||"未分類")+'</p><h4>'+regEsc(x.name)+'</h4><span class="registry-connection'+(ready?' is-ready':'')+'">'+(ready?'シート接続済み':'シート未設定')+'</span></div><span class="registry-status" data-status="'+regEsc(x.status||"準備中")+'">'+regEsc(x.status||"準備中")+'</span></div>'+
      '<p class="registry-note">'+regEsc(x.note||"メモはまだありません。")+'</p>'+
      '<div class="registry-meta"><div><span>担当</span><b>'+regEsc(x.owner||"未設定")+'</b></div><div><span>締切</span><b>'+regEsc(deadline)+'</b></div><div><span>更新</span><b>'+regEsc(regDate(x.updatedAt))+'</b></div></div>'+
      '<div class="registry-card-actions"><div class="registry-card-primary-row">'+primary+schedButton+'</div><div class="registry-card-sub-row"><button type="button" class="studio-btn studio-btn--ghost registry-card-menu" data-reg-edit="'+regEsc(x.id)+'">設定</button><button type="button" class="studio-btn studio-btn--ghost registry-card-menu" data-reg-copy="'+regEsc(x.id)+'">複製</button>'+deleteButton+'</div></div></article>'
  }).join("")
}
function regDate(value){var d=new Date(value);return isNaN(d.getTime())?"—":(d.getMonth()+1)+"/"+d.getDate()}
function regOpen(){
  regEl("registry-shell").hidden=false;
  document.body.style.overflow="hidden";
  document.title="案件データベース — WorksDB";
  regEl("registry-search").value="";
  regEl("registry-status-filter").value="all";
  registryQuery="";
  registryFilter="all";
  regRender();
  setTimeout(function(){regEl("registry-search").focus()},0);
}
function regClose(){regEl("registry-shell").hidden=true;document.body.style.overflow="";document.title=PROJECT_DASHBOARD_TITLE}
function regFill(form,data){Array.prototype.forEach.call(form.elements,function(el){if(!el.name)return;if(el.name==="color")el.value=data[el.name]||"#6fd6ff";else el.value=data[el.name]==null?"":data[el.name]})}
function regEdit(entry){
  var form=regEl("registry-form"),tools=regEl("registry-project-tools"),pairing=regEl("registry-pairing-id"),scheduleLink=regEl("registry-project-schedule-link");
  form.reset();regFill(form,entry?regProjectFormView(entry):{status:"稼働中",color:"#6fd6ff",sheetGid:0,scheduleGid:0,trackSheetName:"進捗管理",scheduleSheetName:"制作スケジュール"});
  regEl("registry-dialog-title").textContent=entry?"案件設定を編集":"DBを追加";
  tools.hidden=!entry;pairing.hidden=!entry;
  if(entry){pairing.textContent="PAIR ID: "+entry.id;scheduleLink.href="ScheduleBoard.html?project="+encodeURIComponent(entry.id)}
  regEl("registry-dialog").showModal()
}
function regFind(id){return registry.entries.find(function(x){return x.id===id})}
window.WorksDBRegistry={find:regFind,save:regSave,sync:function(entry){return masterSyncEntry(entry,false)},refresh:function(){return masterSyncFromSheet(true)}};
regEl("registry-open-btn").addEventListener("click",function(){regSetRoute("");regOpen()});
regEl("registry-close-btn").addEventListener("click",regClose);
regEl("registry-add-btn").addEventListener("click",function(){regEdit(null)});
regEl("registry-dialog-close").addEventListener("click",function(){regEl("registry-dialog").close()});
regEl("registry-cancel-btn").addEventListener("click",function(){regEl("registry-dialog").close()});
regEl("registry-project-script-btn").addEventListener("click",function(){var id=regEl("registry-form").elements.id.value;if(!id)return;regEl("registry-dialog").close();gasOpen(id)});
regEl("registry-search").addEventListener("input",function(e){registryQuery=e.target.value;regRender()});
regEl("registry-status-filter").addEventListener("change",function(e){registryFilter=e.target.value;if(registryFilter==="all"){regEl("registry-search").value="";registryQuery=""}regRender()});
regEl("registry-form").addEventListener("submit",async function(e){
  e.preventDefault();
  var data=regProjectFormData(e.currentTarget),old=regFind(data.id),stamp=new Date().toISOString(),entry;
  if(old){var keepSelf=old.self;Object.assign(old,data,{self:keepSelf,updatedAt:stamp});entry=old}
  else{entry=Object.assign(data,{id:regId(),self:false,createdAt:stamp,updatedAt:stamp});registry.entries.unshift(entry)}
  regSave(old?"DB情報を更新しました":"DBを追加しました");regEl("registry-dialog").close();regRender();
  if(masterConnected()){
    try{entry=await masterSyncEntry(entry,!old);regRender();regToast(old?"管理シートを更新しました":"案件シートを自動作成しました")}
    catch(err){regToast("管理シート同期に失敗したためローカル保存しました")}
  }
});
regEl("registry-grid").addEventListener("click",async function(e){
  var btn=e.target.closest("[data-reg-show],[data-reg-edit],[data-reg-copy],[data-reg-delete],[data-reg-sched]");if(!btn)return;
  if(btn.hasAttribute("data-reg-sched")){
    var projectEntry = regFind(btn.getAttribute("data-reg-sched"));
    regClose();
    filterScheduleBoardIframe(projectEntry);
    return;
  }
  var id=btn.getAttribute("data-reg-show")||btn.getAttribute("data-reg-edit")||btn.getAttribute("data-reg-copy")||btn.getAttribute("data-reg-delete"),entry=regFind(id);if(!entry)return;
  if(btn.hasAttribute("data-reg-show")){regShowProject(entry);return}
  if(btn.hasAttribute("data-reg-edit")){regEdit(entry);return}
  if(btn.hasAttribute("data-reg-copy")){var copy=Object.assign({},entry,{id:regId(),name:entry.name+"（コピー）",self:false,spreadsheetId:"",spreadsheetUrl:"",scheduleSpreadsheetId:"",scheduleSpreadsheetUrl:"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});registry.entries.unshift(copy);regSave("DB情報を複製しました");regRender();if(masterConnected()){try{await masterSyncEntry(copy,true);regRender();regToast("複製案件のシートを自動作成しました")}catch(err){regToast("複製はローカル保存になりました")}}return}
  if(btn.hasAttribute("data-reg-delete")&&confirm("「"+entry.name+"」を登録一覧からアーカイブしますか？\n案件スプレッドシート自体は削除されません。")){registry.entries=registry.entries.filter(function(x){return x.id!==id});regSave("案件をアーカイブしました");regRender();if(masterConnected()){try{await masterPost("archive_project",{projectId:id})}catch(err){regToast("管理シートのアーカイブ更新に失敗しました")}}}
});

// Bind Schedule Board Control Buttons
var headerSchedBtn = regEl("btn-header-all-schedule");
if (headerSchedBtn) {
  headerSchedBtn.addEventListener("click", function() {
    filterScheduleBoardIframe("");
  });
}
var ganttTabBtn = regEl("tab-btn-gantt");
if (ganttTabBtn) {
  ganttTabBtn.addEventListener("click", function() {
    switchScheduleTab("gantt");
  });
}
var boardTabBtn = regEl("tab-btn-board");
if (boardTabBtn) {
  boardTabBtn.addEventListener("click", function() {
    switchScheduleTab("board");
  });
}
var showAllBtn = regEl("btn-show-all-schedule-iframe");
if (showAllBtn) {
  showAllBtn.addEventListener("click", function() {
    filterScheduleBoardIframe("");
  });
}
var regShowAllBtn = regEl("reg-btn-show-all-schedule");
if (regShowAllBtn) {
  regShowAllBtn.addEventListener("click", function() {
    filterScheduleBoardIframe("");
  });
}
var regReloadBtn = regEl("reg-btn-reload-schedule");
if (regReloadBtn) {
  regReloadBtn.addEventListener("click", function() {
    var iframe = regEl("registry-schedule-board-iframe");
    if (iframe) iframe.src = iframe.src;
  });
}
var reloadBtn = regEl("btn-reload-schedule-iframe");
if (reloadBtn) {
  reloadBtn.addEventListener("click", function() {
    var iframe = regEl("main-schedule-board-iframe");
    if (iframe) iframe.src = iframe.src;
  });
}
regEl("registry-export-btn").addEventListener("click",function(){var blob=new Blob([JSON.stringify({version:1,entries:registry.entries,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="WorksDB-registry-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},500);regToast("DB一覧を書き出しました")});
regEl("registry-import-btn").addEventListener("click",function(){regEl("registry-import-file").click()});
regEl("registry-import-file").addEventListener("change",function(e){var file=e.target.files[0];e.target.value="";if(!file)return;var reader=new FileReader();reader.onload=function(){try{var data=JSON.parse(reader.result);if(!data||!Array.isArray(data.entries))throw new Error();if(!confirm(data.entries.length+"件のDB一覧を読み込み、現在の登録一覧を置き換えますか？"))return;registry={entries:data.entries.filter(function(x){return x&&x.id&&x.name})};if(!registry.entries.some(function(x){return x.id===DEFAULT_DB.id}))registry.entries.unshift(Object.assign({},DEFAULT_DB));regSave("DB一覧を読み込みました");regRender()}catch(err){alert("読み込みに失敗しました。WorksDBから書き出したJSONを選んでください。")}};reader.readAsText(file)});
regEl("registry-dialog").addEventListener("click",function(e){if(e.target===this)this.close()});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!regEl("registry-shell").hidden&&!regEl("registry-dialog").open)regClose()});

function gasTodayIso(){
  var d=new Date(),offset=d.getTimezoneOffset();
  return new Date(d.getTime()-offset*60000).toISOString().slice(0,10)
}
function gasDefaults(entry){
  var current=entry&&entry.id===DEFAULT_DB.id;
  var cfg=Object.assign({
    trackSheetName:current?"":"進捗管理",
    scheduleSpreadsheetId:current?"1aPDB-g_eMP60naVDGSY3P0Sm7RELQ0laihPVq2VS8-Y":"",
    scheduleSheetName:current?"":"制作スケジュール",
    scheduleSheetGid:0,
    scheduleStartDate:gasTodayIso(),
    scheduleDays:30,
    initialTrackCount:10
  },entry&&entry.bridge?entry.bridge:{});
  if(entry){
    cfg.trackSheetName=entry.trackSheetName||cfg.trackSheetName;
    cfg.scheduleSpreadsheetId=entry.scheduleSpreadsheetId||masterExtractSheetId(entry.scheduleSpreadsheetUrl)||entry.spreadsheetId||masterExtractSheetId(entry.spreadsheetUrl)||cfg.scheduleSpreadsheetId;
    cfg.scheduleSheetName=entry.scheduleSheetName||cfg.scheduleSheetName;
    if(entry.scheduleGid!=null)cfg.scheduleSheetGid=Math.max(0,Number(entry.scheduleGid)||0);
  }
  return cfg
}
function gasPopulateSelect(selectedId){
  var select=regEl("gas-db-select");
  select.innerHTML=registry.entries.map(function(x){return'<option value="'+regEsc(x.id)+'">'+regEsc(x.name)+'</option>'}).join("");
  select.value=selectedId&&regFind(selectedId)?selectedId:(registry.entries[0]?registry.entries[0].id:"");
}
function gasLoadEntry(id){
  var entry=regFind(id),cfg=gasDefaults(entry);
  var countEl=regEl("gas-track-count"); if(countEl) countEl.value=Math.max(1,Math.min(50,Number(cfg.initialTrackCount)||10));
  gasGenerate();
}
function gasCurrentEntry(){return regFind(regEl("gas-db-select").value)}
function gasReadConfig(){
  var entry=gasCurrentEntry(),cfg=gasDefaults(entry);
  var countEl=regEl("gas-track-count");
  return{
    trackSheetName:entry?(entry.trackSheetName||"進捗管理"):(cfg.trackSheetName||"進捗管理"),
    scheduleSpreadsheetId:entry?(entry.scheduleSpreadsheetId||""):(cfg.scheduleSpreadsheetId||""),
    scheduleSheetName:entry?(entry.scheduleSheetName||"制作スケジュール"):(cfg.scheduleSheetName||"制作スケジュール"),
    scheduleSheetGid:entry?(entry.scheduleGid||0):(cfg.scheduleSheetGid||0),
    scheduleStartDate:cfg.scheduleStartDate||gasTodayIso(),
    scheduleDays:Math.max(7,Math.min(120,Number(cfg.scheduleDays)||30)),
    initialTrackCount:Math.max(1,Math.min(50,parseInt((countEl&&countEl.value)||cfg.initialTrackCount||10,10)||10))
  }
}
function gasGenerate(){
  var entry=gasCurrentEntry(),cfg=gasReadConfig(),code=regEl("gas-code-template").value;
  var values={
    "__PROJECT_NAME__":entry?entry.name:"WorksDB Project",
    "__TRACK_SHEET_NAME__":cfg.trackSheetName,
    "__SCHEDULE_ID__":cfg.scheduleSpreadsheetId,
    "__SCHEDULE_NAME__":cfg.scheduleSheetName,
    "__SCHEDULE_START__":cfg.scheduleStartDate
  };
  Object.keys(values).forEach(function(key){code=code.split(key).join(JSON.stringify(values[key]))});
  code=code.split("__SCHEDULE_GID__").join(String(cfg.scheduleSheetGid));
  code=code.split("__SCHEDULE_DAYS__").join(String(cfg.scheduleDays));
  code=code.split("__TRACK_COUNT__").join(String(cfg.initialTrackCount));
  regEl("gas-code-output").value=code.trim()+"\n";
}
function gasSaveAndGenerate(){
  var entry=gasCurrentEntry();
  if(entry){
    var cfg=gasReadConfig();
    entry.bridge=cfg;
    entry.trackSheetName=cfg.trackSheetName;
    entry.scheduleSpreadsheetId=masterExtractSheetId(cfg.scheduleSpreadsheetId)||cfg.scheduleSpreadsheetId;
    entry.scheduleSpreadsheetUrl=regSheetUrl(entry.scheduleSpreadsheetId);
    entry.scheduleSheetName=cfg.scheduleSheetName;
    entry.scheduleGid=cfg.scheduleSheetGid;
    entry.updatedAt=new Date().toISOString();
    regSave()
  }
  gasGenerate()
}function gasOpen(entryId){
  gasPopulateSelect(entryId||DEFAULT_DB.id);
  gasLoadEntry(regEl("gas-db-select").value);
  regEl("gas-copy-state").hidden=true;
  regEl("gas-dialog").showModal()
}
function gasClose(){
  var dialog=regEl("gas-dialog"),entry=gasCurrentEntry();
  if(dialog.open)dialog.close();
  if(entry&&masterConnected())masterSyncEntry(entry,false).then(function(){regRender()}).catch(function(){regToast("案件コード設定はローカルに保存しました")})
}
async function gasCopy(){
  var output=regEl("gas-code-output"),copied=false;
  try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(output.value);copied=true}}catch(e){}
  if(!copied){output.focus();output.select();copied=document.execCommand("copy")}
  if(copied){var stateNode=regEl("gas-copy-state");stateNode.hidden=false;clearTimeout(gasCopy.timer);gasCopy.timer=setTimeout(function(){stateNode.hidden=true},1800);regToast("Apps Scriptコードをコピーしました")}
  else{alert("自動コピーできませんでした。コード欄を選択してコピーしてください。")}
}
regEl("master-settings-btn").addEventListener("click",masterOpen);
regEl("master-status-btn").addEventListener("click",masterOpen);
regEl("master-dialog-close").addEventListener("click",masterClose);
regEl("master-dialog").addEventListener("click",function(e){if(e.target===this)masterClose()});
regEl("master-copy-btn").addEventListener("click",masterCopy);
regEl("master-upload-btn").addEventListener("click",masterUploadAll);
regEl("master-save-btn").addEventListener("click",async function(){
  var raw=regEl("master-spreadsheet-id").value.trim();
  masterSettings.spreadsheetUrl=/^https?:/i.test(raw)?raw:"";
  masterSettings.spreadsheetId=masterExtractSheetId(raw);
  masterSettings.webAppUrl=regEl("master-webapp-url").value.trim();
  masterPersist();
  if(!masterConnected()){masterUpdateUi("WebアプリURLを入力してください。",true);return}
  var ok=await masterSyncFromSheet(true);
  if(ok)masterUpdateUi("接続設定を保存しました。管理シートが空の場合は「現在の一覧を管理シートへ送る」を押してください。");
});
regEl("gas-code-btn").addEventListener("click",function(){gasOpen(DEFAULT_DB.id)});
regEl("gas-dialog-close").addEventListener("click",gasClose);
regEl("gas-done-btn").addEventListener("click",gasClose);
regEl("gas-copy-btn").addEventListener("click",gasCopy);
regEl("gas-db-select").addEventListener("change",function(e){gasLoadEntry(e.target.value)});
["gas-track-count"].forEach(function(id){var el=regEl(id);if(el)el.addEventListener("input",gasSaveAndGenerate)});
regEl("gas-dialog").addEventListener("click",function(e){if(e.target===this)gasClose()});
function regShowAllDatabasesFirst(){
  ["registry-dialog","gas-dialog","master-dialog"].forEach(function(id){var dialog=regEl(id);if(dialog&&dialog.open)dialog.close()});
  regOpen();
  regEl("registry-shell").scrollTop=0;
  window.scrollTo(0,0);
  requestAnimationFrame(function(){regEl("registry-shell").scrollTop=0;window.scrollTo(0,0)});
  masterApplyRoute();
}
if("scrollRestoration" in history)history.scrollRestoration="manual";
regLoad();masterLoadSettings();masterLoadCode();regShowAllDatabasesFirst();masterSyncFromSheet(false);
window.addEventListener("pageshow",regShowAllDatabasesFirst);
})();
