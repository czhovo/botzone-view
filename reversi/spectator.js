const observerMode=new URLSearchParams(location.search).has('observer');
if(observerMode)document.body.classList.add('observer');
let observerFrames=new Map(),liveAnimationFactor=1;
function backlogFactor(backlog){
  // Start catch-up as soon as a second unshown ply arrives. A burst above
  // the two-ply limit is drained at the shortest animation duration.
  return backlog>2?1/945:backlog===2?60/945:1;
}
function accelerateBacklog(){
  if(!liveBusy)return;
  const backlog=liveQueue.length+1;
  if(backlog<2)return;
  const targetMs=backlog>2?1:60;
  for(const a of activeAnimations){
    const duration=Number(a.effect?.getComputedTiming().endTime)||945;
    const left=Math.max(0,duration-Number(a.currentTime||0));
    a.playbackRate=Math.max(a.playbackRate||1,left/targetMs);
  }
}
function publishDisplayed(){if(observerMode&&liveId)parent.postMessage({type:'reversi-viewer-progress',id:liveId,ply:Number(document.body.dataset.livePly||0),counts:[Number($('count0').textContent),Number($('count1').textContent)],seconds:events[index-1]?.requests?.at(-1)?.seconds},location.origin);}
// Append live frames to the existing viewer's animation machinery.
let liveId=null,livePly=0,liveQueue=[],liveBusy=false,liveGeneration=0,liveSnapshot=null,liveDone=false,notifiedTerminal=null;
function resetLive(m){
  liveGeneration++;liveId=m.match.id;livePly=observerMode&&!m.join_latest?0:m.state.ply;liveQueue=[];liveBusy=false;observerFrames.clear();
  liveDone=!!m.state.done;
  notifiedTerminal=null;
  data={result:{match:m.match,outcome:m.outcome},replay:{header:{...m.header,initial_board:observerMode&&!m.join_latest?m.header.initial_board:m.state.board},events:[]}};
  events=[];index=0;$('speed').value='1000';
  $('name0').textContent=m.match.seats[0];$('name1').textContent=m.match.seats[1];
  if(observerMode&&!m.join_latest)draw();else draw({event:{frame:{...m.state,outcome:m.outcome??m.state.outcome}}});
  document.body.dataset.matchId=liveId;document.body.dataset.livePly=livePly;publishDisplayed();
}
async function drainLive(){
  if(liveBusy)return;liveBusy=true;const generation=liveGeneration;
  try{while(liveQueue.length&&generation===liveGeneration){
    const backlog=liveQueue.length;
    let factor=observerMode?backlogFactor(backlog):undefined;
    if(observerMode&&(liveSnapshot?.phase==='completed'||liveSnapshot?.state.done)){const remaining=Math.max(0,liveSnapshot.updated_at*1000+900-Date.now());factor=Math.min(factor,remaining/Math.max(1,backlog)/945);}
    liveAnimationFactor=factor??1;
    const event=liveQueue.shift();events.push(event);await animateAdvance(events.length,factor);
    if(generation!==liveGeneration)return;
    document.body.dataset.livePly=event.frame.ply;publishDisplayed();
  }}finally{if(generation===liveGeneration){liveBusy=false;liveStatus();}}
}
function liveStatus(){
  const m=liveSnapshot;if(!m||liveBusy)return;
  if((m.state.done||m.phase==='completed')&&!liveQueue.length&&Number(document.body.dataset.livePly)===m.state.ply&&notifiedTerminal!==m.match.id){
    renderOutcome({...m.state,done:true,outcome:m.outcome??m.state.outcome});
    if($('resultBox').hidden)return;
    document.body.dataset.terminalDisplayedAt=Date.now();
    document.body.dataset.actualEndedAt=m.updated_at*1000;
    notifiedTerminal=m.match.id;const generation=liveGeneration;setTimeout(()=>{if(generation===liveGeneration)parent.postMessage({type:'reversi-viewer-terminal',id:m.match.id},location.origin);},500);
  }
  if(m.phase==='preparing')$('status').textContent='正在启动对战程序';
  else if(!m.state.done){$('status').textContent=`第 ${m.state.ply} 手 · ${m.state.turn===0?'黑':'白'}方思考中`;
    for(let s=0;s<2;s++)$(`p${s}`).classList.toggle('active',s===m.state.turn);}
}
addEventListener('message',e=>{
  if(e.source!==parent||e.origin!==location.origin)return;
  if(e.data?.type==='reversi-history-board'){
    const m=e.data;liveGeneration++;const generation=liveGeneration;
    liveQueue=[];liveBusy=false;liveSnapshot=null;liveId=m.id;notifiedTerminal=null;
    load(m.document);document.body.dataset.livePly=0;publishDisplayed();
    (async()=>{
      for(let step=1;step<=events.length;step++){
        if(generation!==liveGeneration)return;
        await animateAdvance(step,1);
        if(generation!==liveGeneration)return;
        document.body.dataset.livePly=events[step-1].frame.ply;publishDisplayed();
      }
      if(generation===liveGeneration)parent.postMessage({type:'reversi-history-terminal',id:m.id},location.origin);
    })().catch(error=>{$('status').textContent=error.message;});
    return;
  }
  if(e.data?.type==='reversi-live-clear'){
    liveGeneration++;liveId=null;liveSnapshot=null;liveQueue=[];liveBusy=false;livePly=0;liveDone=false;notifiedTerminal=null;observerFrames.clear();
    data=null;events=[];index=0;draw({header:{initial_board:Array.from({length:8},()=>Array(8).fill(0))}});
    delete document.body.dataset.matchId;document.body.dataset.livePly=0;return;
  }
  if(e.data?.type!=='reversi-live-board')return;
  const m=e.data.board;if(!m||m.header?.game!=='reversi-v1'||!validBoard(m.state?.board))return;
  liveSnapshot=m;
  $('name0').textContent=m.match.seats[0];$('name1').textContent=m.match.seats[1];
  if(observerMode&&(m.phase==='completed'||m.state.done)&&liveBusy){const remaining=Math.max(1,m.updated_at*1000+900-Date.now());const perFrame=remaining/(liveQueue.length+1);for(const a of activeAnimations){const duration=Number(a.effect?.getComputedTiming().endTime)||945;const left=Math.max(0,duration-Number(a.currentTime||0));a.playbackRate=Math.max(a.playbackRate||1,left/Math.max(1,perFrame));}}
  if(liveId!==m.match.id){resetLive(m);if(!observerMode){liveStatus();return;}}
  if(observerMode){
    data.result.outcome=m.outcome;
    for(const event of m.recent_events||[])observerFrames.set(event.frame.ply,event);
    while(observerFrames.has(livePly+1)){livePly++;liveQueue.push(observerFrames.get(livePly));}
    accelerateBacklog();
    if(liveQueue.length)drainLive();
    liveStatus();return;
  }
  // A live board must not keep playing a long backlog after a suspended tab resumes.
  const displayed=Number(document.body.dataset.livePly??livePly);
  if(m.state.ply-displayed>3){resetLive(m);liveStatus();return;}
  const newer=(m.recent_events||[]).filter(event=>event.frame.ply>livePly);
  if(m.state.ply>livePly&&(!newer.length||newer[0].frame.ply!==livePly+1))resetLive(m);
  else if(newer.length){livePly=newer.at(-1).frame.ply;liveQueue.push(...newer);drainLive();}
  // Fault adjudication can occur without an added legal ply.
  else if(m.state.done&&!liveBusy&&!liveDone){data.result.outcome=m.outcome;
    draw({event:{frame:{...m.state,outcome:m.outcome??m.state.outcome}}});liveDone=true;}
  liveStatus();
});
parent.postMessage({type:'reversi-viewer-ready'},location.origin);

if(new URLSearchParams(location.search).has("blank")){draw({header:{initial_board:Array.from({length:8},()=>Array(8).fill(0))}});}
