
const STOCKS=[
["RELIANCE.NS","RELIANCE"],["TCS.NS","TCS"],["INFY.NS","INFY"],["HDFCBANK.NS","HDFC BANK"],["ICICIBANK.NS","ICICI BANK"],
["IDFCFIRSTB.NS","IDFC FIRST"],["INDHOTEL.NS","INDIAN HOTELS"],["SBIN.NS","SBI"],["ITC.NS","ITC"],["BHARTIARTL.NS","BHARTI AIRTEL"]
];
const GOOGLE_CLIENT_ID="72126822432-tug4n0jlflluabmb1h3s4kd5rljuppvg.apps.googleusercontent.com";
const fallback={"RELIANCE.NS":[1378.4,0.62],"TCS.NS":[3064.7,-0.38],"INFY.NS":[1492.8,0.41],"HDFCBANK.NS":[1764.2,-0.12],"ICICIBANK.NS":[1409.5,0.73],"IDFCFIRSTB.NS":[69.82,1.16],"INDHOTEL.NS":[742.35,0.88],"SBIN.NS":[896.4,-0.22],"ITC.NS":[417.55,0.31],"BHARTIARTL.NS":[1981.9,0.54]};

function istDateTime(epochMs){
 return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(new Date(epochMs));
}
function isIndianMarketWindow(epochMs=Date.now()){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(epochMs));
 const o=Object.fromEntries(p.map(x=>[x.type,x.value])); if(['Sat','Sun'].includes(o.weekday))return false;
 const mins=Number(o.hour)*60+Number(o.minute); return mins>=555&&mins<=930;
}
async function quote(sym){
 try{
  const accessAt=Date.now();
  const r=await fetch('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(sym)+'?interval=1m&range=1d',{cache:'no-store'});
  if(!r.ok)throw 0;
  const j=await r.json(),result=j?.chart?.result?.[0],m=result?.meta;
  if(!m)throw 0;
  const p=m.regularMarketPrice||m.previousClose, prev=m.chartPreviousClose||m.previousClose||p, ch=((p-prev)/prev)*100;
  const quoteAt=(m.regularMarketTime||Math.floor(accessAt/1000))*1000;
  return {p,ch,ok:true,quoteAt,accessAt};
 }catch(e){const x=fallback[sym];return {p:x[0],ch:x[1],ok:false,quoteAt:null,accessAt:Date.now()}}
}
function money(n){return '₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:2})}
function setFreshness(data){
 const st=document.querySelector('#marketStatus'); if(!st)return;
 const good=data.filter(x=>x.ok&&x.quoteAt);
 if(!good.length){st.className='market-status stale';st.textContent='YAHOO UNAVAILABLE • DEMO PRICES';st.title='Live Yahoo Finance data could not be reached from this browser.';return}
 const latest=Math.max(...good.map(x=>x.quoteAt));
 const age=Date.now()-latest;
 const live=isIndianMarketWindow()&&age>=0&&age<=5*60*1000;
 st.className='market-status '+(live?'live':'stale');
 st.textContent=live?'● LIVE • '+istDateTime(latest):'Last Yahoo update: '+istDateTime(latest);
 st.title='Source: Yahoo Finance. Page accessed: '+istDateTime(Date.now());
}
async function loadTicker(){
 const el=document.querySelector('#ticker'); if(!el)return;
 const data=[]; for(const [s,n] of STOCKS){const q=await quote(s);data.push({s,n,...q})}
 const markup=data.map(x=>`<span class="tick"><b>${x.n}</b> ${money(x.p)} <span class="${x.ch>0?'up':x.ch<0?'down':'flat'}">${x.ch>0?'▲':x.ch<0?'▼':'•'} ${Math.abs(x.ch).toFixed(2)}%</span></span>`).join('');
 el.innerHTML=markup+markup; setFreshness(data);
 const sg=document.querySelector('#stockGrid'); if(sg)sg.innerHTML=data.map(x=>`<div class="stock"><div><strong>${x.n}</strong><div class="muted">${x.s}</div></div><div class="right"><strong>${money(x.p)}</strong><div class="${x.ch>=0?'up':'down'}">${x.ch>=0?'+':''}${x.ch.toFixed(2)}%</div><small class="quote-time">${x.ok&&x.quoteAt?'Updated '+istDateTime(x.quoteAt):'Demo price'}</small></div></div>`).join('');
}

function decodeJwt(token){
 try{const b=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(atob(b).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')))}catch(e){return null}
}
function googleCredential(response){
 const p=decodeJwt(response.credential); const msg=document.querySelector('#googleMessage');
 if(!p){if(msg)msg.textContent='Google sign-in could not be read. Please try again.';return}
 localStorage.setItem('mmi_google_user',JSON.stringify({name:p.name,email:p.email,picture:p.picture,sub:p.sub,signedAt:Date.now()}));
 if(msg){msg.className='google-message success';msg.textContent='Signed in as '+p.email+'. Admin approval is still required for game access.'}
 setTimeout(()=>location.href='game.html',800);
}
function initGoogle(){
 const holder=document.querySelector('#googleButton'); if(!holder)return;
 const msg=document.querySelector('#googleMessage');
 if(!(window.google&&google.accounts&&google.accounts.id)){
  if(msg){msg.textContent='Google Sign-In could not load. Check your connection or OAuth configuration.'}
  return;
 }
 try{
  google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:googleCredential,auto_select:false,cancel_on_tap_outside:true});
  google.accounts.id.renderButton(holder,{theme:'outline',size:'large',shape:'pill',text:'continue_with',width:320});
 }catch(e){if(msg)msg.textContent='Google Sign-In is not authorized for this site yet. Add games.learnwithchampak.live to the OAuth client authorized JavaScript origins.'}
}
window.googleCredential=googleCredential;
document.addEventListener('DOMContentLoaded',()=>{loadTicker();setTimeout(initGoogle,400)});


function currentUser(){
 try{return JSON.parse(localStorage.getItem('mmi_google_user')||'null')}catch(e){return null}
}
function renderUserBadge(){
 const el=document.querySelector('#userBadge'); if(!el)return;
 const u=currentUser();
 if(!u){
  el.innerHTML='<span class="user-dot"></span><span><b>Guest</b><small>Not signed in</small></span>';
  el.classList.add('guest'); return;
 }
 const pic=u.picture?'<img src="'+u.picture+'" alt="">':'<span class="user-avatar">'+(u.name||u.email||'U').slice(0,1).toUpperCase()+'</span>';
 el.innerHTML=pic+'<span><b>'+escapeHtml(u.name||'Google User')+'</b><small>'+escapeHtml(u.email||'Signed in')+'</small></span>';
}
function logoutUser(){
 localStorage.removeItem('mmi_google_user');
 try{if(window.google&&google.accounts&&google.accounts.id)google.accounts.id.disableAutoSelect()}catch(e){}
 location.href='login.html';
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

const HIST_RANGES={
 '1D':{range:'1d',interval:'5m'},'5D':{range:'5d',interval:'30m'},'1M':{range:'1mo',interval:'1d'},
 '3M':{range:'3mo',interval:'1d'},'6M':{range:'6mo',interval:'1d'},'1Y':{range:'1y',interval:'1d'}
};
async function loadHistory(){
 const box=document.querySelector('#historyPanel'); if(!box)return;
 const sel=document.querySelector('#historyStock'), rsel=document.querySelector('#historyRange');
 const sym=sel?.value||STOCKS[0][0], label=sel?.selectedOptions?.[0]?.textContent||sym, key=rsel?.value||'1M';
 const cfg=HIST_RANGES[key]||HIST_RANGES['1M'];
 box.innerHTML='<div class="history-loading">Loading '+escapeHtml(label)+' history…</div>';
 try{
  const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(sym)+'?range='+cfg.range+'&interval='+cfg.interval;
  const res=await fetch(url,{cache:'no-store'}); if(!res.ok)throw 0;
  const j=await res.json(), rr=j?.chart?.result?.[0]; if(!rr)throw 0;
  const ts=rr.timestamp||[], closes=rr.indicators?.quote?.[0]?.close||[];
  const pts=ts.map((t,i)=>[t*1000,closes[i]]).filter(x=>Number.isFinite(x[1]));
  if(pts.length<2)throw 0;
  const vals=pts.map(x=>x[1]), min=Math.min(...vals), max=Math.max(...vals), pad=(max-min||1)*.08;
  const lo=min-pad, hi=max+pad, W=760,H=220;
  const d=pts.map((p,i)=>{const x=(i/(pts.length-1))*W;const y=H-((p[1]-lo)/(hi-lo))*H;return (i?'L':'M')+x.toFixed(1)+','+y.toFixed(1)}).join(' ');
  const first=pts[0][1],last=pts[pts.length-1][1],chg=(last-first)/first*100;
  const lastAt=pts[pts.length-1][0];
  box.innerHTML='<div class="history-summary"><div><b>'+escapeHtml(label)+'</b><span>'+key+' history</span></div><div class="right"><strong>'+money(last)+'</strong><span class="'+(chg>=0?'hist-up':'hist-down')+'">'+(chg>=0?'+':'')+chg.toFixed(2)+'%</span></div></div>'+
   '<svg class="history-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-label="Historical price chart"><path d="'+d+'" fill="none" stroke="currentColor" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>'+
   '<div class="history-axis"><span>'+istDateTime(pts[0][0])+'</span><span>Low '+money(min)+' • High '+money(max)+'</span><span>'+istDateTime(lastAt)+'</span></div>'+
   '<div class="data-note">Historical data from Yahoo Finance. Last point: '+istDateTime(lastAt)+'.</div>';
 }catch(e){
  box.innerHTML='<div class="notice">Historical Yahoo Finance data could not be loaded in this browser right now.</div>';
 }
}
function initHistory(){
 const sel=document.querySelector('#historyStock'), rsel=document.querySelector('#historyRange'); if(!sel||!rsel)return;
 sel.innerHTML=STOCKS.map(([s,n])=>'<option value="'+s+'">'+n+'</option>').join('');
 sel.value='INDHOTEL.NS'; rsel.value='1M';
 sel.addEventListener('change',loadHistory); rsel.addEventListener('change',loadHistory); loadHistory();
}

document.addEventListener('DOMContentLoaded',()=>{renderUserBadge();initHistory()});
window.logoutUser=logoutUser;
window.loadHistory=loadHistory;
