const $=s=>document.querySelector(s);
const auth=$('#auth'),lobby=$('#lobby'),game=$('#game'),userBar=$('#userBar'),note=$('#connectionNote'),authNote=$('#authNote'),board=$('#board'),statusEl=$('#status'),playersEl=$('#players'),spendEl=$('#spend'),diceEl=$('#dice'),diceCube=$('#diceCube'),diceCaption=$('#diceCaption'),moveBtn=$('#moveBtn'),shareBtn=$('#shareWhatsappBtn'),gamesList=$('#gamesList'),gamesCount=$('#gamesCount');
const API=(window.SL_API_URL||'')+(window.SL_API_BASE||'/games/snakes-ladders');
const TOKEN_KEY='lwc_snakes_auth_token';
const ladders=new Map([[4,25],[13,46],[33,49],[42,63],[50,69],[62,81],[74,92]]);
const snakes=new Map([[27,5],[40,3],[43,18],[54,31],[66,45],[76,58],[89,53],[99,41]]);
let socket=null,state=null,currentRoom=null,currentUser=null,overlayFrame=0,googlePromise=null,renderQueue=Promise.resolve();
const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false;
let authToken=localStorage.getItem(TOKEN_KEY)||'';
let pendingRoom=(new URLSearchParams(location.search).get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
async function api(path,options={}){
 const headers={'Content-Type':'application/json',...(options.headers||{})};
 if(options.auth!==false&&authToken)headers.Authorization='Bearer '+authToken;
 const res=await fetch(API+path,{...options,headers});
 let data={};try{data=await res.json()}catch(_){}
 if(!res.ok)throw new Error(data.error||('Request failed ('+res.status+')'));
 return data;
}
function setAuthNote(message,error=false){authNote.textContent=message||'';authNote.classList.toggle('error',!!error)}
function showAuth(){
 auth.classList.remove('hidden');lobby.classList.add('hidden');game.classList.add('hidden');userBar.classList.add('hidden');
 currentRoom=null;state=null;
}
function updateUserBar(){
 if(!currentUser)return;
 $('#userName').textContent=currentUser.name;
 const avatar=$('#userAvatar'),initial=$('#userInitial');
 if(currentUser.picture){avatar.src=currentUser.picture;avatar.hidden=false;initial.hidden=true}else{avatar.hidden=true;initial.hidden=false;initial.textContent=(currentUser.name||'U').slice(0,1).toUpperCase()}
 userBar.classList.remove('hidden');
}
function showLobby(){
 auth.classList.add('hidden');game.classList.add('hidden');lobby.classList.remove('hidden');updateUserBar();
}
async function acceptAuth(result){
 authToken=result.token;currentUser=result.user;localStorage.setItem(TOKEN_KEY,authToken);setAuthNote('');showLobby();connectSocket();await initGoogleButton(false);
}
async function restoreAuth(){
 if(!authToken){showAuth();await initGoogleButton(true);return}
 try{
   const result=await api('/auth/me');
   currentUser=result.user;showLobby();connectSocket();
 }catch(_){
   authToken='';currentUser=null;localStorage.removeItem(TOKEN_KEY);showAuth();await initGoogleButton(true);
 }
}
async function logout(){
 try{if(currentRoom&&socket)socket.emit('leaveRoom',{code:currentRoom});if(authToken)await api('/auth/logout',{method:'POST',body:'{}'})}catch(_){}
 if(socket){socket.disconnect();socket=null}
 authToken='';currentUser=null;localStorage.removeItem(TOKEN_KEY);showAuth();await initGoogleButton(true);
}
function loadGoogleScript(){
 if(window.google?.accounts?.id)return Promise.resolve();
 if(googlePromise)return googlePromise;
 googlePromise=new Promise((resolve,reject)=>{
   let s=document.querySelector('script[data-google-identity]');
   if(!s){s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.dataset.googleIdentity='1';document.head.appendChild(s)}
   s.addEventListener('load',resolve,{once:true});s.addEventListener('error',()=>reject(new Error('Could not load Google sign-in.')),{once:true});
 });
 return googlePromise;
}
async function initGoogleButton(visible=true){
 const box=$('#googleButton');if(!box)return;
 box.closest('.google-wrap')?.classList.toggle('hidden',!visible);
 if(!visible)return;
 try{
   const cfg=await api('/auth/google-config',{auth:false});
   if(!cfg.enabled||!cfg.clientId){box.innerHTML='<span class="google-unavailable">Google sign-in is not configured.</span>';return}
   await loadGoogleScript();
   box.innerHTML='';
   google.accounts.id.initialize({
     client_id:cfg.clientId,
     callback:async response=>{
       try{
         setAuthNote('Signing in with Google…');
         const result=await api('/auth/google',{method:'POST',auth:false,body:JSON.stringify({credential:response.credential})});
         await acceptAuth(result);
       }catch(err){setAuthNote(err.message,true)}
     },
     ux_mode:'popup'
   });
   google.accounts.id.renderButton(box,{theme:'outline',size:'large',text:'continue_with',shape:'pill',width:Math.min(box.clientWidth||360,360)});
 }catch(err){box.innerHTML='<span class="google-unavailable">'+escapeHtml(err.message)+'</span>'}
}

function connectSocket(){
 if(!authToken)return;
 if(socket){socket.disconnect();socket=null}
 socket=io(window.SL_API_URL,{path:window.SL_SOCKET_PATH,transports:['polling'],upgrade:false,reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000,auth:{token:authToken}});
 socket.on('connect',()=>{
   note.textContent='Game server connected.';note.classList.remove('error');
   if(pendingRoom){const code=pendingRoom;pendingRoom='';$('#roomCode').value=code;socket.emit('joinRoom',{code});const u=new URL(location.href);u.searchParams.delete('room');history.replaceState({},'',u)}
 });
 socket.on('disconnect',()=>{note.textContent='Game server disconnected. Reconnecting…';note.classList.add('error')});
 socket.on('connect_error',err=>{
   note.textContent=err.message==='Authentication required'?'Session expired. Please sign in again.':'Could not connect to game server.';
   note.classList.add('error');
   if(err.message==='Authentication required'){authToken='';localStorage.removeItem(TOKEN_KEY);showAuth();initGoogleButton(true)}
 });
 socket.on('lobbyGames',renderGames);
 socket.on('state',render);
 socket.on('roomError',m=>{alert(m);showLobby()});
}

function render(s){
 renderQueue=renderQueue.then(()=>applyState(s)).catch(err=>console.error('Render animation error',err));
}

function renderGames(games=[]){
 gamesCount.textContent=games.length+' open';
 gamesList.innerHTML='';
 if(!games.length){gamesList.innerHTML='<div class="empty-games"><strong>No open games yet.</strong><span>Create one and other signed-in players will see it here immediately.</span></div>';return}
 games.forEach(g=>{
   const row=document.createElement('article');row.className='game-row';
   row.innerHTML='<div class="game-main"><div class="game-host"><span class="host-avatar">'+escapeHtml((g.hostName||'P').slice(0,1).toUpperCase())+'</span><div><strong>'+escapeHtml(g.hostName)+"'s game"+'</strong><span>Room '+escapeHtml(g.code)+'</span></div></div><div class="seat-count">'+g.playerCount+' / '+g.maxPlayers+' players</div></div><button class="join-game-btn secondary-btn" type="button">Join game</button>';
   row.querySelector('button').onclick=()=>socket?.emit('joinRoom',{code:g.code});
   gamesList.appendChild(row);
 });
}

function roomShareData(roomCode){
 const url='https://games.learnwithchampak.live/snakes-ladders/?room='+encodeURIComponent(roomCode);
 return{title:'Learn With Champak Snakes & Ladders',text:'Join my Learn With Champak Snakes & Ladders game! Room code: '+roomCode,url};
}
function whatsappShareLink(roomCode){const data=roomShareData(roomCode);return'https://wa.me/?text='+encodeURIComponent(data.text+'\n'+data.url)}
function displayOrder(){const a=[];for(let r=9;r>=0;r--){let row=[];for(let n=r*10+1;n<=r*10+10;n++)row.push(n);if(r%2)row.reverse();a.push(...row)}return a}
function makeBoard(){
 board.innerHTML='';
 for(const n of displayOrder()){
   const c=document.createElement('div');
   c.className='cell'+(n===100?' finish':'');
   c.dataset.n=n;
   c.innerHTML='<span class="cell-number">'+n+'</span><span class="tokens"></span>';
   board.appendChild(c);
 }
 const die=document.createElement('div');
 die.id='boardDie';
 die.className='board-die';
 die.setAttribute('aria-hidden','true');
 die.innerHTML='<span class="board-die-shadow"></span><div id="boardDieCube" class="dice-cube board-die-cube show-1"><div class="dice-face face-1">⚀</div><div class="dice-face face-6">⚅</div><div class="dice-face face-3">⚂</div><div class="dice-face face-4">⚃</div><div class="dice-face face-2">⚁</div><div class="dice-face face-5">⚄</div></div>';
 board.appendChild(die);
}
function centerOf(n){const cell=board.querySelector('[data-n="'+n+'"]');if(!cell)return null;const br=board.getBoundingClientRect(),cr=cell.getBoundingClientRect();return{x:cr.left-br.left+cr.width/2,y:cr.top-br.top+cr.height/2,w:cr.width,h:cr.height}}
function svgEl(tag,attrs={}){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));return e}
function drawLadder(svg,from,to){const a=centerOf(from),b=centerOf(to);if(!a||!b)return;const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len,gap=Math.max(6,Math.min(10,a.w*.13)),g=svgEl('g',{class:'ladder-svg'});const ax1=a.x+nx*gap,ay1=a.y+ny*gap,bx1=b.x+nx*gap,by1=b.y+ny*gap,ax2=a.x-nx*gap,ay2=a.y-ny*gap,bx2=b.x-nx*gap,by2=b.y-ny*gap;g.append(svgEl('line',{x1:ax1,y1:ay1,x2:bx1,y2:by1,class:'ladder-rail'}));g.append(svgEl('line',{x1:ax2,y1:ay2,x2:bx2,y2:by2,class:'ladder-rail'}));const rc=Math.max(4,Math.min(9,Math.round(len/55)));for(let i=1;i<rc;i++){const t=i/rc,cx=a.x+dx*t,cy=a.y+dy*t;g.append(svgEl('line',{x1:cx+nx*gap,y1:cy+ny*gap,x2:cx-nx*gap,y2:cy-ny*gap,class:'ladder-rung'}))}svg.append(g)}
function drawSnake(svg,from,to,index){const a=centerOf(from),b=centerOf(to);if(!a||!b)return;const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len,wave=Math.max(18,Math.min(34,len*.12))*(index%2?1:-1),c1={x:a.x+dx*.32+nx*wave,y:a.y+dy*.32+ny*wave},c2={x:a.x+dx*.68-nx*wave,y:a.y+dy*.68-ny*wave},g=svgEl('g',{class:'snake-svg'});g.append(svgEl('path',{d:`M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,class:'snake-body snake-'+(index%4)}));const hr=Math.max(8,Math.min(12,a.w*.16));g.append(svgEl('circle',{cx:a.x,cy:a.y,r:hr,class:'snake-head snake-'+(index%4)}));const ux=dx/len,uy=dy/len,ex=-uy,ey=ux;g.append(svgEl('circle',{cx:a.x+ux*3.5+ex*3.8,cy:a.y+uy*3.5+ey*3.8,r:1.8,class:'snake-eye'}));g.append(svgEl('circle',{cx:a.x+ux*3.5-ex*3.8,cy:a.y+uy*3.5-ey*3.8,r:1.8,class:'snake-eye'}));svg.append(g)}
function drawOverlay(){cancelAnimationFrame(overlayFrame);overlayFrame=requestAnimationFrame(()=>{const old=board.querySelector('.game-overlay');if(old)old.remove();if(!board.offsetWidth||!board.offsetHeight)return;const svg=svgEl('svg',{class:'game-overlay',viewBox:`0 0 ${board.offsetWidth} ${board.offsetHeight}`,preserveAspectRatio:'none','aria-hidden':'true'});ladders.forEach((to,from)=>drawLadder(svg,from,to));let i=0;snakes.forEach((to,from)=>drawSnake(svg,from,to,i++));board.appendChild(svg)})}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function tokenElement(p,i,active=false){
 const t=document.createElement('span');
 t.className='token p'+i+(active?' active-token':'');
 t.textContent=i+1;t.title=p.name;t.dataset.playerId=p.id;
 return t;
}
function renderTokens(s,overrides=null,activeId=null){
 board.querySelectorAll('.tokens').forEach(x=>x.innerHTML='');
 s.players.forEach((p,i)=>{
   const pos=overrides&&Object.prototype.hasOwnProperty.call(overrides,p.id)?overrides[p.id]:p.pos;
   if(pos>0){
     const el=board.querySelector('[data-n="'+pos+'"] .tokens');
     if(el)el.appendChild(tokenElement(p,i,p.id===activeId));
   }
 });
}
function renderPlayers(s,activeId=null){
 const myId=socket?.id;
 playersEl.innerHTML='';
 s.players.forEach((p,i)=>{
   const d=document.createElement('div');
   d.className='prow'+(p.id===activeId&&!s.winner?' active':'');
   d.innerHTML='<span class="player-name"><span class="token p'+i+'" style="display:inline-grid">'+(i+1)+'</span><span>'+escapeHtml(p.name)+(p.id===myId?' (you)':'')+'</span></span><span>'+p.pos+' · ⭐'+p.reserve+'</span>';
   playersEl.appendChild(d);
 });
}
function setDiceFace(value){
 if(diceCube&&Number.isInteger(value))diceCube.className='dice-cube show-'+Math.max(1,Math.min(6,value));
}
function setBoardDiceFace(value){
 const cube=$('#boardDieCube');
 if(cube&&Number.isInteger(value))cube.className='dice-cube board-die-cube show-'+Math.max(1,Math.min(6,value));
}
function diceLandingSquare(value,turnIndex=0){
 const spots=[8,16,23,37,47,57,68,78,87,94];
 return spots[(value*3+turnIndex*5)%spots.length];
}
function boardDiePoint(value,turnIndex=0){
 const square=diceLandingSquare(value,turnIndex);
 const point=centerOf(square);
 if(!point)return{x:board.offsetWidth*.55,y:board.offsetHeight*.45};
 return{x:point.x,y:point.y};
}
function placeBoardDie(value,turnIndex=0){
 const die=$('#boardDie');
 if(!die)return;
 const point=boardDiePoint(value,turnIndex);
 const size=54;
 die.style.transform='translate3d('+(point.x-size/2)+'px,'+(point.y-size/2)+'px,0)';
 die.classList.add('visible','settled');
 die.classList.remove('throwing');
 setBoardDiceFace(value);
}
function hideBoardDie(){
 const die=$('#boardDie');
 if(die){die.classList.remove('visible','settled','throwing');die.getAnimations?.().forEach(a=>a.cancel())}
}
async function animateDice(value,turnIndex=0){
 const die=$('#boardDie'),cube=$('#boardDieCube');
 if(!die||!cube||!diceCaption)return;
 diceCaption.textContent='Dice rolling on the board…';
 setDiceFace(value);
 const end=boardDiePoint(value,turnIndex);
 const size=54,ex=end.x-size/2,ey=end.y-size/2;
 const sx=Math.max(8,board.offsetWidth*.05),sy=Math.max(8,board.offsetHeight-size-14);
 const mx1=board.offsetWidth*.28,my1=board.offsetHeight*.63;
 const mx2=board.offsetWidth*.52,my2=board.offsetHeight*.28;
 const mx3=board.offsetWidth*.72,my3=board.offsetHeight*.48;
 die.classList.add('visible','throwing');
 die.classList.remove('settled');
 setBoardDiceFace(1);
 die.style.transform='translate3d('+sx+'px,'+sy+'px,0)';
 if(reduceMotion||!die.animate){
   placeBoardDie(value,turnIndex);
   diceCaption.textContent='Rolled '+value;
   return;
 }
 cube.className='dice-cube board-die-cube board-tumbling';
 const anim=die.animate([
   {transform:'translate3d('+sx+'px,'+sy+'px,0) translateY(0) scale(.84) rotate(-8deg)',offset:0},
   {transform:'translate3d('+mx1+'px,'+my1+'px,0) translateY(-34px) scale(1.06) rotate(22deg)',offset:.24},
   {transform:'translate3d('+mx2+'px,'+my2+'px,0) translateY(-18px) scale(.94) rotate(-18deg)',offset:.48},
   {transform:'translate3d('+mx3+'px,'+my3+'px,0) translateY(-28px) scale(1.03) rotate(14deg)',offset:.7},
   {transform:'translate3d('+ex+'px,'+(ey-10)+'px,0) translateY(-8px) scale(.98) rotate(-5deg)',offset:.9},
   {transform:'translate3d('+ex+'px,'+ey+'px,0) translateY(0) scale(1) rotate(0deg)',offset:1}
 ],{duration:1180,easing:'cubic-bezier(.18,.72,.22,1)',fill:'forwards'});
 try{await anim.finished}catch(_){}
 die.style.transform='translate3d('+ex+'px,'+ey+'px,0)';
 anim.cancel();
 die.classList.remove('throwing');
 die.classList.add('settled');
 setBoardDiceFace(value);
 diceCaption.textContent='Rolled '+value;
 await sleep(220);
}
function updateDiceStatic(s){
 if(!diceCaption)return;
 if(Number.isInteger(s.pendingRoll)){
   setDiceFace(s.pendingRoll);
   placeBoardDie(s.pendingRoll,s.turnIndex);
   diceCaption.textContent='Rolled '+s.pendingRoll;
 }else if(s.lastMove){
   const rollIndex=Math.max(0,s.players.findIndex(p=>p.id===s.lastMove.playerId));
   setDiceFace(s.lastMove.die);
   placeBoardDie(s.lastMove.die,rollIndex);
   diceCaption.textContent=s.lastAction||('Rolled '+s.lastMove.die);
 }else{
   hideBoardDie();
   diceCaption.textContent=s.started?'Roll the dice — it will tumble across the board':'Waiting to start';
 }
}
function renderControlsAndStatus(s,locked=false){
 const myId=socket?.id;
 const me=s.players.find(p=>p.id===myId);
 const myTurn=!!me&&s.started&&!s.winner&&s.players[s.turnIndex]?.id===myId;
 const hasRoll=myTurn&&Number.isInteger(s.pendingRoll);
 spendEl.innerHTML='';
 for(let i=0;i<=Math.min(6,me?.reserve??0);i++){const o=document.createElement('option');o.value=i;o.textContent=i+' point'+(i===1?'':'s');spendEl.appendChild(o)}
 $('#rollBtn').disabled=locked||!myTurn||hasRoll;
 spendEl.disabled=locked||!hasRoll;
 moveBtn.disabled=locked||!hasRoll;
 const isHost=s.hostId===myId;
 $('#startBtn').style.display=isHost&&!s.started?'':'none';
 $('#startBtn').disabled=locked||s.players.length<2;
 $('#startBtn').title=s.players.length<2?'At least 2 players are required':'Start the game';
 if(s.winner)statusEl.textContent='🏆 '+s.winner.name+' wins!';
 else if(!s.started)statusEl.textContent=(isHost?'You created this game. ':'')+'Waiting for players — '+s.players.length+' joined. Minimum 2.';
 else if(myTurn&&!hasRoll)statusEl.textContent='Your turn — your token is highlighted. Roll the dice.';
 else if(myTurn&&hasRoll)statusEl.textContent='You rolled '+s.pendingRoll+'. Choose reserve points, then press Move.';
 else statusEl.textContent=s.players[s.turnIndex].name+"'s turn.";
}
function prepareGameView(s){
 currentRoom=s.code;$('#roomLabel').textContent=s.code;
 lobby.classList.add('hidden');auth.classList.add('hidden');game.classList.remove('hidden');updateUserBar();drawOverlay();
}
function clearStepHighlights(){board.querySelectorAll('.step-cell,.jump-cell').forEach(c=>c.classList.remove('step-cell','jump-cell'))}
async function animateMove(s,move){
 const pIndex=s.players.findIndex(p=>p.id===move.playerId);
 if(pIndex<0)return;
 const p=s.players[pIndex];
 const overrides={[p.id]:move.from};
 renderTokens(s,overrides,null);
 renderPlayers(s,p.id);
 renderControlsAndStatus(s,true);
 statusEl.textContent=p.name+' is moving '+move.steps+' square'+(move.steps===1?'':'s')+'…';

 if(move.overshoot||move.blocked){
   const token=board.querySelector('.token[data-player-id="'+p.id+'"]');
   if(token){token.classList.add('token-blocked');await sleep(reduceMotion?0:430)}
   statusEl.textContent=move.overshoot?'Move blocked — exact 100 is required.':'Move blocked — reserve points must be used before reaching 100.';
   await sleep(reduceMotion?0:220);
   clearStepHighlights();
   return;
 }

 let token=board.querySelector('.token[data-player-id="'+p.id+'"]');
 const first=Math.max(1,move.from+1);
 for(let pos=first;pos<=move.landing;pos++){
   const cell=board.querySelector('[data-n="'+pos+'"]');
   const holder=cell?.querySelector('.tokens');
   if(!holder)continue;
   clearStepHighlights();cell.classList.add('step-cell');
   if(!token){token=tokenElement(p,pIndex,false)}
   holder.appendChild(token);
   token.classList.remove('token-step');void token.offsetWidth;token.classList.add('token-step');
   await sleep(reduceMotion?0:175);
 }
 if(move.final!==move.landing){
   const finalCell=board.querySelector('[data-n="'+move.final+'"]');
   const finalHolder=finalCell?.querySelector('.tokens');
   if(finalCell&&finalHolder&&token){
     clearStepHighlights();finalCell.classList.add('jump-cell');
     statusEl.textContent=move.jumpType==='ladder'?p.name+' climbs the ladder!':p.name+' slides down the snake!';
     token.classList.remove('token-step');token.classList.add('token-jump');
     await sleep(reduceMotion?0:230);
     finalHolder.appendChild(token);
     token.classList.remove('token-jump');void token.offsetWidth;token.classList.add('token-jump');
     await sleep(reduceMotion?0:420);
   }
 }
 clearStepHighlights();
}
async function applyState(s){
 const prev=state;
 const newMove=!!s.lastMove&&s.lastMove.seq!==(prev?.lastMove?.seq??null);
 const newRoll=Number.isInteger(s.pendingRoll)&&(!Number.isInteger(prev?.pendingRoll)||prev?.turnIndex!==s.turnIndex);
 state=s;prepareGameView(s);

 if(newMove){
   await animateMove(s,s.lastMove);
   const activeId=s.started&&!s.winner?s.players[s.turnIndex]?.id:null;
   renderTokens(s,null,activeId);
   renderPlayers(s,activeId);
   renderControlsAndStatus(s,false);
   updateDiceStatic(s);
   drawOverlay();
   return;
 }

 const activeId=s.started&&!s.winner?s.players[s.turnIndex]?.id:null;
 renderTokens(s,null,activeId);
 renderPlayers(s,activeId);
 renderControlsAndStatus(s,false);
 drawOverlay();
 if(newRoll){
   renderControlsAndStatus(s,true);
   statusEl.textContent=s.players[s.turnIndex].name+' throws the dice…';
   await animateDice(s.pendingRoll,s.turnIndex);
   renderControlsAndStatus(s,false);
 }else updateDiceStatic(s);
}

$('#loginForm').onsubmit=async e=>{
 e.preventDefault();setAuthNote('Signing in…');
 try{const result=await api('/auth/login',{method:'POST',auth:false,body:JSON.stringify({email:$('#loginEmail').value.trim(),password:$('#loginPassword').value})});await acceptAuth(result)}
 catch(err){setAuthNote(err.message,true)}
};
$('#registerForm').onsubmit=async e=>{
 e.preventDefault();setAuthNote('Creating account…');
 try{const result=await api('/auth/register',{method:'POST',auth:false,body:JSON.stringify({name:$('#registerName').value.trim(),email:$('#registerEmail').value.trim(),password:$('#registerPassword').value})});await acceptAuth(result)}
 catch(err){setAuthNote(err.message,true)}
};
$('#logoutBtn').onclick=logout;
$('#createBtn').onclick=()=>socket?.emit('createRoom');
$('#joinBtn').onclick=()=>{const code=$('#roomCode').value.trim().toUpperCase();if(code)socket?.emit('joinRoom',{code})};
$('#roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5));
$('#startBtn').onclick=()=>socket?.emit('startGame',{code:currentRoom});
$('#rollBtn').onclick=()=>socket?.emit('roll',{code:currentRoom});
moveBtn.onclick=()=>socket?.emit('move',{code:currentRoom,spend:Number(spendEl.value)||0});
$('#leaveBtn').onclick=()=>{if(socket&&currentRoom)socket.emit('leaveRoom',{code:currentRoom});currentRoom=null;state=null;game.classList.add('hidden');showLobby()};
$('#copyBtn').onclick=async()=>{if(currentRoom&&navigator.clipboard){await navigator.clipboard.writeText(currentRoom);$('#copyBtn').textContent='Copied';setTimeout(()=>$('#copyBtn').textContent='Copy',1000)}};
shareBtn.onclick=async()=>{
 if(!currentRoom)return;const data=roomShareData(currentRoom);
 if(navigator.share){try{await navigator.share(data);return}catch(err){if(err&&err.name==='AbortError')return}}
 window.location.href=whatsappShareLink(currentRoom);
};
window.addEventListener('resize',()=>{if(!game.classList.contains('hidden'))drawOverlay()});
makeBoard();
restoreAuth();