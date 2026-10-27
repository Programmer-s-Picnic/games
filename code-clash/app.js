(() => {
  const cfg = window.CODE_CLASH_CONFIG;
  const $ = (id) => document.getElementById(id);
  let currentUser = null;
  let questions = [];
  let qIndex = 0;
  let score = 0;
  let correctCount = 0;
  let timerId = null;
  let secondsLeft = 20;
  let roundStartedAt = 0;
  let locked = false;
  let skillStats = {};
  const bots = [
    { name:"Priya", skill:0.78, speed:[5,11] },
    { name:"Aarav", skill:0.66, speed:[8,15] },
    { name:"Neha", skill:0.61, speed:[4,10] },
    { name:"Rahul", skill:0.72, speed:[6,13] },
    { name:"Meera", skill:0.84, speed:[5,10] }
  ].map((b,i)=>({ ...b, id:"bot"+i, score:0, done:false }));

  const bank = [
    {topic:"Variables & Operators",difficulty:"Easy",code:"x = 7\ny = 3\nprint(x // y, x % y)",answer:"2 1",explain:"// is floor division and % gives the remainder.",skill:"Fundamentals"},
    {topic:"Conditions",difficulty:"Easy",code:"x = 8\nif x % 3 == 0:\n    print('A')\nelif x % 2 == 0:\n    print('B')\nelse:\n    print('C')",answer:"B",explain:"8 is not divisible by 3, but it is divisible by 2.",skill:"Logic"},
    {topic:"Loops",difficulty:"Medium",code:"total = 0\nfor i in range(1, 5):\n    total += i\nprint(total)",answer:"10",explain:"range(1, 5) produces 1, 2, 3, 4, whose sum is 10.",skill:"Loops"},
    {topic:"Strings",difficulty:"Medium",code:"s = 'python'\nprint(s[1:5:2])",answer:"yh",explain:"The slice takes indexes 1 and 3: 'y' and 'h'.",skill:"Strings"},
    {topic:"Lists",difficulty:"Medium",code:"a = [1, 2, 3]\nb = a\nb.append(4)\nprint(a)",answer:"[1, 2, 3, 4]",explain:"a and b refer to the same list, so appending through b changes a too.",skill:"Collections"}
  ];

  function token(){ return localStorage.getItem("codeClashToken") || ""; }
  function setMessage(text="", type=""){ const el=$("authMessage"); el.textContent=text; el.className="message"+(type?" "+type:""); }

  async function api(path, options={}) {
    const headers={"Content-Type":"application/json",...(options.headers||{})};
    const t=token(); if(t) headers.Authorization="Bearer "+t;
    const res=await fetch(cfg.apiBase+path,{...options,headers});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||"Request failed");
    return data;
  }

  function showUser(){
    $("welcome").textContent=currentUser?.name||"Player";
    const img=$("userPhoto"), fallback=$("userInitial");
    if(currentUser?.picture){img.src=currentUser.picture;img.classList.remove("hidden");fallback.classList.add("hidden");}
    else{img.classList.add("hidden");fallback.classList.remove("hidden");fallback.textContent=(currentUser?.name||"P").trim().charAt(0).toUpperCase();}
  }

  function openLobby(){
    $("authView").classList.add("hidden");
    $("lobbyView").classList.remove("hidden");
    $("gamePanel").classList.add("hidden");
    $("resultPanel").classList.add("hidden");
    $("lobbyPanel").classList.remove("hidden");
    showUser();
  }

  function openAuth(){
    currentUser=null;
    localStorage.removeItem("codeClashToken");
    $("lobbyView").classList.add("hidden");
    $("authView").classList.remove("hidden");
  }

  function saveSession(data){
    localStorage.setItem("codeClashToken",data.token);
    currentUser=data.user;
    openLobby();
  }

  function normalise(v){
    return String(v??"").trim().replace(/\r/g,"").replace(/[ \t]+$/gm,"").replace(/\n+$/,"");
  }

  function shuffle(arr){
    const a=[...arr];
    for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    return a;
  }

  function startGame(){
    questions=shuffle(bank).slice(0,5);
    qIndex=0; score=0; correctCount=0; skillStats={};
    bots.forEach(b=>{b.score=0;b.done=false;});
    $("lobbyPanel").classList.add("hidden");
    $("resultPanel").classList.add("hidden");
    $("gamePanel").classList.remove("hidden");
    renderOpponents();
    loadQuestion();
  }

  function loadQuestion(){
    clearInterval(timerId);
    locked=false;
    secondsLeft=20;
    roundStartedAt=performance.now();
    bots.forEach(b=>b.done=false);
    const q=questions[qIndex];
    $("roundLabel").textContent=`Question ${qIndex+1}/${questions.length}`;
    $("topic").textContent=q.topic.toUpperCase();
    $("difficulty").textContent=q.difficulty;
    $("codeBlock").textContent=q.code;
    $("answerInput").value="";
    $("answerInput").disabled=false;
    $("submitBtn").disabled=false;
    $("feedback").className="feedback hidden";
    $("feedback").innerHTML="";
    $("nextBtn").classList.add("hidden");
    $("timer").textContent=secondsLeft;
    renderScores();
    renderOpponents();
    simulateBots(q);
    timerId=setInterval(()=>{
      secondsLeft--;
      $("timer").textContent=Math.max(0,secondsLeft);
      if(secondsLeft<=0){clearInterval(timerId);finishRound(true);}
    },1000);
  }

  function simulateBots(q){
    bots.forEach(bot=>{
      const delay=Math.floor((bot.speed[0]+Math.random()*(bot.speed[1]-bot.speed[0]))*1000);
      setTimeout(()=>{
        if(qIndex>=questions.length || locked) return;
        const difficultyPenalty=q.difficulty==="Medium"?0.08:q.difficulty==="Hard"?0.16:0;
        const correct=Math.random()<Math.max(.15,bot.skill-difficultyPenalty);
        if(correct){
          const sec=Math.max(1,Math.min(20,delay/1000));
          bot.score+=700+Math.round(300*(1-sec/20));
        }
        bot.done=true;
        renderScores();
        renderOpponents();
      },delay);
    });
  }

  function finishRound(timedOut=false){
    if(locked)return;
    locked=true; clearInterval(timerId);
    const q=questions[qIndex];
    const elapsed=Math.min(20,(performance.now()-roundStartedAt)/1000);
    const answer=normalise($("answerInput").value);
    const isCorrect=!timedOut && normalise(answer)===normalise(q.answer);
    let earned=0;
    if(isCorrect){earned=700+Math.max(0,Math.round(300*(1-elapsed/20)));score+=earned;correctCount++;}
    if(!skillStats[q.skill]) skillStats[q.skill]={correct:0,total:0};
    skillStats[q.skill].total++;
    if(isCorrect) skillStats[q.skill].correct++;
    $("answerInput").disabled=true;
    $("submitBtn").disabled=true;
    const fb=$("feedback");
    fb.className="feedback "+(isCorrect?"good":"bad");
    fb.innerHTML=`<strong>${timedOut?"Time's up":isCorrect?"Correct! +"+earned:"Not quite"}</strong><div>Correct output: <code>${escapeHtml(q.answer)}</code></div><div>${escapeHtml(q.explain)}</div>`;
    $("nextBtn").textContent=qIndex===questions.length-1?"See Final Results":"Next Question";
    $("nextBtn").classList.remove("hidden");
    bots.forEach(bot=>{if(!bot.done)bot.done=true;});
    renderScores(); renderOpponents();
  }

  function getStandings(){
    const all=[{id:"me",name:currentUser?.name||"You",score,me:true},...bots.map(b=>({id:b.id,name:b.name,score:b.score,me:false}))];
    return all.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
  }

  function renderScores(){
    const standings=getStandings();
    const myRank=standings.findIndex(x=>x.me)+1;
    $("score").textContent=score.toLocaleString();
    $("rank").textContent=`${myRank}/${standings.length}`;
    $("leaderboardList").innerHTML=standings.map((p,i)=>`<div class="leader-row ${p.me?"me":""}"><span class="rank-num">${i+1}</span><div><strong>${escapeHtml(p.me?"You":p.name)}</strong><small>${p.me?"Real player":"Simulated candidate"}</small></div><strong>${p.score.toLocaleString()}</strong></div>`).join("");
  }

  function renderOpponents(){
    $("opponents").innerHTML=bots.map(b=>`<div class="opp ${b.done?"done":""}"><div class="face">${escapeHtml(b.name[0])}</div><strong>${escapeHtml(b.name)}</strong><small>Simulated</small></div>`).join("");
  }

  function showResults(){
    $("gamePanel").classList.add("hidden");
    $("resultPanel").classList.remove("hidden");
    const standings=getStandings();
    const rank=standings.findIndex(x=>x.me)+1;
    const accuracy=Math.round(correctCount/questions.length*100);
    $("finalScore").textContent=score.toLocaleString();
    $("finalRank").textContent=`${rank}/${standings.length}`;
    $("finalAccuracy").textContent=accuracy+"%";
    const skills=Object.entries(skillStats);
    $("skillBars").innerHTML=skills.map(([name,s])=>{
      const pct=Math.round(s.correct/s.total*100);
      return `<div class="skill-row"><span>${escapeHtml(name)}</span><div class="skill-track"><div class="skill-fill" style="width:${pct}%"></div></div><strong>${pct}%</strong></div>`;
    }).join("");
    let assessment="Keep practising Python code reading and focus on understanding each expression before answering.";
    if(accuracy>=80)assessment="Strong Python code-reading performance for this prototype. Your accuracy and speed are competitive.";
    else if(accuracy>=60)assessment="Good foundation. A little more practice with Python execution details should improve your consistency.";
    $("assessment").textContent=assessment+" This result is currently stored only for this play session.";
  }

  function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

  $("answerForm").addEventListener("submit",e=>{e.preventDefault();finishRound(false);});
  $("nextBtn").addEventListener("click",()=>{if(qIndex===questions.length-1)showResults();else{qIndex++;loadQuestion();}});
  $("playBtn").addEventListener("click",startGame);
  $("playAgainBtn").addEventListener("click",startGame);
  $("backLobbyBtn").addEventListener("click",openLobby);
  $("logoutBtn").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST",body:"{}"});}catch(_){}openAuth();});

  window.handleGoogleCredential=async(response)=>{
    setMessage("Signing in with Google...");
    try{
      const data=await api("/api/google",{method:"POST",body:JSON.stringify({credential:response.credential})});
      setMessage("Signed in.","success");
      saveSession(data);
    }catch(error){setMessage(error.message,"error");}
  };

  function initGoogle(){
    if(!window.google?.accounts?.id)return false;
    if(!cfg.googleClientId){$("googleHint").classList.remove("hidden");return true;}
    google.accounts.id.initialize({client_id:cfg.googleClientId,callback:window.handleGoogleCredential,auto_select:false,cancel_on_tap_outside:true});
    google.accounts.id.renderButton($("googleButton"),{theme:"outline",size:"large",shape:"pill",text:"continue_with",width:300});
    return true;
  }

  let attempts=0;
  const gt=setInterval(()=>{attempts++;if(initGoogle()||attempts>40)clearInterval(gt);},150);

  (async function restore(){
    if(!token())return;
    try{const data=await api("/api/me");currentUser=data.user;openLobby();}catch(_){openAuth();}
  })();
})();