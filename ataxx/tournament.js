'use strict';
const $=id=>document.getElementById(id),percent=x=>x===null?'—':`${(x*100).toFixed(1)}%`,signed=x=>`${x>=0?'+':''}${x.toFixed(1)}`;
let latest=null,selected=null;
function details(){
  const p=latest?.players.find(p=>p.id===selected),box=$('player-detail');box.hidden=!p;if(!p)return;
  box.replaceChildren();const title=document.createElement('strong');title.textContent=`${p.name} · 详细统计`;box.append(title);
  const text=document.createElement('div');text.textContent=`执黑 ${p.black_games} 场 / 得分 ${p.black_points.toFixed(1)}；执白 ${p.white_games} 场 / 得分 ${p.white_points.toFixed(1)}。平均响应 ${p.mean_response?.toFixed(3)??'—'} 秒；最大 ${p.response_max.toFixed(3)} 秒；故障 ${p.faults} 次。`;box.append(text);
}
function render(doc){
  const color=doc.color_adjustment;$('color-adjustment').textContent=`本赛事黑方修正 H = ${color.black_offset_elo.toFixed(2)} Elo；同分双方黑方预期得分率 ${percent(color.equal_rating_black_expected)}。用全部540局及32组评分轨迹校准，考虑双方实力差异。`;
  latest=doc;const p=doc.progress;$('completed').innerHTML=`${doc.completed} <small>/ ${p.total}</small>`;
  $('active').innerHTML=`${p.active.length} <small>/ 4 桌</small>`;$('rate').innerHTML=`${p.games_per_minute.toFixed(2)} <small>局 / 分钟</small>`;
  $('eta').innerHTML=`${p.eta_minutes===null?'—':Math.ceil(p.eta_minutes)} <small>分钟</small>`;
  $('black-win-rate').textContent=percent(doc.completed?doc.players.reduce((n,player)=>n+player.black_points,0)/doc.completed:null);
  $('white-win-rate').textContent=percent(doc.completed?doc.players.reduce((n,player)=>n+player.white_points,0)/doc.completed:null);
  $('progress').style.width=`${100*doc.completed/p.total}%`;
  const stale=doc.server_time-p.last_update>20;
  const reconfig=p.status==='infrastructure_error'&&p.error?.error?.includes('exit 75');
  $('connection').textContent=reconfig?'正在更新调度':p.status==='completed'?'全部完赛':p.status==='infrastructure_error'?'比赛已停止':stale?'等待赛场更新':'赛场实时更新';
  $('signal').className=p.status==='infrastructure_error'||stale?'error':'live';
  $('updated').textContent=`${new Date(doc.server_time*1000).toLocaleTimeString('zh-CN',{hour12:false})} 更新`;
  $('footer-status').textContent=p.active.some(a=>a.kata)?'Kata 对局中 · 并行上限 2 桌':'CPU 对局 · 并行上限 4 桌';
  $('rankings').replaceChildren();for(const player of doc.players){
    const tr=document.createElement('tr');tr.dataset.player=player.id;
    const id=document.createElement('td'),identity=document.createElement('div');identity.className='identity';
    const rank=document.createElement('span');rank.className='rank';rank.textContent=player.rank;
    const label=document.createElement('div'),name=document.createElement('div'),sub=document.createElement('small');name.className='bot-name';name.textContent=player.name;sub.textContent=player.reference?'主办方参考':player.participant;label.append(name,sub);identity.append(rank,label);id.append(identity);tr.append(id);
    const rating=document.createElement('td');rating.innerHTML=`<div class="score">${Math.round(player.rating)}</div><div class="delta ${player.delta>=0?'up':'down'}">${signed(player.delta)}</div>`;tr.append(rating);
    for(const value of [`${player.wins} / ${player.draws} / ${player.losses}`,percent(player.score_rate)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    const streak=document.createElement('td');streak.className=player.streak_kind==='win'?'up':player.streak_kind==='loss'?'down':'';
    streak.textContent=player.streak_count?`${player.streak_count} 连${player.streak_kind==='win'?'胜':'败'}`:'—';tr.append(streak);
    const games=document.createElement('td');games.textContent=player.games;tr.append(games);
    tr.onclick=()=>{selected=selected===player.id?null:player.id;details();};$('rankings').append(tr);
  }details();
  const recentScroll=$('recent').scrollTop;
  $('recent').replaceChildren();for(const r of doc.recent){
    const row=document.createElement('div');row.className='recent-item';
    const a=document.createElement('a');a.className='recent-names';a.href=`./match.html?id=${encodeURIComponent(r.id)}`;a.target='_blank';a.textContent=`${r.names[0]} vs ${r.names[1]}`;
    const counts=document.createElement('span');counts.className='recent-counts';counts.textContent=r.counts.join(' : ');
    const small=document.createElement('small');small.textContent=`${r.winner===null?'平局':r.names[r.winner]+' 胜'} · ${r.plies} 手`;
    const delta=document.createElement('small');delta.className='recent-delta';delta.textContent=`平均 Elo ${signed(r.delta[0])} / ${signed(r.delta[1])}`;delta.title='该局在32次随机重算中的平均 Elo 变化';row.append(a,counts,small,delta);$('recent').append(row);
  }
  $('recent').scrollTop=recentScroll;
}

function renderAllMatches(doc){
 const select=$('match-filter');for(const p of doc.players){const option=new Option(p.name,p.name);select.append(option);}
 const renderList=()=>{const rows=doc.all_matches.filter(m=>!select.value||m.names.includes(select.value));$('all-matches').replaceChildren(...rows.map(m=>{const row=document.createElement('div');row.className='archive-game';const link=document.createElement('a');link.href='./match.html?id='+encodeURIComponent(m.id);link.target='_blank';link.rel='noopener';link.textContent=m.id+' · '+m.names.join(' / ');const result=document.createElement('span');result.textContent=(m.counts||[]).join(':');const info=document.createElement('small');info.textContent=(m.winner==null?'平局':m.names[m.winner]+' 胜')+' · '+m.plies+'手'+(m.faults?' · 故障'+m.faults:'');row.append(link,result,info);return row;}));};select.onchange=renderList;renderList();
 const table=document.createElement('table'),head=document.createElement('tr');for(const value of ['胜/平/负',...doc.players.map(p=>p.name)]){const cell=document.createElement('th');cell.textContent=value;head.append(cell);}table.append(head);
 for(const a of doc.players){const row=document.createElement('tr'),name=document.createElement('th');name.textContent=a.name;row.append(name);for(const b of doc.players){const cell=document.createElement('td');if(a.id===b.id)cell.textContent='—';else{const wdl=[0,0,0];for(const m of doc.all_matches){if(!m.seats.includes(a.id)||!m.seats.includes(b.id))continue;const side=m.seats.indexOf(a.id);wdl[m.winner==null?1:m.winner===side?0:2]++;}cell.textContent=wdl.some(Boolean)?wdl.join('/'):'未安排';}row.append(cell);}table.append(row);}$('mutual').replaceChildren(table);
}
if(new URLSearchParams(location.search).has('embedded'))document.body.classList.add('embedded-tournament');
fetch('./data/tournament.json').then(r=>{if(!r.ok)throw Error('正式赛归档读取失败');return r.json();}).then(doc=>{render(doc);renderAllMatches(doc);$('connection').textContent='正式赛全部完赛 · 静态归档';$('footer-status').textContent='每局棋谱独立保存，点击回放才加载。';}).catch(e=>{$('connection').textContent=e.message;});
function reportHeight(){parent.postMessage({type:'tournament-height',height:document.documentElement.scrollHeight},location.origin);}new ResizeObserver(reportHeight).observe(document.body);
