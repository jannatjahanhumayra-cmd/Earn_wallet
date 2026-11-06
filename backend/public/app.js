(() => {
const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();
const initData = tg?.initData || '';
const headers = {'Content-Type':'application/json', ...(initData ? {Authorization:`tma ${initData}`} : {})};
const view = document.getElementById('view');
const gate = document.getElementById('gateModal');
const toastEl = document.getElementById('toast');
let me = null, page = 'home', pendingAction = null, gateBusy = false;

function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');setTimeout(()=>toastEl.classList.remove('show'),2600)}
async function api(url, options={}) {
  const r=await fetch(url,{...options,headers:{...headers,...(options.headers||{})}});
  const j=await r.json().catch(()=>({success:false,error:'Invalid server response'}));
  if(!r.ok||j.success===false) throw new Error(j.error||'Request failed');
  return j.data ?? j;
}
const money=n=>`৳ ${Number(n||0).toFixed(2)}`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function gateThen(fn){pendingAction=fn;gate.classList.remove('hidden')}
function closeGate(){gate.classList.add('hidden');const fn=pendingAction;pendingAction=null;if(fn)fn()}
document.getElementById('gateClose').onclick=closeGate;
document.getElementById('continueGate').onclick=closeGate;
document.getElementById('refreshBtn').onclick=()=>gateThen(()=>loadPage(page));
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>gateThen(()=>loadPage(b.dataset.page))));
function setActive(){document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page))}
function shell(title,sub,content){return `<div class="ad-slot"><small>MIDDLE ADVERTISEMENT</small><div class="ad-placeholder">Adsterra Middle Placement</div></div><h1 class="page-title">${title}</h1><p class="page-sub">${sub||''}</p>${content}`}
async function loadPage(p){
  page=p;setActive();view.innerHTML='<div class="skeleton"></div>';
  try{
    if(p==='home') await home();
    else if(p==='ads') await adsPage();
    else if(p==='tasks') await tasksPage();
    else if(p==='referral') await referralPage();
    else if(p==='wallet') await walletPage();
    else if(p==='profile') await profilePage();
    else if(p==='history') await historyPage();
  }catch(e){view.innerHTML=`<div class="empty">${esc(e.message)}<br><br><button class="secondary-btn" onclick="location.reload()">Try again</button></div>`}
}
async function refreshMe(){me=await api('/api/me');return me}
async function home(){
  await refreshMe();
  view.innerHTML=`<div class="ad-slot"><small>TOP ADVERTISEMENT</small><div class="ad-placeholder">Adsterra Top Placement</div></div>
  <div class="balance-card"><div class="eyebrow">TOTAL BALANCE</div><div class="balance">${money(me.balance)}</div><div class="balance-stats"><div><small>Today's Earning</small><b>${money(me.todayEarnings)}</b></div><div><small>Total Earning</small><b>${money(me.totalEarnings)}</b></div></div></div>
  <div class="stat-grid">
   <div class="stat-card"><div class="stat-icon">♧</div><b>${Number(me.referralsCount||0)}</b><small>Referrals</small></div>
   <div class="stat-card"><div class="stat-icon">✓</div><b>${Number(me.completedTasks||0)}</b><small>Completed Tasks</small></div>
   <div class="stat-card"><div class="stat-icon">◷</div><b>${Number(me.pendingTasks||0)}</b><small>Pending Tasks</small></div>
   <div class="stat-card"><div class="stat-icon">▣</div><b>${money(me.withdrawnAmount)}</b><small>Withdrawn</small></div>
  </div>
  <div class="section-head"><h2>Earn Money</h2><small>Choose an activity</small></div>
  <div class="feature-grid">
   ${feature('▶','Watch Ads','Watch sponsored ads','ads')}${feature('☷','Complete Tasks','Earn from tasks','tasks')}${feature('♧','Invite Friends','Referral rewards','referral')}${feature('▣','Withdraw','Request payout','wallet')}${feature('◷','History','Your transactions','history')}${feature('◉','My Profile','Account settings','profile')}
  </div>`;
  view.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>gateThen(()=>loadPage(b.dataset.go)));
}
function feature(icon,title,sub,to){return `<button class="feature-card" data-go="${to}"><span class="ico">${icon}</span><span><b>${title}</b><small>${sub}</small></span></button>`}
async function adsPage(){
 const ads=await api('/api/ads');
 view.innerHTML=shell('Watch Ads','Complete available sponsored activities to earn rewards.',`<div class="list">${ads.length?ads.map(a=>`<div class="list-card"><div><h3>${esc(a.title)}</h3><p>${Number(a.duration)} seconds • Reward ${money(a.reward)}</p></div><button class="primary-btn" data-ad="${esc(a.id)}">Start</button></div>`).join(''):'<div class="empty">No reward ads are available right now.</div>'}</div>`);
 view.querySelectorAll('[data-ad]').forEach(b=>b.onclick=()=>gateThen(()=>startAd(b.dataset.ad)));
}
async function startAd(id){
 try{const s=await api(`/api/ads/${encodeURIComponent(id)}/start`,{method:'POST',body:'{}'});if(s.url)tg?.openLink(s.url);let remaining=Number(s.duration);view.innerHTML=shell('Ad in progress','Keep this page open until the timer finishes.',`<div class="panel"><div class="amount" id="timer">${remaining}s</div><p class="muted">Reward is credited after the server validates the session.</p></div>`);const timer=setInterval(async()=>{remaining--;const el=document.getElementById('timer');if(el)el.textContent=`${Math.max(0,remaining)}s`;if(remaining<=0){clearInterval(timer);try{const done=await api('/api/ads/complete',{method:'POST',body:JSON.stringify({sessionId:s.sessionId})});toast(`Reward added: ${money(done.reward)}`);await refreshMe();await adsPage()}catch(e){toast(e.message)}}},1000)}catch(e){toast(e.message)}
}
async function tasksPage(){
 const tasks=await api('/api/tasks');
 view.innerHTML=shell('Available Tasks','Submit proof when required. Rewards need admin review.',`<div class="list">${tasks.length?tasks.map(t=>`<div class="list-card"><div><h3>${esc(t.title)}</h3><p>Reward ${money(t.reward)} • ${t.requiresProof?'Proof required':'Review required'}</p><p>${t.submissionStatus?`Status: ${esc(t.submissionStatus)}`:'Not submitted'}</p></div>${t.submissionStatus?'<span class="pill">Submitted</span>':`<button class="primary-btn" data-task="${esc(t.id)}" data-url="${esc(t.url||'')}" data-proof="${t.requiresProof?'1':'0'}">Open</button>`}</div>`).join(''):'<div class="empty">No tasks available.</div>'}</div>`);
 view.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>gateThen(()=>taskSubmit(b.dataset.task,b.dataset.url,b.dataset.proof==='1')));
}
async function taskSubmit(id,url,proofRequired){
 if(url && /^https?:\/\//i.test(url))tg?.openLink(url);
 const proof=prompt(proofRequired?'Enter task proof (link or short details):':'Optional task proof (leave blank if not required):','');
 if(proof===null)return;
 try{await api(`/api/tasks/${encodeURIComponent(id)}/submit`,{method:'POST',body:JSON.stringify({proof})});toast('Task submitted for review.');await tasksPage()}catch(e){toast(e.message)}
}
async function referralPage(){
 const d=await api('/api/referrals');
 const link=d.link||'Set TELEGRAM_BOT_USERNAME in Render to generate your invite link.';
 view.innerHTML=shell('Invite & Earn','Share your personal referral link with friends.',`<div class="panel"><div class="stat-icon">♧</div><div class="amount">${Number(d.count||0)}</div><p class="muted">Total referrals</p><div class="divider"></div><p class="muted">Referral bonus: ${money(d.bonus)}</p><div class="field"><label>Your invite link</label><div class="copy-row"><input id="refLink" readonly value="${esc(link)}"><button class="secondary-btn" id="copyRef">Copy</button></div></div></div>`);
 document.getElementById('copyRef').onclick=()=>{navigator.clipboard?.writeText(d.link||'').then(()=>toast('Copied')).catch(()=>toast('Copy not available'))};
}
async function walletPage(){
 await refreshMe();
 view.innerHTML=shell('Wallet & Withdraw','Submit a withdrawal request. Requests are reviewed by the platform.',`<div class="panel"><small class="muted">AVAILABLE BALANCE</small><div class="amount">${money(me.balance)}</div><p class="muted">Minimum withdrawal: configured by platform</p></div><div class="panel" style="margin-top:12px"><form id="withdrawForm" class="form"><div class="field"><label>Amount (BDT)</label><input name="amount" type="number" min="1" step="0.01" required placeholder="Enter amount"></div><div class="field"><label>Payment method</label><select name="method" required><option value="">Select method</option><option>bKash</option><option>Nagad</option><option>Binance USDT</option></select></div><div class="field"><label>Payment account / wallet address</label><input name="account" required minlength="5" maxlength="120" placeholder="Enter number or wallet address"></div><button class="primary-btn full">Submit Withdrawal</button></form></div>`);
 document.getElementById('withdrawForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);gateThen(async()=>{try{const d=await api('/api/withdraw',{method:'POST',body:JSON.stringify({amount:Number(f.get('amount')),method:f.get('method'),account:f.get('account')})});toast(d.message||'Request submitted');await walletPage()}catch(err){toast(err.message)}})};
}
async function historyPage(){
 const items=await api('/api/history');
 view.innerHTML=shell('Transaction History','Your latest wallet activities.',`<div class="list">${items.length?items.map(x=>`<div class="list-card"><div><h3>${esc((x.type||'transaction').replaceAll('_',' '))}</h3><p>${esc(x.note||'')} • ${esc(x.createdAt||'')}</p></div><div style="text-align:right"><b>${money(x.amount)}</b><p class="status">${esc(x.status||'')}</p></div></div>`).join(''):'<div class="empty">No transactions yet.</div>'}`);
}
async function profilePage(){
 await refreshMe();
 view.innerHTML=shell('My Profile','Your Telegram account details.',`<div class="panel"><div class="profile-row"><div class="avatar">${esc((me.firstName||'U').slice(0,1).toUpperCase())}</div><div><b>${esc([me.firstName,me.lastName].filter(Boolean).join(' ')||'Telegram User')}</b><p class="muted">@${esc(me.username||'no_username')} • ID ${esc(me.telegramId)}</p></div></div><div class="divider"></div><p class="muted">Account status: <b>${esc(me.status||'active')}</b></p><p class="muted">Joined: ${esc((me.createdAt||'').slice(0,10))}</p><button class="secondary-btn full" id="historyBtn">View transaction history</button></div>`);
 document.getElementById('historyBtn').onclick=()=>gateThen(()=>loadPage('history'));
}
async function boot(){
 if(!initData){view.innerHTML='<div class="empty">Please open EarnWalletBot from your Telegram bot. Direct browser access is not authenticated.</div>';return}
 try{const d=await api('/api/auth',{method:'POST',body:'{}'});me=d;await loadPage('home')}catch(e){view.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
}
boot();
})();