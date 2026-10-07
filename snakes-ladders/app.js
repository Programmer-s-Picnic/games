const $=s=>document.querySelector(s);
const lobby=$('#lobby'),game=$('#game'),note=$('#connectionNote'),board=$('#board'),statusEl=$('#status'),playersEl=$('#players'),spendEl=$('#spend'),diceEl=$('#dice'),moveBtn=$('#moveBtn'),shareWhatsappBtn=$('#shareWhatsappBtn');
const ladders=new Map([[4,25],[13,46],[33,49],[42,63],[50,69],[62,81],[74,92]]);
const snakes=new Map([[27,5],[40,3],[43,18],[54,31],[66,45],[76,58],[89,53],[99,41]]);
let state=null,currentRoom=null,overlayFrame=0;
const socket=io(window.SL_API_URL,{path:window.SL_SOCKET_PATH,transports:['polling'],upgrade:false,reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000});
function name(){return ($('#name').value.trim()||'Player').slice(0,24)}
function whatsappShareLink(roomCode){
 const pageUrl='https://games.learnwithchampak.live/snakes-ladders/?room='+encodeURIComponent(roomCode);
 const text='Join my Learn With Champak Snakes & Ladders game!\n\nRoom code: '+roomCode+'\nPlay here: '+pageUrl;
 return 'https://wa.me/?text='+encodeURIComponent(text);
}
function displayOrder(){const a=[];for(let r=9;r>=0;r--){let row=[];for(let n=r*10+1;n<=r*10+10;n++)row.push(n);if(r%2)row.reverse();a.push(...row)}return a}
function makeBoard(){board.innerHTML='';for(const n of displayOrder()){const c=document.createElement('div');c.className='cell'+(n===100?' finish':'');c.dataset.n=n;c.innerHTML='<span class="cell-number">'+n+'</span><span class="tokens"></span>';board.appendChild(c)}}
function centerOf(n){const cell=board.querySelector('[data-n="'+n+'"]');if(!cell)return null;const br=board.getBoundingClientRect(),cr=cell.getBoundingClientRect();return{x:cr.left-br.left+cr.width/2,y:cr.top-br.top+cr.height/2,w:cr.width,h:cr.height}}
function svgEl(tag,attrs={}){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));return e}
function drawLadder(svg,from,to){const a=centerOf(from),b=centerOf(to);if(!a||!b)return;const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len,gap=Math.max(6,Math.min(10,a.w*.13)),g=svgEl('g',{class:'ladder-svg'});const ax1=a.x+nx*gap,ay1=a.y+ny*gap,bx1=b.x+nx*gap,by1=b.y+ny*gap,ax2=a.x-nx*gap,ay2=a.y-ny*gap,bx2=b.x-nx*gap,by2=b.y-ny*gap;g.append(svgEl('line',{x1:ax1,y1:ay1,x2:bx1,y2:by1,class:'ladder-rail'}));g.append(svgEl('line',{x1:ax2,y1:ay2,x2:bx2,y2:by2,class:'ladder-rail'}));const rc=Math.max(4,Math.min(9,Math.round(len/55)));for(let i=1;i<rc;i++){const t=i/rc,cx=a.x+dx*t,cy=a.y+dy*t;g.append(svgEl('line',{x1:cx+nx*gap,y1:cy+ny*gap,x2:cx-nx*gap,y2:cy-ny*gap,class:'ladder-rung'}))}svg.append(g)}
function drawSnake(svg,from,to,index){const a=centerOf(from),b=centerOf(to);if(!a||!b)return;const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len,wave=Math.max(18,Math.min(34,len*.12))*(index%2?1:-1),c1={x:a.x+dx*.32+nx*wave,y:a.y+dy*.32+ny*wave},c2={x:a.x+dx*.68-nx*wave,y:a.y+dy*.68-ny*wave},g=svgEl('g',{class:'snake-svg'});g.append(svgEl('path',{d:`M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,class:'snake-body snake-'+(index%4)}));const hr=Math.max(8,Math.min(12,a.w*.16));g.append(svgEl('circle',{cx:a.x,cy:a.y,r:hr,class:'snake-head snake-'+(index%4)}));const ux=dx/len,uy=dy/len,ex=-uy,ey=ux;g.append(svgEl('circle',{cx:a.x+ux*3.5+ex*3.8,cy:a.y+uy*3.5+ey*3.8,r:1.8,class:'snake-eye'}));g.append(svgEl('circle',{cx:a.x+ux*3.5-ex*3.8,cy:a.y+uy*3.5-ey*3.8,r:1.8,class:'snake-eye'}));svg.append(g)}
function drawOverlay(){cancelAnimationFrame(overlayFrame);overlayFrame=requestAnimationFrame(()=>{const old=board.querySelector('.game-overlay');if(old)old.remove();if(!board.offsetWidth||!board.offsetHeight)return;const svg=svgEl('svg',{class:'game-overlay',viewBox:`0 0 ${board.offsetWidth} ${board.offsetHeight}`,preserveAspectRatio:'none','aria-hidden':'true'});ladders.forEach((to,from)=>drawLadder(svg,from,to));let i=0;snakes.forEach((to,from)=>drawSnake(svg,from,to,i++));board.appendChild(svg)})}
function render(s){
 state=s;currentRoom=s.code;$('#roomLabel').textContent=s.code;lobby.classList.add('hidden');game.classList.remove('hidden');
 const myId=socket.id;
 board.querySelectorAll('.tokens').forEach(x=>x.innerHTML='');
 s.players.forEach((p,i)=>{if(p.pos>0){const el=board.querySelector('[data-n="'+p.pos+'"] .tokens');if(el){const t=document.createElement('span');t.className='token p'+i;t.textContent=i+1;t.title=p.name;el.appendChild(t)}}});
 playersEl.innerHTML='';s.players.forEach((p,i)=>{const d=document.createElement('div');d.className='prow'+(i===s.turnIndex&&!s.winner?' active':'');d.innerHTML='<span class="player-name"><span class="token p'+i+'" style="display:inline-grid">'+(i+1)+'</span><span>'+p.name+(p.id===myId?' (you)':'')+'</span></span><span>'+p.pos+' · ⭐'+p.reserve+'</span>';playersEl.appendChild(d)});
 const me=s.players.find(p=>p.id===myId),myTurn=!!me&&s.started&&!s.winner&&s.players[s.turnIndex]?.id===myId,hasRoll=myTurn&&Number.isInteger(s.pendingRoll);
 spendEl.innerHTML='';for(let i=0;i<=Math.min(6,me?.reserve??0);i++){const o=document.createElement('option');o.value=i;o.textContent=i+' point'+(i===1?'':'s');spendEl.appendChild(o)}
 $('#rollBtn').disabled=!myTurn||hasRoll;spendEl.disabled=!hasRoll;moveBtn.disabled=!hasRoll;
 const isHost=s.hostId===myId;$('#startBtn').style.display=isHost&&!s.started?'':'none';$('#startBtn').disabled=s.players.length<2;$('#startBtn').title=s.players.length<2?'At least 2 players are required':'Start the game';
 if(s.winner)statusEl.textContent='🏆 '+s.winner.name+' wins!';
 else if(!s.started)statusEl.textContent=(isHost?'You are the host. ':'')+'Waiting to start — '+s.players.length+' player'+(s.players.length===1?'':'s')+' joined. Minimum 2.';
 else if(myTurn&&!hasRoll)statusEl.textContent='Your turn — roll the dice first.';
 else if(myTurn&&hasRoll)statusEl.textContent='You rolled '+s.pendingRoll+'. Choose reserve points, then press Move.';
 else statusEl.textContent=s.players[s.turnIndex].name+"'s turn.";
 diceEl.textContent=hasRoll?'🎲 '+s.pendingRoll:(s.lastAction||'—');drawOverlay();
}
socket.on('connect',()=>{note.textContent='Game server connected.';note.classList.remove('error')});
socket.on('disconnect',()=>{note.textContent='Game server disconnected. Reconnecting…';note.classList.add('error')});
socket.on('state',render);socket.on('roomError',m=>alert(m));
$('#createBtn').onclick=()=>socket.emit('createRoom',{name:name()});
$('#joinBtn').onclick=()=>socket.emit('joinRoom',{name:name(),code:$('#roomCode').value.trim().toUpperCase()});
$('#roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5));
$('#startBtn').onclick=()=>socket.emit('startGame',{code:currentRoom});
$('#rollBtn').onclick=()=>socket.emit('roll',{code:currentRoom});
moveBtn.onclick=()=>socket.emit('move',{code:currentRoom,spend:Number(spendEl.value)||0});
$('#leaveBtn').onclick=()=>{socket.emit('leaveRoom',{code:currentRoom});currentRoom=null;state=null;game.classList.add('hidden');lobby.classList.remove('hidden')};
$('#copyBtn').onclick=async()=>{if(currentRoom&&navigator.clipboard){await navigator.clipboard.writeText(currentRoom);$('#copyBtn').textContent='Copied';setTimeout(()=>$('#copyBtn').textContent='Copy',1000)}};
shareWhatsappBtn.onclick=()=>{if(currentRoom)window.open(whatsappShareLink(currentRoom),'_blank','noopener,noreferrer')};
window.addEventListener('resize',()=>{if(!game.classList.contains('hidden'))drawOverlay()});
const sharedRoom=new URLSearchParams(location.search).get('room');
if(sharedRoom)$('#roomCode').value=sharedRoom.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);
makeBoard();