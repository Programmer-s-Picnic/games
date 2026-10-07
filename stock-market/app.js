
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
