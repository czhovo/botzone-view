'use strict';
const $=id=>document.getElementById(id),percent=x=>x===null?'—':`${(x*100).toFixed(1)}%`,signed=x=>`${x>=0?'+':''}${x.toFixed(1)}`;
let latest=null,selected=null;
function details(){
  const p=latest?.players.find(p=>p.id===selected),box=$('player-detail');box.hidden=!p;if(!p)return;
  box.replaceChildren();const title=document.createElement('strong');title.textContent=`${p.name} · 详细统计`;box.append(title);
  const text=document.createElement('div');text.textContent=`执黑 ${p.black_games} 场 / 得分 ${p.black_points.toFixed(1)}；执白 ${p.white_games} 场 / 得分 ${p.white_points.toFixed(1)}。平均响应 ${p.mean_response?.toFixed(3)??'—'} 秒；最大 ${p.response_max.toFixed(3)} 秒；故障 ${p.faults} 次。`;box.append(text);
}
function render(doc){
  $('color-adjustment').textContent='Elo：全部 640 局随机打乱 1024 次，每次从 1000 分、K=32 开始，取最终 Elo 的平均值；胜 / 平 / 负为 1 / 0.5 / 0，不使用子数差。';
  latest=doc;const p={...doc.progress};
  if(doc.completed>=p.total){p.status='completed';p.active=[];p.eta_minutes=0;}
  $('completed').innerHTML=`${doc.completed} <small>/ ${p.total}</small>`;
  $('active').innerHTML=`${p.active.length} <small>/ 4 桌</small>`;$('rate').innerHTML=`${p.games_per_minute.toFixed(2)} <small>局 / 分钟</small>`;
  $('eta').innerHTML=`${p.eta_minutes===null?'—':Math.ceil(p.eta_minutes)} <small>分钟</small>`;
  $('black-win-rate').textContent=percent(doc.completed?doc.color_results.black_wins/doc.completed:null);
  $('white-win-rate').textContent=percent(doc.completed?doc.color_results.white_wins/doc.completed:null);
  $('progress').style.width=`${100*doc.completed/p.total}%`;
  const stale=p.status!=='completed'&&doc.server_time-p.last_update>20;
  const reconfig=p.status==='infrastructure_error'&&p.error?.error?.includes('exit 75');
  $('connection').textContent=reconfig?'正在更新调度':p.status==='completed'?'全部完赛':p.status==='infrastructure_error'?'比赛已停止':stale?'等待赛场更新':'赛场实时更新';
  $('signal').className=p.status==='infrastructure_error'||stale?'error':'live';
  $('updated').textContent=`${new Date(doc.server_time*1000).toLocaleTimeString('zh-CN',{hour12:false})} 更新`;
  $('footer-status').textContent='640 局 · Elo K=32 · 1024 次乱序平均';
  $('rankings').replaceChildren();for(const player of doc.players){
    const tr=document.createElement('tr');tr.dataset.player=player.id;
    const id=document.createElement('td'),identity=document.createElement('div');identity.className='identity';
    const rank=document.createElement('span');rank.className='rank';rank.textContent=player.rank;
    const label=document.createElement('div'),name=document.createElement('div'),sub=document.createElement('small');name.className='bot-name';name.textContent=player.name;sub.textContent=player.reference?'主办方参考':player.participant;label.append(name,sub);identity.append(rank,label);id.append(identity);tr.append(id);
    const rating=document.createElement('td');rating.innerHTML=`<div class="score">${player.elo.toFixed(1)}</div>`;tr.append(rating);
    for(const value of [`${player.wins} / ${player.draws} / ${player.losses}`,percent(player.score_rate)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    const streak=document.createElement('td');streak.className=player.streak_kind==='win'?'up':player.streak_kind==='loss'?'down':'';
    streak.textContent=player.streak_count?`${player.streak_count} 连${player.streak_kind==='win'?'胜':'败'}`:'—';tr.append(streak);
    const games=document.createElement('td');games.textContent=player.games;tr.append(games);
    tr.onclick=()=>{selected=selected===player.id?null:player.id;details();};$('rankings').append(tr);
  }details();
  const recentScroll=$('recent').scrollTop;
  $('recent').replaceChildren();for(const r of doc.recent){
    const row=document.createElement('div');row.className='recent-item';
    const a=document.createElement('a');a.className='recent-names';a.href=`./tournament-replay.html?id=${r.id}`;a.target='_blank';a.textContent=`${r.names[0]} vs ${r.names[1]}`;
    const counts=document.createElement('span');counts.className='recent-counts';counts.textContent=r.counts.join(' : ');
    const small=document.createElement('small');small.textContent=`${r.winner===null?'平局':r.names[r.winner]+' 胜'} · ${r.plies} 手`;
    const delta=document.createElement('small');delta.className='recent-delta';delta.textContent=(r.elo_changes?`平均 Elo：${r.names[0]} ${signed(r.elo_changes[0])} / ${r.names[1]} ${signed(r.elo_changes[1])}`:'')+(r.faults?' · 故障判负':'');row.append(a,counts,small,delta);$('recent').append(row);
  }
  $('recent').scrollTop=recentScroll;
  renderMatchups(doc);
}
fetch('./data/tournament.json').then(r=>{if(!r.ok)throw Error('数据读取失败');return r.json()}).then(doc=>{render(doc);renderAllMatches(doc);}).catch(e=>{$('connection').textContent=e.message;});
// Match the results panel to the ranking panel at every viewport width.
const rankingPanel=document.querySelector('.standings'),resultsPanel=document.querySelector('.results');
function sizeResults(){const height=rankingPanel.getBoundingClientRect().height;if(height>0)resultsPanel.style.height=height+'px';}
new ResizeObserver(sizeResults).observe(rankingPanel);sizeResults();
if(new URLSearchParams(location.search).has('embedded')){
 document.body.classList.add('embedded-tournament');
 const main=document.querySelector('main');let previousHeight=0;
 const reportHeight=()=>{const height=Math.ceil(main.getBoundingClientRect().height);if(height!==previousHeight){previousHeight=height;parent.postMessage({type:'tournament-height',height},location.origin);}};
 new ResizeObserver(reportHeight).observe(main);reportHeight();
}

let matchupKey='';
function renderMatchups(doc){
 const matrix=doc.head_to_head;if(!matrix)return;
 const players=doc.players,key=JSON.stringify([players.map(p=>p.id),matrix]);if(key===matchupKey)return;matchupKey=key;
 const table=$('matchup-table');table.replaceChildren();const head=document.createElement('thead'),header=document.createElement('tr');
 header.append(document.createElement('th'));for(const p of players){const th=document.createElement('th');th.scope='col';th.textContent=p.name;header.append(th);}head.append(header);table.append(head);
 const body=document.createElement('tbody');
 for(const p of players){const row=document.createElement('tr'),name=document.createElement('th');name.scope='row';name.textContent=p.name;row.append(name);
  for(const opponent of players){const cell=document.createElement('td'),r=matrix[p.id]?.[opponent.id];
   if(!r){cell.textContent='—';cell.className='matchup-diagonal';}
   else if(!r.planned){cell.textContent='未安排';cell.className='matchup-excluded';}
   else{cell.textContent=`${r.wins}/${r.draws}/${r.losses}`;cell.title=`${p.name} 对 ${opponent.name}：${r.wins} 胜、${r.draws} 平、${r.losses} 负；已完成 ${r.games}/${r.planned} 局`;}
   row.append(cell);
  }body.append(row);
 }table.append(body);
}

async function loadEloRanges(){
 const area=$('elo-ranges');
 try{
  const response=await fetch('./elo-ranges.json',{cache:'no-store'});if(!response.ok)throw Error('范围数据暂不可用');const doc=await response.json();
  const low=Math.floor(Math.min(...doc.players.map(p=>p.minimum))/100)*100,high=Math.ceil(Math.max(...doc.players.map(p=>p.maximum))/100)*100;
  const position=v=>100*(v-low)/(high-low);area.replaceChildren();
  for(const p of doc.players){
   const row=document.createElement('div');row.className='elo-range-row';
   const label=document.createElement('div');label.className='elo-range-label';const name=document.createElement('strong');name.textContent=p.name;
   const numbers=document.createElement('small');numbers.textContent=`${p.minimum.toFixed(2)}—${p.maximum.toFixed(2)} · 平均 ${p.mean.toFixed(2)}`;label.append(name,numbers);
   const track=document.createElement('div');track.className='elo-range-track';track.setAttribute('role','img');track.setAttribute('aria-label',`${p.name}：最低 ${p.minimum.toFixed(2)}，最高 ${p.maximum.toFixed(2)}，平均 ${p.mean.toFixed(2)}`);
   const line=document.createElement('span');line.className='elo-range-line';line.style.left=position(p.minimum)+'%';line.style.width=(position(p.maximum)-position(p.minimum))+'%';
   const dot=document.createElement('span');dot.className='elo-range-mean';dot.style.left=position(p.mean)+'%';track.append(line,dot);row.append(label,track);area.append(row);
  }
  const axis=document.createElement('div');axis.className='elo-range-axis';for(let i=0;i<=4;i++){const tick=document.createElement('span');tick.textContent=String(low+(high-low)*i/4);axis.append(tick);}area.append(axis);
 }catch(error){area.textContent=error.message;}
}
loadEloRanges();

function renderAllMatches(doc){
 const filter=$('match-filter');for(const p of doc.players){const o=document.createElement('option');o.value=p.name;o.textContent=p.name;filter.append(o);}
 const draw=()=>{const frag=document.createDocumentFragment();for(const m of doc.all_matches){if(filter.value&&!m.names.includes(filter.value))continue;const row=document.createElement('div');row.className='archive-game';const no=document.createElement('small');no.textContent=String(m.sequence).padStart(3,'0');const a=document.createElement('a');a.href=`./tournament-replay.html?id=${m.id}`;a.target='_blank';a.rel='noopener';a.textContent=m.names.join(' / ');const result=document.createElement('span');result.textContent=m.counts.join(' : ');const meta=document.createElement('small');meta.textContent=`${m.plies} 手${m.faults?' · 故障判负':''}`;row.append(no,a,result,meta);frag.append(row);}$('all-matches').replaceChildren(frag);};filter.onchange=draw;draw();
}
