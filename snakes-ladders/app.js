const $=s=>document.querySelector(s);
const lobby=$('#lobby'),game=$('#game'),note=$('#connectionNote'),board=$('#board'),statusEl=$('#status'),playersEl=$('#players'),spendEl=$('#spend'),diceEl=$('#dice');
const jumps={4:25,13:46,33:49,42:63,50:69,62:81,74:92,27:5,40:3,43:18,54:31,66:45,76:58,89:53,99:41};
const ladders=new Set([4,13,33,42,50,62,74]),snakes=new Set([27,40,43,54,66,76,89,99]);
let state=null,currentRoom=null;
const socket=io(window.SL_API_URL,{path:window.SL_SOCKET_PATH,transports:['polling'],upgrade:false,reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000});
function name(){return ($('#name').value.trim()||'Player').slice(0,24)}
function displayOrder(){const a=[];for(let r=9;r>=0;r--){let row=[];for(let n=r*10+1;n<=r*10+10;n++)row.push(n);if(r%2)row.reverse();a.push(...row)}return a}
function makeBoard(){board.innerHTML='';for(const n of displayOrder()){const c=document.createElement('div');c.className='cell'+(ladders.has(n)?' ladder':'')+(snakes.has(n)?' snake':'')+(n===100?' finish':'');c.dataset.n=n;c.innerHTML='<span>'+n+(ladders.has(n)?' 🪜':snakes.has(n)?' 🐍':n===100?' 🏆':'')+'</span><span class="tokens"></span>';board.appendChild(c)}}
function render(s){state=s;currentRoom=s.code;$('#roomLabel').textContent=s.code;lobby.classList.add('hidden');game.classList.remove('hidden');
 board.querySelectorAll('.tokens').forEach(x=>x.innerHTML='');
 s.players.forEach((p,i)=>{if(p.pos>0){const el=board.querySelector('[data-n="'+p.pos+'"] .tokens');if(el){const t=document.createElement('span');t.className='token p'+i;t.textContent=i+1;t.title=p.name;el.appendChild(t)}}});
 playersEl.innerHTML='';s.players.forEach((p,i)=>{const d=document.createElement('div');d.className='prow'+(i===s.turnIndex&&!s.winner?' active':'');d.innerHTML='<span><span class="token p'+i+'" style="display:inline-grid">'+(i+1)+'</span> '+p.name+(p.id===s.youId?' (you)':'')+'</span><span>'+p.pos+' · ⭐'+p.reserve+'</span>';playersEl.appendChild(d)});
 const me=s.players.find(p=>p.id===s.youId);spendEl.innerHTML='';for(let i=0;i<=Math.min(6,me?.reserve??0);i++){const o=document.createElement('option');o.value=i;o.textContent=i+' point'+(i===1?'':'s');spendEl.appendChild(o)}
 const myTurn=!!me&&s.started&&!s.winner&&s.players[s.turnIndex]?.id===s.youId;$('#rollBtn').disabled=!myTurn;spendEl.disabled=!myTurn;$('#startBtn').style.display=s.hostId===s.youId&&!s.started?'':'none';
 if(s.winner) statusEl.textContent='🏆 '+s.winner.name+' wins!';
 else if(!s.started) statusEl.textContent='Waiting to start — '+s.players.length+' player'+(s.players.length===1?'':'s')+' joined. Minimum 2.';
 else statusEl.textContent=myTurn?'Your turn — choose reserve points, then roll.':s.players[s.turnIndex].name+"'s turn.";
 if(s.lastAction)diceEl.textContent=s.lastAction;
}
socket.on('connect',()=>{note.textContent='Game server connected.';note.classList.remove('error')});
socket.on('disconnect',()=>{note.textContent='Game server disconnected. Reconnecting…';note.classList.add('error')});
socket.on('state',render);socket.on('roomError',m=>alert(m));
$('#createBtn').onclick=()=>socket.emit('createRoom',{name:name()});
$('#joinBtn').onclick=()=>socket.emit('joinRoom',{name:name(),code:$('#roomCode').value.trim().toUpperCase()});
$('#roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5));
$('#startBtn').onclick=()=>socket.emit('startGame',{code:currentRoom});
$('#rollBtn').onclick=()=>socket.emit('roll',{code:currentRoom,spend:Number(spendEl.value)||0});
$('#leaveBtn').onclick=()=>{socket.emit('leaveRoom',{code:currentRoom});currentRoom=null;state=null;game.classList.add('hidden');lobby.classList.remove('hidden')};
$('#copyBtn').onclick=async()=>{if(currentRoom&&navigator.clipboard){await navigator.clipboard.writeText(currentRoom);$('#copyBtn').textContent='Copied';setTimeout(()=>$('#copyBtn').textContent='Copy',1000)}};
makeBoard();
