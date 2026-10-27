const express=require("express");
const http=require("http");
const cors=require("cors");
const crypto=require("crypto");
const {OAuth2Client}=require("google-auth-library");
const {Server}=require("socket.io");

const PORT=process.env.PORT||3000;
const GOOGLE_CLIENT_ID=process.env.GOOGLE_CLIENT_ID||"72126822432-tug4n0jlflluabmb1h3s4kd5rljuppvg.apps.googleusercontent.com";
const FRONTEND_ORIGINS=(process.env.FRONTEND_ORIGINS||"https://games.learnwithchampak.live").split(",").map(s=>s.trim()).filter(Boolean);
const TOTAL_SEATS=6;
const MATCH_WAIT_MS=8000;
const QUESTION_SECONDS=30;
const TEST_SECONDS=300;

const googleClient=new OAuth2Client(GOOGLE_CLIENT_ID);
const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:FRONTEND_ORIGINS,methods:["GET","POST"]},path:"/games/code-clash/socket.io"});

app.use(cors({origin:FRONTEND_ORIGINS,credentials:false}));
app.use(express.json({limit:"64kb"}));

const sessions=new Map();
const socketsByUser=new Map();
const queue=[];
const matches=new Map();

const bots=[
  {id:"bot-priya",name:"Priya",skill:.78,speed:[5,11]},
  {id:"bot-aarav",name:"Aarav",skill:.66,speed:[8,15]},
  {id:"bot-neha",name:"Neha",skill:.61,speed:[4,10]},
  {id:"bot-rahul",name:"Rahul",skill:.72,speed:[6,13]},
  {id:"bot-meera",name:"Meera",skill:.84,speed:[5,10]}
];

const bank=[
 {id:"co-op",type:"code-output",topic:"Operators",difficulty:"Easy",prompt:"What is the output?",code:"x = 7\ny = 3\nprint(x // y, x % y)",choices:["2 1","2 3","2.33 1","1 2"],correct:0,explain:"// is floor division and % gives the remainder."},
 {id:"co-cond",type:"code-output",topic:"Conditions",difficulty:"Easy",prompt:"What is the output?",code:"x = 8\nif x % 3 == 0:\n    print('A')\nelif x % 2 == 0:\n    print('B')\nelse:\n    print('C')",choices:["A","B","C","A B"],correct:1,explain:"8 is not divisible by 3, but it is divisible by 2."},
 {id:"co-loop",type:"code-output",topic:"Loops",difficulty:"Medium",prompt:"What is the output?",code:"total = 0\nfor i in range(1, 5):\n    total += i\nprint(total)",choices:["9","10","15","6"],correct:1,explain:"range(1,5) yields 1, 2, 3, 4; their sum is 10."},
 {id:"co-string",type:"code-output",topic:"Strings",difficulty:"Medium",prompt:"What is the output?",code:"s = 'python'\nprint(s[1:5:2])",choices:["yh","yto","yth","yo"],correct:0,explain:"The slice takes indexes 1 and 3: y and h."},
 {id:"co-list",type:"code-output",topic:"Lists",difficulty:"Medium",prompt:"What is the output?",code:"a = [1, 2, 3]\nb = a\nb.append(4)\nprint(len(a))",choices:["3","4","5","Error"],correct:1,explain:"a and b refer to the same list, now containing four items."},
 {id:"oc-var",type:"output-code",topic:"Variables",difficulty:"Easy",prompt:"Which code produces this output?",output:"12",choices:["x = 5\ny = 7\nprint(x + y)","x = 5\ny = 7\nprint(x * y)","x = 12\nprint(x - 1)","print(6 + 5)"],correct:0,explain:"5 + 7 evaluates to 12."},
 {id:"oc-loop",type:"output-code",topic:"Loops",difficulty:"Medium",prompt:"Which code produces this output?",output:"0\n1\n2",choices:["for i in range(3):\n    print(i)","for i in range(1, 3):\n    print(i)","for i in range(3):\n    print(i + 1)","print(0, 1, 2)"],correct:0,explain:"range(3) produces 0, 1 and 2 on separate print calls."},
 {id:"oc-string",type:"output-code",topic:"Strings",difficulty:"Medium",prompt:"Which code produces this output?",output:"PYTHON",choices:["print('python'.upper())","print('PYTHON'.lower())","print('python'.title())","print('Python'.swapcase())"],correct:0,explain:".upper() converts all letters to uppercase."},
 {id:"oc-list",type:"output-code",topic:"Lists",difficulty:"Medium",prompt:"Which code produces this output?",output:"[2, 4, 6]",choices:["print([x * 2 for x in [1, 2, 3]])","print([x + 2 for x in [1, 2, 3]])","print([2, 3, 4])","print(list(range(2, 6)))"],correct:0,explain:"Multiplying 1, 2 and 3 by 2 gives 2, 4 and 6."},
 {id:"oc-cond",type:"output-code",topic:"Conditions",difficulty:"Easy",prompt:"Which code produces this output?",output:"Pass",choices:["score = 60\nif score >= 50:\n    print('Pass')","score = 40\nif score >= 50:\n    print('Pass')","score = 60\nif score < 50:\n    print('Pass')","print('pass')"],correct:0,explain:"60 satisfies score >= 50, so Pass is printed."}
];

function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function publicQuestion(q){const {correct,explain,...safe}=q;return safe}
function shuffledQuestion(q){const pairs=q.choices.map((choice,i)=>({choice,ok:i===q.correct}));const mixed=shuffle(pairs);return {...q,choices:mixed.map(x=>x.choice),correct:mixed.findIndex(x=>x.ok)}}
function issueSession(user){const token=crypto.randomBytes(32).toString("hex");sessions.set(token,{user,createdAt:Date.now()});return token}
function authToken(req){const h=req.headers.authorization||"";return h.startsWith("Bearer ")?h.slice(7):""}
function getSession(token){return sessions.get(token)||null}
function userFromSocket(socket){const token=socket.handshake.auth?.token||"";return getSession(token)?.user||null}
function scoreForAnswer(correct,elapsed,timing){if(!correct)return 0;if(timing==="untimed")return 700;return 700+Math.max(0,Math.round(300*(1-Math.min(elapsed,30)/30)))}
function leaderboard(match){return [...match.players.values()].map(p=>({id:p.id,name:p.name,picture:p.picture||"",simulated:!!p.simulated,score:p.score||0})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name))}
function emitMatch(match,event,payload){io.to(match.id).emit(event,payload)}
function emitLeaderboard(match){emitMatch(match,"leaderboard",{players:leaderboard(match)})}

app.get("/health",(req,res)=>res.json({ok:true,service:"code-clash",online:socketsByUser.size,queued:queue.length,matches:matches.size}));
app.post("/api/google",async(req,res)=>{
  try{
    const credential=req.body?.credential;
    if(!credential)return res.status(400).json({error:"Missing Google credential"});
    const ticket=await googleClient.verifyIdToken({idToken:credential,audience:GOOGLE_CLIENT_ID});
    const p=ticket.getPayload();
    if(!p?.sub||!p?.email_verified)return res.status(401).json({error:"Google account could not be verified"});
    const user={id:p.sub,name:p.name||p.given_name||"Player",email:p.email||"",picture:p.picture||"",provider:"google"};
    const token=issueSession(user);
    res.json({token,user});
  }catch(e){console.error("google auth",e.message);res.status(401).json({error:"Google sign-in failed"});}
});
app.get("/api/me",(req,res)=>{const s=getSession(authToken(req));if(!s)return res.status(401).json({error:"Unauthorized"});res.json({user:s.user})});
app.post("/api/logout",(req,res)=>{sessions.delete(authToken(req));res.json({ok:true})});

io.use((socket,next)=>{const user=userFromSocket(socket);if(!user)return next(new Error("Unauthorized"));socket.user=user;next()});
io.on("connection",socket=>{
  const user=socket.user;
  socketsByUser.set(user.id,socket.id);
  io.emit("presence",{online:socketsByUser.size});

  socket.on("join-matchmaking",opts=>{
    if(queue.some(x=>x.user.id===user.id))return;
    const mode=["mixed","code-output","output-code"].includes(opts?.mode)?opts.mode:"mixed";
    const timing=["question","test","untimed"].includes(opts?.timing)?opts.timing:"question";
    queue.push({user,socketId:socket.id,mode,timing,joinedAt:Date.now()});
    socket.emit("queue-status",{queued:true,position:queue.length});
    tryStartMatches();
  });

  socket.on("leave-matchmaking",()=>removeFromQueue(user.id));

  socket.on("submit-answer",({matchId,questionIndex,choiceIndex,elapsed})=>{
    const match=matches.get(matchId);if(!match||match.status!=="playing"||match.questionIndex!==questionIndex)return;
    const player=match.players.get(user.id);if(!player||player.simulated||player.answered.has(questionIndex))return;
    const q=match.questions[questionIndex];
    const correct=Number(choiceIndex)===q.correct;
    const points=scoreForAnswer(correct,Number(elapsed)||0,match.timing);
    player.score+=points;player.answered.add(questionIndex);
    socket.emit("answer-result",{questionIndex,correct,points,correctIndex:q.correct,explain:q.explain});
    emitLeaderboard(match);
    checkRoundCompletion(match);
  });

  socket.on("disconnect",()=>{removeFromQueue(user.id);socketsByUser.delete(user.id);io.emit("presence",{online:socketsByUser.size})});
});

function removeFromQueue(userId){for(let i=queue.length-1;i>=0;i--)if(queue[i].user.id===userId)queue.splice(i,1)}
function compatibleGroup(){if(!queue.length)return[];const first=queue[0];return queue.filter(x=>x.mode===first.mode&&x.timing===first.timing).slice(0,TOTAL_SEATS)}
function tryStartMatches(){
  const group=compatibleGroup();if(!group.length)return;
  const oldest=group[0].joinedAt;
  if(group.length<TOTAL_SEATS&&Date.now()-oldest<MATCH_WAIT_MS){setTimeout(tryStartMatches,MATCH_WAIT_MS-(Date.now()-oldest)+25);return}
  group.forEach(x=>removeFromQueue(x.user.id));
  createMatch(group);
  if(queue.length)setTimeout(tryStartMatches,50);
}
function chooseQuestions(mode){
  let selected;if(mode==="mixed"){selected=shuffle([...shuffle(bank.filter(q=>q.type==="code-output")).slice(0,5),...shuffle(bank.filter(q=>q.type==="output-code")).slice(0,5)])}
  else selected=shuffle(bank.filter(q=>q.type===mode)).slice(0,10);
  return selected.map(shuffledQuestion);
}
function createMatch(group){
  const id="match-"+crypto.randomBytes(6).toString("hex"),mode=group[0].mode,timing=group[0].timing,players=new Map();
  group.forEach(x=>players.set(x.user.id,{...x.user,score:0,simulated:false,answered:new Set()}));
  bots.slice(0,Math.max(0,TOTAL_SEATS-group.length)).forEach(b=>players.set(b.id,{...b,score:0,simulated:true,answered:new Set()}));
  const match={id,mode,timing,questions:chooseQuestions(mode),players,questionIndex:0,status:"playing",startedAt:Date.now(),testEndsAt:timing==="test"?Date.now()+TEST_SECONDS*1000:null,roundEndsAt:null,roundTimer:null};
  matches.set(id,match);
  group.forEach(x=>{const s=io.sockets.sockets.get(x.socketId);if(s)s.join(id)});
  emitMatch(match,"match-start",{matchId:id,mode,timing,players:leaderboard(match),questionCount:match.questions.length});
  startRound(match);
}
function startRound(match){
  if(match.questionIndex>=match.questions.length)return finishMatch(match);
  const q=match.questions[match.questionIndex],now=Date.now();
  match.roundEndsAt=match.timing==="question"?now+QUESTION_SECONDS*1000:match.timing==="test"?match.testEndsAt:null;
  emitMatch(match,"question",{index:match.questionIndex,total:match.questions.length,question:publicQuestion(q),endsAt:match.roundEndsAt,timing:match.timing});
  scheduleBots(match,q);
  if(match.timing==="question")match.roundTimer=setTimeout(()=>finishRound(match),QUESTION_SECONDS*1000+100);
  if(match.timing==="test"){const left=Math.max(0,match.testEndsAt-Date.now());match.roundTimer=setTimeout(()=>finishMatch(match),left+100)}
}
function scheduleBots(match,q){
  [...match.players.values()].filter(p=>p.simulated).forEach(bot=>{
    const delay=(bot.speed[0]+Math.random()*(bot.speed[1]-bot.speed[0]))*1000;
    setTimeout(()=>{
      if(match.status!=="playing"||match.questions[match.questionIndex]!==q)return;
      const correct=Math.random()<bot.skill;
      if(correct)bot.score+=scoreForAnswer(true,delay/1000,match.timing);
      bot.answered.add(match.questionIndex);emitLeaderboard(match);checkRoundCompletion(match);
    },delay);
  });
}
function checkRoundCompletion(match){
  if(match.timing==="untimed"||match.timing==="test"){
    const all=[...match.players.values()].every(p=>p.answered.has(match.questionIndex));
    if(all)finishRound(match);
  }else{
    const real=[...match.players.values()].filter(p=>!p.simulated);
    if(real.every(p=>p.answered.has(match.questionIndex))&&[...match.players.values()].filter(p=>p.simulated).every(p=>p.answered.has(match.questionIndex)))finishRound(match);
  }
}
function finishRound(match){
  if(match.status!=="playing")return;clearTimeout(match.roundTimer);match.roundTimer=null;
  emitMatch(match,"round-complete",{index:match.questionIndex,leaderboard:leaderboard(match)});
  match.questionIndex++;
  setTimeout(()=>startRound(match),1200);
}
function finishMatch(match){
  if(match.status!=="playing")return;clearTimeout(match.roundTimer);match.status="finished";
  emitMatch(match,"match-complete",{leaderboard:leaderboard(match)});
  setTimeout(()=>matches.delete(match.id),10*60*1000);
}

setInterval(()=>{const cutoff=Date.now()-24*60*60*1000;for(const [t,s] of sessions)if(s.createdAt<cutoff)sessions.delete(t)},60*60*1000);
server.listen(PORT,()=>console.log("Code Clash server listening on",PORT));
