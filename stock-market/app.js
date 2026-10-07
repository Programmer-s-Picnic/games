
const STOCKS=[
["RELIANCE.NS","RELIANCE"],["TCS.NS","TCS"],["INFY.NS","INFY"],["HDFCBANK.NS","HDFC BANK"],["ICICIBANK.NS","ICICI BANK"],
["IDFCFIRSTB.NS","IDFC FIRST"],["INDHOTEL.NS","INDIAN HOTELS"],["SBIN.NS","SBI"],["ITC.NS","ITC"],["BHARTIARTL.NS","BHARTI AIRTEL"]
];
const fallback={"RELIANCE.NS":[1378.4,0.62],"TCS.NS":[3064.7,-0.38],"INFY.NS":[1492.8,0.41],"HDFCBANK.NS":[1764.2,-0.12],"ICICIBANK.NS":[1409.5,0.73],"IDFCFIRSTB.NS":[69.82,1.16],"INDHOTEL.NS":[742.35,0.88],"SBIN.NS":[896.4,-0.22],"ITC.NS":[417.55,0.31],"BHARTIARTL.NS":[1981.9,0.54]};
async function quote(sym){
 try{
  const r=await fetch('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(sym)+'?interval=1m&range=1d');
  if(!r.ok)throw 0; const j=await r.json(),m=j.chart.result[0].meta;
  const p=m.regularMarketPrice||m.previousClose, prev=m.chartPreviousClose||m.previousClose||p, ch=((p-prev)/prev)*100;
  return [p,ch,true];
 }catch(e){const x=fallback[sym];return [x[0],x[1],false]}
}
function money(n){return '₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:2})}
async function loadTicker(){
 const el=document.querySelector('#ticker'); if(!el)return;
 const data=[]; for(const [s,n] of STOCKS){const q=await quote(s);data.push({s,n,p:q[0],c:q[1],live:q[2]})}
 const markup=data.map(x=>`<span class="tick"><b>${x.n}</b> ${money(x.p)} <span class="${x.c>0?'up':x.c<0?'down':'flat'}">${x.c>0?'▲':'▼'} ${Math.abs(x.c).toFixed(2)}%</span></span>`).join('');
 el.innerHTML=markup+markup;
 const live=data.some(x=>x.live),st=document.querySelector('#marketStatus'); if(st)st.textContent=live?'YAHOO FINANCE':'DEMO / YAHOO FALLBACK';
 const sg=document.querySelector('#stockGrid'); if(sg)sg.innerHTML=data.map(x=>`<div class="stock"><div><strong>${x.n}</strong><div class="muted">${x.s}</div></div><div class="right"><strong>${money(x.p)}</strong><div class="${x.c>=0?'up':'down'}">${x.c>=0?'+':''}${x.c.toFixed(2)}%</div></div></div>`).join('');
}
document.addEventListener('DOMContentLoaded',loadTicker);
