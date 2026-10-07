const $ = s => document.querySelector(s);
const lobby = $('#lobby'), game = $('#game'), note = $('#connectionNote');
const boardEl = $('#board'), statusEl = $('#status'), roomLabel = $('#roomLabel');
const cells = Array.from({length:9},(_,i)=>{const b=document.createElement('button');b.className='cell';b.dataset.i=i;b.setAttribute('aria-label',`Cell ${i+1}`);boardEl.appendChild(b);return b;});
const socket = io(window.TICTACTOE_API_URL,{path:window.TICTACTOE_SOCKET_PATH,transports:['polling'],upgrade:false,reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000});
let me=null,currentRoom=null;
function name(){return ($('#name').value.trim()||'Player').slice(0,24)}
function showGame(on){lobby.classList.toggle('hidden',on);game.classList.toggle('hidden',!on)}
function render(s){
  currentRoom=s.code; roomLabel.textContent=s.code; me=s.you;
  const px=s.players.find(p=>p.symbol==='X'), po=s.players.find(p=>p.symbol==='O');
  $('#playerX span').textContent=px?px.name:'Waiting…'; $('#playerO span').textContent=po?po.name:'Waiting…';
  $('#playerX').classList.toggle('active',s.turn==='X'&&!s.winner); $('#playerO').classList.toggle('active',s.turn==='O'&&!s.winner);
  s.board.forEach((v,i)=>{cells[i].textContent=v||'';cells[i].classList.toggle('o',v==='O');cells[i].disabled=!!v||!!s.winner||s.draw||me!==s.turn||s.players.length<2});
  if(s.winner) statusEl.textContent=`${s.winnerName||s.winner} wins!`;
  else if(s.draw) statusEl.textContent='Draw game.';
  else if(s.players.length<2) statusEl.textContent='Waiting for another player…';
  else statusEl.textContent=s.turn===me?'Your turn':`${s.turnName||s.turn}'s turn`;
  showGame(true);
}
socket.on('connect',()=>{note.textContent='Game server connected.';note.classList.remove('error')});
socket.on('disconnect',()=>{note.textContent='Game server disconnected. Reconnecting…';note.classList.add('error')});
socket.on('state',render);
socket.on('roomError',m=>{alert(m)});
$('#createBtn').onclick=()=>socket.emit('createRoom',{name:name()});
$('#joinBtn').onclick=()=>socket.emit('joinRoom',{name:name(),code:$('#roomCode').value.trim().toUpperCase()});
$('#roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5));
cells.forEach(c=>c.onclick=()=>socket.emit('move',{code:currentRoom,index:Number(c.dataset.i)}));
$('#restartBtn').onclick=()=>socket.emit('restart',{code:currentRoom});
$('#leaveBtn').onclick=()=>{socket.emit('leaveRoom',{code:currentRoom});currentRoom=null;showGame(false)};
$('#copyBtn').onclick=async()=>{if(currentRoom){await navigator.clipboard.writeText(currentRoom);$('#copyBtn').textContent='Copied';setTimeout(()=>$('#copyBtn').textContent='Copy code',1200)}};

$('#whatsappBtn').onclick=()=>{
  if(!currentRoom)return;
  const gameUrl='https://games.learnwithchampak.live/tictactoe/';
  const text=`Play Tic-Tac-Toe with me on Learn With Champak! Room code: ${currentRoom}\n${gameUrl}`;
  const url='https://wa.me/?text='+encodeURIComponent(text);
  window.open(url,'_blank','noopener,noreferrer');
};
