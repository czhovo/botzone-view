const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayVersion=s=>String(s??'').replace(/\bv0*(\d+)\b/g,(_,n)=>'v'+Number(n));
const liveBoards=new Map();
const expandedRecords=new Set();
const historyViews=new Map(),historyTimes=new Map();let historyRequest=0,historyTimer=null,historyBoardKey=null,historyBoardEpoch=0;
function displayParticipant(p){return historyViews.get(p.id)||p;}
let data=null,selected='qwen',frames=new Map(),renderKey='',boardPage=0,selectedEvent=null;
const assets={qwen:'qwen',astra:'astra',sol:'sol',flash:'deepseekflash',glm:'glm'};
const statuses={not_started:'尚未启动',starting:'正在启动',running:'开发中',developing:'开发中',finished:'已交卷',sealed:'已封存',failed:'异常结束',deadline:'已到截止时间',cancelled:'已停止',infrastructure_fault:'基础设施异常'};
const duration=s=>typeof s==='number'?(s<60?s.toFixed(1)+'秒':Math.floor(s/60)+'分'+(s%60).toFixed(1)+'秒'):'—';
function testElapsed(at,p){return Number.isFinite(at)&&Number.isFinite(p.started_at)?duration(Math.max(0,at-p.started_at)):'—';}
const fmt=n=>Number(n).toLocaleString('en-US');
function time(t){if(!t)return '时间未记录';if(t>1e12)t/=1000;return new Date(t*1000).toLocaleTimeString('zh-CN',{hour12:false});}
function elapsed(p){if(!p.started_at)return '未开始';let end=p.ended_at||Date.now()/1000;if(['finished','sealed','deadline','failed','cancelled'].includes(p.status)&&!p.ended_at)return '已结束';let s=Math.max(0,Math.floor(end-p.started_at));return `${Math.floor(s/60)}分${String(s%60).padStart(2,'0')}秒`;}
function source(s){return typeof s==='string'?s:JSON.stringify(s??'');}
function empty(title,body=''){return `<div class="empty"><strong>${esc(title)}</strong>${esc(body)}</div>`;}
function render(){
 const tournament=selected==='tournament';
 const original=data.participants.find(p=>p.id===selected)||data.participants[0];if(!original)return;const p=displayParticipant(original);if(!tournament)selected=p.id;
 const nextKey=JSON.stringify([selected,p,data.start_authorization,data.participants.map(x=>[x.id,x.status])]);if(nextKey===renderKey)return;renderKey=nextKey;
 const participantHtml=data.participants.map((a,i)=>`<button class="participant" data-id="${esc(a.id)}" aria-label="${esc(a.label)}" title="${esc(a.label)}" aria-pressed="${a.id===selected}"><span class="avatar"><img src="./agent-assets/${assets[a.id]}.png" alt="${esc(a.label)}角色"></span></button>`).join('')+`<button class="participant tournament-tab" data-id="tournament" aria-label="正式赛场" title="正式赛场" aria-pressed="${tournament}"><span class="avatar tournament-symbol"><img src="./tournament-midgame.png?v=1" alt="黑白棋赛场"></span></button>`;
 if($('participants').innerHTML!==participantHtml)$('participants').innerHTML=participantHtml;
 $('participants').querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.id;historyBoardKey=null;historyBoardEpoch++;frames.clear();$('boards').replaceChildren();boardPage=0;selectedEvent=null;renderKey='';render();});
 document.body.classList.toggle('show-tournament',tournament);$('tournament-page').hidden=!tournament;
 if(tournament){const iframe=$('tournament-frame');if(!iframe.getAttribute('src'))iframe.src='./tournament.html?embedded=1';return;}
 renderWork(p);
 renderVersions(p);
 renderBoardPage(p);renderTime(p);
 const u=p.usage?.total||p.usage?.total_token_usage||p.usage;const fields=[['总','total_tokens'],['输入','input_tokens'],['缓存','cached_input_tokens'],['输出','output_tokens'],['推理','reasoning_output_tokens']];
 $('usage').innerHTML='<dl>'+fields.map(([label,key])=>`<dt>${label}</dt><dd>${typeof u?.[key]==='number'?(key==='reasoning_output_tokens'?(u.output_tokens>0?(100*u[key]/u.output_tokens).toFixed(1)+'%':'—'):fmt(u[key])):'—'}</dd>`).join('')+`<dt>缓存命中率</dt><dd>${typeof u?.cached_input_tokens==='number'&&typeof u?.input_tokens==='number'&&u.input_tokens>0?(100*u.cached_input_tokens/u.input_tokens).toFixed(1)+'%':'—'}</dd></dl>`;
 const currency=['astra','sol'].includes(p.id)?'credit':'元';$('usage').insertAdjacentHTML('beforeend',`<div class="price-row"><span>费用</span><strong>${p.cost?esc(p.cost.value)+' '+esc(p.cost.currency):'— '+currency}</strong></div>`);
 const acceptanceRows=(p.acceptance||[]).filter(s=>s.games>0).map(s=>({post_seal:true,id:'acceptance-'+s.name,name:`${p.id} / ${s.name}`,bot_name:(p.test_groups||[]).find(g=>g.id?.startsWith('acceptance-'))?.bot_name||p.final_version?.id||'封存版本',...s,reacceptance:!!s.reacceptance||s.id?.startsWith('selection-reacceptance-'),name:`${p.id} / ${s.name}`}));
 $('test-stats').innerHTML=[...[...(p.development_stats||[])].sort((a,b)=>(a.started_at??Infinity)-(b.started_at??Infinity)),...acceptanceRows].map((s,i)=>`<tr${(acceptanceRows.length&&i===(p.development_stats||[]).length)||(s.selection&&!acceptanceRows[i-(p.development_stats||[]).length-1]?.selection)||(s.reacceptance&&!acceptanceRows[i-(p.development_stats||[]).length-1]?.reacceptance)?' class="acceptance-divider"':''}><td>${i<(p.development_stats||[]).length?i+1:s.selection?acceptanceRows.slice(0,i-(p.development_stats||[]).length+1).filter(r=>r.selection&&!!r.reacceptance===!!s.reacceptance).length:acceptanceRows.slice(0,i-(p.development_stats||[]).length+1).filter(r=>!r.selection).length}</td><td>${esc(displayVersion(s.name.split(" / ").map(n=>isParticipantBot(n,p)?(s.bot_name||(p.test_groups||[]).find(g=>g.id===s.id)?.bot_name||s.snapshot_id||(s.id==="qwen-lumen-initial"?"v00006":s.id.match(/v\d+/)?.[0])||"版本待核验"):n).join(" / ")))}</td><td>${s.post_seal?"—":testElapsed(s.started_at,p)}</td><td>${duration(s.seconds)}</td><td>${s.games}</td><td>${s.wins} / ${s.draws} / ${s.losses}</td><td>${s.games?(100*s.wins/s.games).toFixed(1)+'%':'—'}</td><td>${s.faults}</td></tr>`).join('')||'<tr><td colspan="8">尚无开发自测记录</td></tr>';
 wireRecordDetails('test-stats',[...[...(p.development_stats||[])].sort((a,b)=>(a.started_at??Infinity)-(b.started_at??Infinity)),...acceptanceRows],p);
 renderResults(p);
}
function preserveScroll(id,html){
 const area=$(id),top=area.scrollTop,atEnd=area.scrollHeight-area.clientHeight-top<8;
 if(area.innerHTML===html)return;
 area.innerHTML=html;
 area.scrollTop=atEnd?area.scrollHeight:top;
}
function summaryElapsed(r,p){
 const at=r.at||r.retained_at;
 const seconds=typeof r.elapsed_seconds==='number'?r.elapsed_seconds:(p.started_at&&at?Math.max(0,(at>1e12?at/1000:at)-p.started_at):null);
 return seconds===null?'时间待核验':`${Math.floor(seconds/60)} 分 ${Math.floor(seconds%60)} 秒`;
}
function renderWork(p){
 const seconds=r=>r.elapsed_seconds??((r.at??r.observed_at??r.retained_at??Infinity)-(p.started_at||0));
 const rows=[...new Map((p.work_history||[]).map(r=>[r.event_id||seconds(r)+'|'+r.text,r])).values()].sort((a,b)=>seconds(a)-seconds(b));
 preserveScroll('current-work',rows.map(r=>`<div class="work-line"><small>${summaryElapsed(r,p)}</small><p>${esc(displayVersion(r.text))}</p></div>`).join('')||'<p>暂无工作摘要</p>');
}
function isParticipantBot(n,p){return (p.test_groups||[]).some(g=>g.participant===n)||n===p.id||/^bot(?:\.exe)?$/i.test(String(n).split(/[\\/]/).pop());}
function explicitMatchSeats(m,p){
 const id=m.original_id||m.id.split('@')[0],at=m.at??m.updated_at;
 const group=(p.test_groups||[]).find(g=>g.match_ids?.includes(id)&&(g.after||0)<=at&&at<(g.before||Infinity));
 return group?.match_seat_versions?.[id]||null;
}
function matchVersion(m,p){
 const named=(p.test_groups||[]).find(g=>(g.bot_name||g.snapshot_id)&&g.match_ids?.includes(m.id)&&(g.after||0)<=m.at&&m.at<(g.before||Infinity));if(named)return named.bot_name||named.snapshot_id;
 if(m.bot_name||m.snapshot_id)return m.bot_name||m.snapshot_id;
 if(m.id==='qwen-vs-lumen-1')return 'v00006';

 const v=[...(p.snapshots||[])].filter(s=>s.captured_at<=m.at).sort((a,b)=>b.captured_at-a.captured_at)[0];
 return m.bot_name||m.snapshot_id||(v?v.id:'版本待核验');
}
function renderResults(p){
 const recordNumbers={development:0,acceptance:0,selection:0,reacceptance:0};
 const sortedMatches=[...p.matches].sort((a,b)=>(a.category==='acceptance')-(b.category==='acceptance')||(a.started_at??a.at)-(b.started_at??b.at));
 const area=$('result-scroll'),top=area.scrollTop,atEnd=area.scrollHeight-area.clientHeight-top<8;
 $('results').innerHTML=p.matches.length?sortedMatches.map((m,index)=>{const winner=m.outcome.winner;const seats=explicitMatchSeats(m,p)||m.seats.map(n=>isParticipantBot(n,p)?matchVersion(m,p):n);const own=m.seats.findIndex(n=>isParticipantBot(n,p)),ranks=seats.map(n=>/^v\d+$/i.test(n)?Number(n.slice(1)):null),order=ranks.every(n=>n!==null)?(ranks[1]>ranks[0]?[1,0]:[0,1]):own===1?[1,0]:[0,1];const orderedSeats=order.map(i=>seats[i]),counts=order.map(i=>(m.outcome.piece_counts||m.outcome.final_counts||[])[i]??'—');return `<tr${m.id.startsWith('select-')&&!([...p.matches].sort((a,b)=>(a.category==='acceptance')-(b.category==='acceptance')||(a.started_at??a.at)-(b.started_at??b.at))[index-1]?.id.startsWith('select-'))?' class="acceptance-divider"':''}><td>${++recordNumbers[m.id.startsWith('select-reacceptance-')?'reacceptance':m.id.startsWith('select-')?'selection':m.category==='acceptance'?'acceptance':'development']}</td><td>${esc(displayVersion(orderedSeats.join(' / ')))}</td><td>${m.category==="acceptance"?"—":testElapsed(m.started_at,p)}</td><td>${duration(m.seconds)}</td><td>${m.category==='acceptance'?'主办方验收':'开发自测'}</td><td>${esc(displayVersion(winner==null||winner<0?'平局':seats[winner]+' 胜'))} ${esc(counts.join(':'))}</td><td>${m.faults.length}</td></tr>`;}).join(''):'<tr><td colspan="8">暂无真实对局记录</td></tr>';
 wireRecordDetails('results',sortedMatches,p);

 area.scrollTop=atEnd?area.scrollHeight:top;
}
function recordDescription(row,p){
 const group=(p.test_groups||[]).find(g=>g.id===row.id||g.match_ids?.includes(row.id));
 if(row.description||group?.description)return displayVersion(row.description||group.description);
 const acceptance=row.post_seal||row.category==='acceptance'||String(row.id).startsWith('acceptance-');
 const purpose=acceptance?'封存程序验收；标准初始局面，首步截止 2.5 秒，后续 1.5 秒。':row.record_type==='participant_aggregate'?'参与者自建测试器的批量版本对照。':'完整程序对局，由裁判通过交互协议执行。';
 const count=row.games??1;
 return `${purpose}本条记录 ${count} 局；${acceptance?"":"开发 "+testElapsed(row.started_at,p)+" 开始，"}用时 ${duration(row.seconds)}。`;
}
function wireRecordDetails(id,entries,p){
 const area=$(id),rows=[...area.children];
 rows.forEach((row,i)=>{
  const entry=entries[i];if(!entry)return;
  const key=p.id+'|'+id+'|'+entry.id,detail=document.createElement('tr');
  detail.className='record-description';detail.innerHTML=`<td colspan="8">${esc(recordDescription(entry,p))}</td>`;
  detail.hidden=!expandedRecords.has(key);row.after(detail);row.classList.add('record-toggle');row.tabIndex=0;row.setAttribute('aria-expanded',String(!detail.hidden));
  const toggle=()=>{detail.hidden=!detail.hidden;row.setAttribute('aria-expanded',String(!detail.hidden));if(detail.hidden)expandedRecords.delete(key);else expandedRecords.add(key);};
  row.onclick=toggle;row.onkeydown=e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggle();}};
 });
}
function renderBoardPage(p){
 $('game-count').textContent=`${p.test_count} 局记录`;
 $('boards').hidden=true;document.querySelector('.board-navigation').hidden=true;
 const descriptions=p.archive_active_tests||[];
 $('test-projects').innerHTML=descriptions.length?descriptions.map(t=>`<p class="test-description">${esc(displayVersion(t))}</p>`).join(''):'<p class="hint">暂无正在进行的测试</p>';
}
function secondsUsed(p){if(!p.started_at)return null;const terminal=['finished','sealed','deadline','failed','cancelled','infrastructure_fault'].includes(p.status);const end=p.ended_at||(terminal?null:Date.now()/1000);return end==null?null:Math.max(0,end-p.started_at);}
function tickTime(p){const historical=historyTimes.get(p.id);$('elapsed').textContent=historical==null?elapsed(p):duration(historical);const s=historical??secondsUsed(p);const draggable=!!p.ended_at;$('time-dot').classList.toggle('history-draggable',draggable);$('time-dot').setAttribute('role',draggable?'slider':'img');$('time-dot').tabIndex=draggable?0:-1;if(draggable){$('time-dot').setAttribute('aria-valuemin','0');$('time-dot').setAttribute('aria-valuemax',String(p.ended_at-p.started_at));$('time-dot').setAttribute('aria-valuenow',String(s));$('time-dot').setAttribute('aria-label','回看开发时间');}$('time-dot').hidden=s===null;if(s!==null){$('time-dot').style.left=Math.min(100,s/120)+'%';$('time-character').src=`./agent-assets/${assets[p.id]}.png`;}}
function renderTime(p){
 const important=p.events.filter(e=>e.verified_summary||['turn.started','turn.failed','error','submission','fault'].includes(e.kind));
 const timed=important.map(e=>{let at=e.at;if(at>1e12)at/=1000;return {...e,seconds:e.elapsed_seconds??(p.started_at&&at?at-p.started_at:null)};}).filter(e=>e.seconds!=null&&e.seconds>=0).sort((a,b)=>a.seconds-b.seconds);
 const groups=new Map();for(const e of timed){const key=e.kind==='clock'?'clock-'+(e.event_id||e.seconds):['fault','error','turn.failed'].includes(e.kind)?'fault-'+e.seconds:Math.floor(e.seconds/300);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
 const bins=[...groups.values()];$('event-points').innerHTML=bins.map((g,i)=>`<button class="event-point${g[0].kind==='clock'?' clock-event':''}${g.some(e=>['fault','error','turn.failed'].includes(e.kind)||e.fault)?' fault-event':''}" style="left:${Math.min(100,g[0].seconds/120)}%;--lane:${i%3}" data-event="${i}" aria-expanded="${selectedEvent===i}" aria-label="${Math.floor(g[0].seconds/60)} 分钟：${esc(displayVersion(g[0].summary))}${g.length>1?'，共 '+g.length+' 项事件':''}" title="${esc(displayVersion(g[0].summary))}"><span>${g.length>1?g.length:'◆'}</span></button>`).join('');
 const show=i=>{selectedEvent=i;$('event-detail').innerHTML=bins[i].map(e=>`<article><small>已用 ${Math.floor(e.seconds/60)} 分 ${Math.floor(e.seconds%60)} 秒 · ${e.verified_summary?'主办方核验':'CLI 事件'}</small><p>${esc(displayVersion(e.summary))}</p><details><summary>查看证据</summary>${esc(source(e.source))}</details></article>`).join('');};
 $('event-points').querySelectorAll('button').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.event);if(selectedEvent===i){selectedEvent=null;$('event-detail').replaceChildren();b.setAttribute('aria-expanded','false');}else{show(i);$('event-points').querySelectorAll('button').forEach(x=>x.setAttribute('aria-expanded',String(x===b)));}});
 if(selectedEvent!==null&&selectedEvent<bins.length)show(selectedEvent);else $('event-detail').replaceChildren();tickTime(p);
}
function renderVersions(p){
 const notes=new Map();for(const v of p.algorithm_versions||[])notes.set(v.display_id||v.snapshot_id,v);
 const entries=[...notes.values()].map(v=>({s:(p.snapshots||[]).find(s=>s.id===v.snapshot_id),v})).filter(({s,v})=>s&&v.valid===true&&v.description&&v.validation_evidence).sort((a,b)=>Number((a.v.display_id||a.s.id).replace(/^v/,''))-Number((b.v.display_id||b.s.id).replace(/^v/,'')));
 $('version-count').textContent=`${entries.length} 个有效版本`;
 preserveScroll('decisions',entries.map(({s,v})=>{
 const t=p.started_at?Math.max(0,s.captured_at-p.started_at):null;
 const chosen=p.selected_submission,changed=chosen?.changed_from_original===true,label=displayVersion(v.display_id||s.id),original=p.original_submission?.display_version?label===displayVersion(p.original_submission.display_version):s.id===p.final_version?.id,current=chosen?.display_version?label===displayVersion(chosen.display_version):original;
 const marker=current?'已选定':original&&changed?'原选定':'';
 const name=current&&chosen?.bot_name?chosen.bot_name:original?p.original_submission?.bot_name:'';
 return `<article class="version${current?' version-selected':''}"><div class="version-index"><strong>${esc(displayVersion(v.display_id||s.id))}</strong><small>${t===null?time(s.captured_at):Math.floor(t/60)+'分'+Math.floor(t%60)+'秒'}</small>${marker?`<span class="selection-marker${current?' active':''}">${marker}</span>`:''}</div><p class="version-description">${marker&&name?`<strong class="selection-name">${esc(name)}</strong> · `:''}${esc(displayVersion(v.description))}</p></article>`;
 }).join('')||'<p class="hint">暂无已确认可运行的版本</p>');
}

function archiveView(p,seconds){
 const cutoff=p.started_at+seconds, end=p.ended_at-p.started_at;
 if(seconds>=end-.001)return p;
 const view={...p,history_seconds:seconds,acceptance:[],selected_submission:null,original_submission:null,final_version:null,boards:[],archive_active_tests:[]};
 const points=p.usage_history||[];let lo=0,hi=points.length;while(lo<hi){const m=(lo+hi)>>1;if(points[m].at<=cutoff)lo=m+1;else hi=m;}
 view.usage=lo?points[lo-1].usage:null;view.cost=lo?points[lo-1].cost:null;
 view.work_history=p.work_history.filter(r=>(r.elapsed_seconds??((r.at??r.observed_at??r.retained_at)-p.started_at))<=seconds);
 view.snapshots=p.snapshots.filter(s=>s.captured_at<=cutoff);
 view.algorithm_versions=p.algorithm_versions.filter(v=>v.available_at<=cutoff);
 view.matches=p.matches.filter(m=>m.category==='development'&&m.at<=cutoff);view.test_count=view.matches.length;
 view.development_stats=[];
 for(const row of p.development_stats){
  const group=p.test_groups.find(g=>g.id===row.id)||{},ids=group.match_ids||[row.id];
  if(row.record_type==='participant_aggregate'){
   const end=row.ended_at??row.started_at+row.seconds;
   if(end<=cutoff)view.development_stats.push(row);
   else if(row.started_at<=cutoff)view.archive_active_tests.push(recordDescription(row,p));
   continue;
  }
  const all=p.matches.filter(m=>m.category==='development'&&ids.includes(m.id)&&(group.after??0)<=m.at&&m.at<(group.before??Infinity));
  const done=all.filter(m=>m.at<=cutoff);
  if(all.some(m=>m.started_at<=cutoff&&m.at>cutoff))view.archive_active_tests.push(recordDescription(row,p));
  if(!done.length)continue;
  const r={...row,games:done.length,wins:0,draws:0,losses:0,faults:0};
  for(const m of done){const seat=m.seats.indexOf(p.id);const score=m.outcome.scores[seat<0?0:seat];r[score===2?'wins':score===1?'draws':'losses']++;r.faults+=m.faults.length;}
  r.seconds=Math.max(...done.map(m=>m.at))-Math.min(...done.map(m=>m.started_at));view.development_stats.push(r);
 }
 view.archive_active_tests=[...new Set(view.archive_active_tests)];return view;
}
let pendingHistory=null,historyFrame=0,historyDragging=false;
function flushHistory(){historyFrame=0;const job=pendingHistory;pendingHistory=null;if(!job||selected!==job.p.id)return;const {p,seconds}=job;historyViews.set(p.id,archiveView(p,seconds));renderKey='';render();}
function seekHistory(p,seconds,immediate=false){
 if(!p.ended_at)return;
 seconds=Math.max(0,Math.min(seconds,p.ended_at-p.started_at));historyTimes.set(p.id,seconds);tickTime(p);
 pendingHistory={p,seconds};if(immediate){if(historyFrame)cancelAnimationFrame(historyFrame);flushHistory();}else if(!historyFrame)historyFrame=requestAnimationFrame(flushHistory);
}
$('time-dot').onpointerdown=e=>{const p=data?.participants.find(p=>p.id===selected);if(!p?.ended_at)return;e.preventDefault();historyDragging=true;$('time-dot').setPointerCapture(e.pointerId);};
function dragHistory(e,finish=false){if(!historyDragging)return;const p=data?.participants.find(p=>p.id===selected);if(!p)return;const box=$('time-axis').getBoundingClientRect();seekHistory(p,(e.clientX-box.left)/box.width*12000,finish);if(finish){historyDragging=false;if($('time-dot').hasPointerCapture(e.pointerId))$('time-dot').releasePointerCapture(e.pointerId);}}
$('time-dot').onpointermove=e=>dragHistory(e);
$('time-dot').onpointerup=e=>dragHistory(e,true);
$('time-dot').onpointercancel=()=>{historyDragging=false;};
$('time-dot').onkeydown=e=>{const p=data?.participants.find(p=>p.id===selected);if(!p)return;const now=historyTimes.get(p.id)??secondsUsed(p),s=e.key==='Home'?0:e.key==='End'?p.ended_at-p.started_at:e.key==='ArrowLeft'?now-30:e.key==='ArrowRight'?now+30:null;if(s!==null){e.preventDefault();seekHistory(p,s,true);}};
fetch('./data/agents.json').then(r=>{if(!r.ok)throw Error('归档读取失败');return r.json();}).then(d=>{data=d;render();}).catch(e=>{$('elapsed').textContent=e.message;});
addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==$('tournament-frame').contentWindow||e.data?.type!=='tournament-height')return;const h=Number(e.data.height);if(Number.isFinite(h)&&h>0)$('tournament-frame').style.height=Math.ceil(h)+'px';});
