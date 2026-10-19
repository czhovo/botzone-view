const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayVersion=s=>String(s??'').replace(/\bv0*(\d+)\b/g,(_,n)=>'v'+Number(n));
const liveBoards=new Map();
const expandedRecords=new Set();
const historyViews=new Map(),historyTimes=new Map();let historyRequest=0,historyTimer=null,historyBoardKey=null,historyBoardEpoch=0;
function displayParticipant(p){return historyViews.get(p.id)||p;}
let data=null,selected='astra',frames=new Map(),renderKey='',boardPage=0,selectedEvent=null;
const assets={qwen:'qwen.png',astra:'astra.png',sol:'sol.png',flash:'deepseekflash.png',glm:'glm.png',sonnet:'sonnet.svg','astra-continuation':'astra.png'};
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
 const nextKey=[selected,historyTimes.get(selected)??'final',p.snapshots.length,p.matches.length,p.work_history.length,p.events.length].join('|');if(nextKey===renderKey)return;renderKey=nextKey;
 const participantHtml=data.participants.map((a,i)=>`<button class="participant" data-id="${esc(a.id)}" aria-label="${esc(a.label)}" title="${esc(a.label)}" aria-pressed="${a.id===selected}"><span class="avatar"><img src="./agent-assets/${assets[a.id]}" alt="${esc(a.label)}角色"></span></button>`).join('')+`<button class="participant tournament-tab" data-id="tournament" aria-label="正式赛场" title="正式赛场" aria-pressed="${tournament}"><span class="avatar tournament-symbol"><img src="./tournament-board.svg" alt="黑白棋赛场"></span></button>`;
 if($('participants').innerHTML!==participantHtml)$('participants').innerHTML=participantHtml;
 $('participants').querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.id;historyBoardKey=null;historyBoardEpoch++;frames.clear();$('boards').replaceChildren();boardPage=0;selectedEvent=null;renderKey='';render();});
 document.body.classList.toggle('show-tournament',tournament);$('tournament-page').hidden=!tournament;
 if(tournament){const iframe=$('tournament-frame');if(!iframe.getAttribute('src'))iframe.src='./tournament.html?embedded=1';return;}
 renderWork(p);
 renderVersions(p);
 renderBoardPage(p);renderTime(p);
 const u=p.usage?.total||p.usage?.total_token_usage||p.usage;const fields=[['总','total_tokens'],['输入','input_tokens'],['缓存','cached_input_tokens'],['输出','output_tokens'],['推理','reasoning_output_tokens']];
 $('usage').innerHTML='<dl>'+fields.map(([label,key])=>`<dt>${label}</dt><dd>${typeof u?.[key]==='number'?(key==='reasoning_output_tokens'?(u.output_tokens>0?(100*u[key]/u.output_tokens).toFixed(1)+'%':'—'):fmt(u[key])):'—'}</dd>`).join('')+`<dt>缓存命中率</dt><dd>${typeof u?.cached_input_tokens==='number'&&typeof u?.input_tokens==='number'&&u.input_tokens>0?(100*u.cached_input_tokens/u.input_tokens).toFixed(1)+'%':'—'}</dd></dl>`;
 const currency=['astra','sol','astra-continuation'].includes(p.id)?'credit':'元';$('usage').insertAdjacentHTML('beforeend',`<div class="price-row"><span>费用</span><strong>${p.cost?esc(p.cost.value)+' '+esc(p.cost.currency):'— '+currency}</strong></div>`);
 const acceptanceRows=(p.acceptance||[]).filter(s=>s.games>0).map(s=>({post_seal:true,id:'acceptance-'+s.name,name:`${p.id} / ${s.name}`,bot_name:(p.test_groups||[]).find(g=>g.id?.startsWith('acceptance-'))?.bot_name||p.final_version?.id||'封存版本',...s,reacceptance:!!s.reacceptance||s.id?.startsWith('selection-reacceptance-'),name:`${p.id} / ${s.name}`}));
 $('test-stats').innerHTML=[...[...(p.development_stats||[])].sort((a,b)=>(a.started_at??Infinity)-(b.started_at??Infinity)),...acceptanceRows].map((s,i)=>`<tr${(acceptanceRows.length&&i===(p.development_stats||[]).length)||(s.selection&&!acceptanceRows[i-(p.development_stats||[]).length-1]?.selection)||(s.reacceptance&&!acceptanceRows[i-(p.development_stats||[]).length-1]?.reacceptance)?' class="acceptance-divider"':''}><td>${i<(p.development_stats||[]).length?i+1:s.selection?acceptanceRows.slice(0,i-(p.development_stats||[]).length+1).filter(r=>r.selection&&!!r.reacceptance===!!s.reacceptance).length:acceptanceRows.slice(0,i-(p.development_stats||[]).length+1).filter(r=>!r.selection).length}</td><td>${esc(displayVersion(s.name.split(" / ").map(n=>isParticipantBot(n,p)?(s.bot_name||(p.test_groups||[]).find(g=>g.id===s.id)?.bot_name||s.snapshot_id||(s.id==="qwen-lumen-initial"?"v00006":s.id.match(/v\d+/)?.[0])||"版本待核验"):n).join(" / ")))}</td><td>${s.post_seal?"—":testElapsed(s.started_at,p)}</td><td>${duration(s.seconds)}</td><td>${s.games}</td><td>${s.wins} / ${s.draws} / ${s.losses}</td><td>${(s.terminal_games??s.games)?(100*s.wins/(s.terminal_games??s.games)).toFixed(1)+'%':'—'}</td><td>${s.faults}</td></tr>`).join('')||'<tr><td colspan="8">尚无开发自测记录</td></tr>';
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

let recordPage=0;
function renderResults(p){
 const all=[...(p.matches||[])].sort((a,b)=>(a.category==='acceptance')-(b.category==='acceptance')||(a.started_at??a.at)-(b.started_at??b.at));
 const pageSize=250,pages=Math.max(1,Math.ceil(all.length/pageSize));recordPage=Math.max(0,Math.min(pages-1,recordPage));
 const counts={},numbered=all.map(m=>{const group=m.category||'development';return {m,n:counts[group]=(counts[group]||0)+1};}),subset=numbered.slice(recordPage*pageSize,(recordPage+1)*pageSize);
 $('results').innerHTML=subset.map(({m,n},i)=>{const own=m.seats.findIndex(v=>isParticipantBot(v,p)),raw=explicitMatchSeats(m,p)||m.seats.map(v=>isParticipantBot(v,p)?matchVersion(m,p):v);let order=own===1?[1,0]:[0,1];const ranks=raw.map(v=>/^v\d+$/i.test(v)?Number(v.slice(1)):null);if(ranks.every(v=>v!==null)&&ranks[1]>ranks[0])order=[1,0];const names=order.map(j=>displayVersion(raw[j])),pieces=order.map(j=>(m.outcome.final_counts||m.outcome.piece_counts||[])[j]??'—');const winner=m.outcome.winner,result=m.terminal===false?'故障未形成终局':winner==null?'平局':displayVersion(raw[winner])+' 胜';const group=m.category==='acceptance'?'验收/追加':m.stage?.includes('final-selection')?'接续选版':'开发自测';const violations=(m.nominal_overruns||[]).reduce((a,b)=>a+b,0);return `<tr${i&&subset[i-1].m.category!==m.category?' class="acceptance-divider"':''}><td>${n}</td><td>${esc(names.join(' / '))}</td><td>${m.category==='acceptance'?'收卷后':testElapsed(m.started_at,p)}</td><td>${duration(m.seconds)}</td><td>${esc(group)}</td><td>${esc(result)} · ${esc(pieces.join(':'))}</td><td>${m.faults.length}${violations?' / 名义超限'+violations:''}</td></tr>`;}).join('')||'<tr><td colspan="7">该时刻尚无已知对局记录</td></tr>';
 const entries=subset.map(x=>({...x.m,description:(x.m.stage?x.m.stage+'。':'')+(x.m.time_source||'')+'；逐局颜色与结果原样保留，不附开发棋盘。'}));wireRecordDetails('results',entries,p);
 const pager=$('record-pager');pager.replaceChildren();for(const [text,target]of [['首页',0],['上一页',recordPage-1],['下一页',recordPage+1],['末页',pages-1]]){const button=document.createElement('button');button.textContent=text;button.disabled=target<0||target>=pages||target===recordPage;button.onclick=()=>{recordPage=target;renderResults(p);};pager.append(button);}const status=document.createElement('span');status.textContent=`第 ${recordPage+1} / ${pages} 页 · 共 ${all.length} 条记录`;pager.append(status);
}

function recordDescription(row,p){
 const group=(p.test_groups||[]).find(g=>g.id===row.id||g.match_ids?.includes(row.id));
 if(row.description||group?.description)return displayVersion(row.description||group.description);
 const acceptance=row.post_seal||row.category==='acceptance'||String(row.id).startsWith('acceptance-');
 const purpose=acceptance?'封存程序验收；标准初始局面，名义每步1秒、裁判判负线1.5秒，首步相同；具体阶段以原记录说明为准。':row.record_type==='participant_aggregate'?'参与者自建测试器的批量版本对照。':'完整程序对局，由裁判通过交互协议执行。';
 const count=row.games??1;
 return `${purpose}本条记录 ${count} 局；${acceptance?"":"开发 "+testElapsed(row.started_at,p)+" 开始，"}用时 ${duration(row.seconds)}。`;
}
function wireRecordDetails(id,entries,p){
 const area=$(id),rows=[...area.children];
 rows.forEach((row,i)=>{
  const entry=entries[i];if(!entry)return;
  const key=p.id+'|'+id+'|'+entry.id,detail=document.createElement('tr');
  detail.className='record-description';detail.innerHTML='<td colspan="8"></td>';if(expandedRecords.has(key))detail.firstChild.textContent=recordDescription(entry,p);
  detail.hidden=!expandedRecords.has(key);row.after(detail);row.classList.add('record-toggle');row.tabIndex=0;row.setAttribute('aria-expanded',String(!detail.hidden));
  const toggle=()=>{if(!detail.firstChild.textContent)detail.firstChild.textContent=recordDescription(entry,p);detail.hidden=!detail.hidden;row.setAttribute('aria-expanded',String(!detail.hidden));if(detail.hidden)expandedRecords.delete(key);else expandedRecords.add(key);};
  row.onclick=toggle;row.onkeydown=e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggle();}};
 });
}
function renderBoardPage(p){
 $('game-count').textContent=`${p.test_count} 条逐局记录（聚合统计不重复相加）`;
 $('boards').hidden=true;document.querySelector('.board-navigation').hidden=true;
 const descriptions=p.archive_active_tests||[];
 $('test-projects').innerHTML=descriptions.length?descriptions.map(t=>`<p class="test-description">${esc(displayVersion(t))}</p>`).join(''):'<p class="hint">暂无正在进行的测试</p>';
}
function secondsUsed(p){if(!p.started_at)return null;const terminal=['finished','sealed','deadline','failed','cancelled','infrastructure_fault'].includes(p.status);const end=p.ended_at||(terminal?null:Date.now()/1000);return end==null?null:Math.max(0,end-p.started_at);}

function timelineSpan(p){const original=data?.participants.find(x=>x.id===p.id)||p;return original.phase==='continuation'?original.timeline_duration_seconds:12000;}
function longDuration(s){s=Math.max(0,Math.round(s));const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),v=s%60;return (d?d+'天':'')+(h?h+'时':'')+m+'分'+v+'秒';}
function tickTime(p){
 const historical=historyTimes.get(p.id),s=historical??secondsUsed(p),span=timelineSpan(p),continuation=p.phase==='continuation';
 $('elapsed').textContent=longDuration(s||0)+(historical==null?' · 阶段归档':' · 回看');
 $('elapsed').title=new Date(p.started_at*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+' 至 '+new Date(p.ended_at*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）';
 $('time-axis').dataset.durationSeconds=String(span);$('time-dot').classList.add('history-draggable');$('time-dot').setAttribute('role','slider');$('time-dot').tabIndex=0;
 $('time-dot').setAttribute('aria-valuemin','0');$('time-dot').setAttribute('aria-valuemax',String(p.ended_at-p.started_at));$('time-dot').setAttribute('aria-valuenow',String(s));$('time-dot').setAttribute('aria-valuetext',longDuration(s||0));$('time-dot').setAttribute('aria-label',continuation?'回看Astra接续开发时间':'回看限时开发时间');
 $('time-dot').hidden=s===null;if(s!==null){$('time-dot').style.left=Math.min(100,100*s/span)+'%';$('time-character').src=`./agent-assets/${assets[p.id]}`;}
 document.querySelector('.time-panel h2').textContent=continuation?'Astra 接续开发时间线':'限时开发时间线';
 document.querySelector('.grace-band').hidden=continuation;
 const tick=document.querySelector('.ticks');
 tick.innerHTML=continuation?Array.from({length:9},(_,i)=>{const t=span*i/8;return `<span style="left:${100*i/8}%">${i===0?'0':t>=86400?(t/86400).toFixed(1)+'天':(t/3600).toFixed(1)+'时'}</span>`}).join(''):'<span style="left:0%">0</span><span style="left:15%">30</span><span style="left:30%">60</span><span style="left:45%">90</span><span style="left:60%">120</span><span style="left:75%">150</span><span style="left:90%">180</span><span style="left:100%">200</span>';
 $('phase-note').textContent=continuation?'固定总长 '+longDuration(span)+'，从接续开始至最后停止，拖动不改变全长。'+(p.phase_intervals||[]).map(r=>r.label).join(' → ')+'。费用未核验，不以零代替。':'180分钟正常开发＋20分钟宽限。拖动仅回看当时已知开发内容；终点归档另列后续验收/选择，不能视作限时开发。';
}
function renderTime(p){
 const span=timelineSpan(p),important=(p.events||[]).filter(e=>e.verified_summary||['error','submission','fault','clock'].includes(e.kind));
 const cutoff=p.started_at+(historyTimes.get(p.id)??(p.ended_at-p.started_at));
 const timed=important.map(e=>({...e,seconds:e.elapsed_seconds??(e.at-p.started_at)})).filter(e=>e.seconds>=0&&e.seconds<=span&&e.at<=cutoff).sort((a,b)=>a.seconds-b.seconds);
 const groups=new Map();for(const e of timed){const key=Math.floor(e.seconds/(p.phase==='continuation'?Math.max(300,span/50):300));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
 const bins=[...groups.values()];$('event-points').innerHTML=bins.map((g,i)=>`<button class="event-point${g.some(e=>['fault','error'].includes(e.kind))?' fault-event':''}" style="left:${Math.min(100,100*g[0].seconds/span)}%;--lane:${i%3}" data-event="${i}" aria-expanded="false" aria-label="${esc(longDuration(g[0].seconds)+'：'+g[0].summary)}" title="${esc(g[0].summary)}"><span>${g.length>1?g.length:'◆'}</span></button>`).join('');
 const show=i=>{selectedEvent=i;$('event-detail').innerHTML=bins[i].map(e=>`<article><small>${esc(longDuration(e.seconds))} · 保留的主办方观察</small><p>${esc(displayVersion(e.summary))}</p><details><summary>记录口径</summary>${esc(source(e.source))}</details></article>`).join('');};
 $('event-points').querySelectorAll('button').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.event);if(selectedEvent===i){selectedEvent=null;$('event-detail').replaceChildren();b.setAttribute('aria-expanded','false');}else{show(i);$('event-points').querySelectorAll('button').forEach(x=>x.setAttribute('aria-expanded',String(x===b)));}});
 if(selectedEvent!==null&&selectedEvent<bins.length)show(selectedEvent);else $('event-detail').replaceChildren();tickTime(p);
}


function renderVersions(p){
 const entries=(p.algorithm_versions||[]).map(v=>({v,s:(p.snapshots||[]).find(s=>s.id===v.snapshot_id)})).filter(x=>x.s&&x.v.description).sort((a,b)=>a.s.captured_at-b.s.captured_at);
 $('version-count').textContent=`${entries.filter(x=>x.v.valid).length} 个有运行/验收证据版本 · ${entries.length} 个留存版本`;
 preserveScroll('decisions',entries.map(({s,v})=>{const chosen=p.selected_submission,selected=chosen?.display_version===(v.display_id||s.id),post=s.captured_at>p.ended_at;
 return `<article class="version${selected?' version-selected':''}"><div class="version-index"><strong>${esc(displayVersion(v.display_id||s.id))}</strong><small>${post?'收卷后选择':longDuration(Math.max(0,s.captured_at-p.started_at))}</small>${selected?'<span class="selection-marker active">已选定</span>':''}</div><p class="version-description">${selected?`<strong class="selection-name">${esc(chosen.bot_name)}</strong> · `:''}${esc(v.description)}<br><small>${esc(v.validation_status||'留存记录；不等同于棋力提升')}</small></p></article>`;}).join('')||'<p class="hint">该时刻尚无留存版本</p>');
}

function archiveView(p,seconds){
 const cutoff=p.started_at+seconds, end=p.ended_at-p.started_at;
 if(seconds>=end-.001)return p;
 const view={...p,history_seconds:seconds,events:p.events.filter(e=>(e.elapsed_seconds??(e.at-p.started_at))<=seconds&&e.at<=cutoff),acceptance:[],selected_submission:null,original_submission:null,final_version:null,boards:[],archive_active_tests:[]};
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
  const r={...row,games:done.length,terminal_games:done.filter(m=>m.terminal!==false).length,wins:0,draws:0,losses:0,faults:0};
  for(const m of done){const seat=m.seats.indexOf(p.id);const score=m.outcome.scores[seat<0?0:seat];if(m.terminal!==false){const left=row.comparison_seats?m.seats.indexOf(row.comparison_seats[0]):seat;const actual=m.outcome.scores[left<0?0:left];r[actual===2?'wins':actual===1?'draws':'losses']++;}r.faults+=m.faults.length;}
  r.seconds=Math.max(...done.map(m=>m.at))-Math.min(...done.map(m=>m.started_at));view.development_stats.push(r);
 }
 view.archive_active_tests=[...new Set(view.archive_active_tests)];return view;
}
let pendingHistory=null,historyFrame=0,historyDragging=false;
function flushHistory(){historyFrame=0;const job=pendingHistory;pendingHistory=null;if(!job||selected!==job.p.id)return;const {p,seconds}=job;historyViews.set(p.id,archiveView(p,seconds));renderKey='';render();}
function seekHistory(p,seconds,immediate=false){
 if(!p.ended_at)return;
 seconds=Math.max(0,Math.min(seconds,p.ended_at-p.started_at));historyTimes.set(p.id,seconds);tickTime(p);
 selectedEvent=null;pendingHistory={p,seconds};if(immediate){if(historyFrame)cancelAnimationFrame(historyFrame);flushHistory();}else if(!historyFrame)historyFrame=requestAnimationFrame(flushHistory);
}
$('time-dot').onpointerdown=e=>{const p=data?.participants.find(p=>p.id===selected);if(!p?.ended_at)return;e.preventDefault();historyDragging=true;$('time-dot').setPointerCapture(e.pointerId);};
function dragHistory(e,finish=false){if(!historyDragging)return;const p=data?.participants.find(p=>p.id===selected);if(!p)return;const box=$('time-axis').getBoundingClientRect();seekHistory(p,(e.clientX-box.left)/box.width*timelineSpan(p),finish);if(finish){historyDragging=false;if($('time-dot').hasPointerCapture(e.pointerId))$('time-dot').releasePointerCapture(e.pointerId);}}
$('time-dot').onpointermove=e=>dragHistory(e);
$('time-dot').onpointerup=e=>dragHistory(e,true);
$('time-dot').onpointercancel=()=>{historyDragging=false;};
$('time-dot').onkeydown=e=>{const p=data?.participants.find(p=>p.id===selected);if(!p)return;const now=historyTimes.get(p.id)??secondsUsed(p),s=e.key==='Home'?0:e.key==='End'?p.ended_at-p.started_at:e.key==='ArrowLeft'?now-30:e.key==='ArrowRight'?now+30:e.key==='PageUp'?now-timelineSpan(p)/20:e.key==='PageDown'?now+timelineSpan(p)/20:null;if(s!==null){e.preventDefault();seekHistory(p,s,true);}};
fetch('./data/agents.json').then(r=>{if(!r.ok)throw Error('归档读取失败');return r.json();}).then(d=>{data=d;render();}).catch(e=>{$('elapsed').textContent=e.message;});
addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==$('tournament-frame').contentWindow||e.data?.type!=='tournament-height')return;const h=Number(e.data.height);if(Number.isFinite(h)&&h>0)$('tournament-frame').style.height=Math.ceil(h)+'px';});
