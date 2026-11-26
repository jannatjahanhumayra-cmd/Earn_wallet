(() => {
'use strict';

const tg = window.Telegram?.WebApp;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0a0a');
    tg.setBackgroundColor('#0a0a0a');
  } catch(e) {}
}

const initData = tg?.initData || '';
const headers = {
  'Content-Type': 'application/json',
  ...(initData ? { Authorization: `tma ${initData}` } : {})
};

const view = document.getElementById('view');
const toastEl = document.getElementById('toast');
const menuBackdrop = document.getElementById('menuBackdrop');
const moreMenu = document.getElementById('moreMenu');
const menuToggle = document.getElementById('menuToggle');

let me = null;
let page = 'home';
let appConfig = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd = n => `$ ${Number(n || 0).toFixed(3)}`;
const usdWhole = n => `$ ${Number(n || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4})}`;

function toast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (type ? ` toast-${type}` : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

async function api(url, options = {}) {
  const r = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  let j;
  try { j = await r.json(); }
  catch {
    const hint = (await r.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);
    throw new Error(`Server error (HTTP ${r.status})${hint ? `: ${hint}` : ''}`);
  }
  if (!r.ok || j.success === false) {
    throw new Error(j.error || `Request failed (HTTP ${r.status})`);
  }
  return j.data ?? j;
}

function closeMoreMenu() {
  moreMenu?.classList.add('hidden');
  menuBackdrop?.classList.add('hidden');
  menuToggle?.setAttribute('aria-expanded', 'false');
}

function openMoreMenu() {
  moreMenu?.classList.remove('hidden');
  menuBackdrop?.classList.remove('hidden');
  menuToggle?.setAttribute('aria-expanded', 'true');
}

menuToggle?.addEventListener('click', () => {
  if (moreMenu?.classList.contains('hidden')) openMoreMenu();
  else closeMoreMenu();
});

menuBackdrop?.addEventListener('click', closeMoreMenu);

function setActiveNav() {
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
}

async function loadPage(p) {
  page = p;
  setActiveNav();
  closeMoreMenu();
  view.innerHTML = '<div class="skeleton"></div>';
  view.className = 'view fade-in';

  try {
    if (p === 'home') await homePage();
    else if (p === 'tasks') await tasksPage();
    else if (p === 'ads') await adsPage();
    else if (p === 'wallet') await walletPage();
    else if (p === 'profile') await profilePage();
    else if (p === 'referral') await referralPage();
    else if (p === 'history') await historyPage();
    else if (p === 'leaderboard') await leaderboardPage();
    else if (p === 'how') await infoPage('How It Works', 'A simple guide to using EarnWallet.', [
      ['1. Start from Telegram', 'Open the EarnWallet bot and launch the Mini App. Your Telegram account is verified automatically.'],
      ['2. Complete Activities', 'Watch ads or complete tasks. Follow the instructions provided for each activity.'],
      ['3. Wait for Verification', 'Ad rewards are processed automatically. Task rewards are credited after admin approval.'],
      ['4. Invite Friends', 'Share your referral link. Earn rewards for every successful referral.'],
      ['5. Request Withdrawal', 'Once you meet the minimum balance and referral requirements, request a payout.']
    ]);
    else if (p === 'faq') await infoPage('FAQ & Rules', 'Please review the platform rules before using EarnWallet.', [
      ['When is a referral successful?', 'A referred user must complete the required number of ad sessions.'],
      ['When can I withdraw?', 'You need to meet the minimum referral count and balance set by the platform.'],
      ['Can I edit my balance?', 'No. Wallet balances and account data are controlled by the server.'],
      ['Why are ads not showing?', 'Ad availability depends on admin settings, network, and browser conditions.'],
      ['Can I submit the same task twice?', 'No. The backend prevents duplicate submissions for the same task.']
    ]);
    else if (p === 'notifications') await emptyFeaturePage('Notifications', 'Notification system coming soon!');
    else if (p === 'support') await supportPage();
    else if (p === 'daily') await emptyFeaturePage('Daily Bonus', 'Daily bonus system launching soon!');
  } catch (e) {
    view.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div>${esc(e.message)}<br><br><button class="btn btn-outline" style="width:auto;padding:10px 24px;" onclick="loadPage('${esc(page)}')">Try Again</button></div>`;
    toast(e.message, 'error');
  }
}

document.querySelectorAll('.nav-item, .menu-link').forEach(b => {
  b.addEventListener('click', () => {
    const target = b.dataset.page;
    closeMoreMenu();
    loadPage(target);
  });
});

document.getElementById('refreshBtn').onclick = () => loadPage(page);

// ============================================================
// HOME PAGE
// ============================================================
async function homePage() {
  await refreshMe();
  const referrals = await api('/api/referrals').catch(() => ({ referrals: [], successfulCount: 0, requiredSuccessfulReferrals: 10 }));
  const history = await api('/api/history').catch(() => []);
  const tasks = await api('/api/tasks').catch(() => []);

  const withdrawals = (history || []).filter(h => h.type === 'withdrawal' && h.status === 'completed').slice(0, 5);
  const completedTasks = tasks.filter(t => t.submissionStatus === 'approved').length;
  const pendingTasks = tasks.filter(t => t.submissionStatus === 'pending').length;

  view.innerHTML = `
    <div class="balance-hero">
      <div class="balance-label">Total Balance</div>
      <div class="balance-amount">${usdWhole(me.balance / 110)}</div>
      <div class="balance-currency">USDT</div>
    </div>

    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-value" style="color:var(--success);">${usdWhole((me.todayEarnings || 0) / 110)}</div>
        <div class="stat-label">Today's Earnings</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--gold);">${Number(me.referralsCount || 0)}</div>
        <div class="stat-label">Successful Referrals</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--accent);">${completedTasks}</div>
        <div class="stat-label">Completed Tasks</div>
      </div>
    </div>

    ${withdrawals.length ? `
    <div class="section-header">
      <svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
      <h3>Recent Withdrawals</h3>
    </div>
    ${withdrawals.map(w => `
      <div class="live-ticker" style="margin-bottom:8px;">
        <div class="live-dot"></div>
        <div class="live-text">User ****${esc(w.userId?.slice(-4) || '')} withdrew ${usdWhole(Math.abs(w.amount) / 110)} USDT</div>
      </div>
    `).join('')}
    ` : ''}

    <div class="notice-banner">
      <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div class="notice-text">${appConfig?.maintenanceMessage || 'Welcome to EarnWallet! Complete tasks and watch ads to earn USDT rewards.'}</div>
    </div>

    <div class="daily-bonus" onclick="toast('Daily bonus coming soon!')">
      <div class="daily-bonus-left">
        <div class="daily-bonus-icon">🎁</div>
        <div>
          <div class="daily-bonus-title">Daily Check-in</div>
          <div class="daily-bonus-subtitle">Login daily to claim bonus</div>
        </div>
      </div>
      <button class="daily-bonus-btn">✓</button>
    </div>

    <div class="section-header">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <h3>How It Works</h3>
    </div>
    <div class="card" style="padding:0;">
      <div class="list-item" style="padding:14px 16px;">
        <div class="icon-box icon-box-accent"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div>
        <div class="list-content">
          <div class="list-title">Complete Tasks</div>
          <div class="list-desc">Follow instructions and finish tasks</div>
        </div>
      </div>
      <div class="list-item" style="padding:14px 16px;">
        <div class="icon-box icon-box-success"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="list-content">
          <div class="list-title">Earn Rewards</div>
          <div class="list-desc">Get USDT for every completed activity</div>
        </div>
      </div>
      <div class="list-item" style="padding:14px 16px;">
        <div class="icon-box" style="background:rgba(251,191,36,0.12);border-color:rgba(251,191,36,0.25);"><svg viewBox="0 0 24 24" style="stroke:var(--gold);"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
        <div class="list-content">
          <div class="list-title">Invite Friends</div>
          <div class="list-desc">Earn extra from referrals</div>
        </div>
      </div>
    </div>

    <div class="section-header">
      <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <h3>Quick Actions</h3>
    </div>
    <div class="feature-grid">
      ${featureCard('▶', 'Watch Ads', 'Earn by watching', 'ads')}
      ${featureCard('☷', 'Complete Tasks', 'Do tasks & earn', 'tasks')}
      ${featureCard('♧', 'Invite Friends', 'Referral rewards', 'referral')}
      ${featureCard('▣', 'Withdraw', 'Request payout', 'wallet')}
      ${featureCard('◷', 'History', 'Your transactions', 'history')}
      ${featureCard('◉', 'Profile', 'Account settings', 'profile')}
    </div>

    <div class="section-header">
      <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 3.88-9.36L1 10"/></svg>
      <h3>Recent Activity</h3>
    </div>
    ${(history || []).slice(0, 5).length ? (history || []).slice(0, 5).map(h => `
      <div class="tx-item">
        <div class="tx-left">
          <div class="tx-icon">${h.type === 'ad_reward' ? '▶' : h.type === 'task_reward' ? '☷' : '↗'}</div>
          <div>
            <div class="tx-title">${esc((h.type || '').replace(/_/g, ' '))}</div>
            <div class="tx-date">${esc(h.createdAt?.slice(0, 10) || '')}</div>
          </div>
        </div>
        <div class="tx-amount ${h.amount > 0 ? 'positive' : 'negative'}">${h.amount > 0 ? '+' : ''}${usdWhole(Math.abs(h.amount) / 110)}</div>
      </div>
    `).join('') : '<div class="empty-state"><div class="empty-state-icon">📋</div>No activity yet</div>'}
  `;

  view.querySelectorAll('[data-go]').forEach(b => {
    b.onclick = () => loadPage(b.dataset.go);
  });
}

function featureCard(icon, title, sub, to) {
  return `<button class="feature-card" data-go="${to}">
    <div class="ico">${icon}</div>
    <span><b>${title}</b><small>${sub}</small></span>
  </button>`;
}

// ============================================================
// TASKS PAGE
// ============================================================
async function tasksPage() {
  const tasks = await api('/api/tasks');

  const available = tasks.filter(t => !t.submissionStatus);
  const pending = tasks.filter(t => t.submissionStatus === 'pending');
  const completed = tasks.filter(t => t.submissionStatus === 'approved');

  view.innerHTML = `
    <h1 class="page-title">Tasks</h1>
    <p class="page-subtitle">Complete tasks and earn USDT rewards</p>

    <div class="tabs">
      <button class="tab active" onclick="switchTaskTab(this, 'available')">Available (${available.length})</button>
      <button class="tab" onclick="switchTaskTab(this, 'pending')">Pending (${pending.length})</button>
      <button class="tab" onclick="switchTaskTab(this, 'completed')">Completed (${completed.length})</button>
    </div>

    <div id="task-available">
      ${available.length ? available.map(t => taskCard(t)).join('') : '<div class="empty-state"><div class="empty-state-icon">☷</div>No available tasks</div>'}
    </div>

    <div id="task-pending" class="hidden">
      ${pending.length ? pending.map(t => taskCard(t, 'pending')).join('') : '<div class="empty-state"><div class="empty-state-icon">⏳</div>No pending tasks</div>'}
    </div>

    <div id="task-completed" class="hidden">
      ${completed.length ? completed.map(t => taskCard(t, 'completed')).join('') : '<div class="empty-state"><div class="empty-state-icon">✓</div>No completed tasks</div>'}
    </div>
  `;

  view.querySelectorAll('[data-task]').forEach(b => {
    b.onclick = () => {
      const task = tasks.find(t => t.id === b.dataset.task);
      if (task) taskDetails(task);
    };
  });
}

window.switchTaskTab = function(el, tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['available', 'pending', 'completed'].forEach(t => {
    document.getElementById(`task-${t}`)?.classList.toggle('hidden', t !== tab);
  });
};

function taskCard(t, status) {
  const btnClass = status === 'pending' ? 'pending' : status === 'completed' ? 'completed' : '';
  const btnText = status === 'pending' ? 'Pending' : status === 'completed' ? 'Done' : 'Start';
  return `
    <div class="task-card">
      <div class="task-logo">${t.logo || '☷'}</div>
      <div class="task-info">
        <div class="task-name">${esc(t.title)}</div>
        <div class="task-meta">
          <span class="task-reward">${usdWhole(t.reward / 110)} USDT</span>
          ${t.category ? `<span class="badge badge-info">${esc(t.category)}</span>` : ''}
        </div>
      </div>
      ${!status ? `<button class="task-btn" data-task="${esc(t.id)}">${btnText}</button>` : `<span class="task-btn ${btnClass}">${btnText}</span>`}
    </div>
  `;
}

function taskDetails(task) {
  view.innerHTML = `
    <h1 class="page-title">Task Details</h1>
    <p class="page-subtitle">${esc(task.title)}</p>

    <div class="card card-accent">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span class="badge badge-info">${esc(task.category || 'Task')}</span>
        <span class="task-reward" style="font-size:18px;">${usdWhole(task.reward / 110)} USDT</span>
      </div>
      <div class="task-name" style="font-size:16px;margin-bottom:8px;">${esc(task.title)}</div>
      <p style="color:var(--text-secondary);font-size:13px;line-height:1.7;margin-bottom:16px;">${esc(task.description || 'Follow the task instructions and upload proof.')}</p>
      ${task.url ? `<a href="${esc(task.url)}" target="_blank" class="btn btn-outline" style="margin-bottom:12px;text-decoration:none;" onclick="if(tg?.openLink){tg.openLink('${esc(task.url)}');return false;}">Open Task Link ↗</a>` : ''}
    </div>

    <div class="section-header">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <h3>Upload Proof</h3>
    </div>

    <label class="upload-zone" id="uploadZone">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <strong>Choose Screenshot</strong>
      <span>JPG or PNG · Max 650 KB</span>
      <input type="file" id="taskProofImage" accept="image/png,image/jpeg" style="display:none;">
    </label>

    <img id="taskImagePreview" class="preview-img hidden" alt="Screenshot preview">

    ${task.requiresProof !== false ? `
    <div class="field" style="margin-top:8px;">
      <label style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">Additional Info (Optional)</label>
      <textarea id="taskProofText" class="input-field" rows="3" placeholder="Describe how you completed the task..." style="margin-bottom:0;"></textarea>
    </div>
    ` : ''}

    <button class="btn btn-accent" id="submitTaskProof">Submit</button>
    <p style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:12px;">Reward will be added after admin approval</p>
  `;

  const input = document.getElementById('taskProofImage');
  const preview = document.getElementById('taskImagePreview');
  const uploadZone = document.getElementById('uploadZone');
  let proofImage = '';

  uploadZone.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast('Please select JPG or PNG', 'error'); return;
    }
    try {
      proofImage = await compressProofImage(file);
      preview.src = proofImage;
      preview.classList.remove('hidden');
      uploadZone.classList.add('hidden');
    } catch (e) { toast(e.message, 'error'); }
  };

  document.getElementById('submitTaskProof').onclick = async () => {
    if (!proofImage) { toast('Please upload a screenshot first', 'error'); return; }
    const btn = document.getElementById('submitTaskProof');
    btn.disabled = true; btn.textContent = 'Submitting...';
    try {
      const proofText = document.getElementById('taskProofText')?.value?.trim() || '';
      await api(`/api/tasks/${encodeURIComponent(task.id)}/submit`, {
        method: 'POST',
        body: JSON.stringify({ proofImageDataUrl: proofImage, proof: proofText })
      });
      toast('Task submitted successfully!', 'success');
      await tasksPage();
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Submit'; }
  };
}

function compressProofImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        const maxSide = 1280, scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.78, data = canvas.toDataURL('image/jpeg', quality);
        while (data.length > 850000 && quality > 0.42) { quality -= 0.08; data = canvas.toDataURL('image/jpeg', quality); }
        if (data.length > 850000) return reject(new Error('Image too large. Choose a smaller file.'));
        resolve(data);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================
// ADS PAGE
// ============================================================
async function adsPage() {
  const ads = await api('/api/ads');

  view.innerHTML = `
    <h1 class="page-title">Ads</h1>
    <p class="page-subtitle">Watch ads and earn USDT rewards</p>

    ${ads.length ? ads.map(a => `
      <div class="ad-card">
        <div class="ad-header">
          <span class="ad-badge ad-badge-sponsored">SPONSORED</span>
          <span class="ad-timer">⏱ ${a.duration} sec</span>
        </div>
        <div class="ad-title">${esc(a.title)}</div>
        <div class="ad-reward">${usdWhole(a.reward / 110)}</div>
        <div class="ad-reward-label">USDT Reward</div>
        <div class="ad-footer">
          <span class="ad-meta">Watch to earn</span>
          <button class="task-btn" data-ad="${esc(a.id)}">Start</button>
        </div>
      </div>
    `).join('') : '<div class="empty-state"><div class="empty-state-icon">▶</div>No ads available right now</div>'}
  `;

  view.querySelectorAll('[data-ad]').forEach(b => {
    b.onclick = () => startAd(b.dataset.ad);
  });
}

async function startAd(id) {
  try {
    const s = await api(`/api/ads/${encodeURIComponent(id)}/start`, { method: 'POST', body: '{}' });

    if (s.url) {
      if (tg?.openLink) tg.openLink(s.url);
      else window.open(s.url, '_blank', 'noopener,noreferrer');
    }

    let remaining = Number(s.duration);

    view.innerHTML = `
      <h1 class="page-title">Ad in Progress</h1>
      <p class="page-subtitle">Wait for the timer to finish</p>
      <div class="timer-container">
        <div class="timer-circle">${remaining}s</div>
        <div class="timer-label">Please wait for reward...</div>
      </div>
    `;

    const timerEl = view.querySelector('.timer-circle');
    const timer = setInterval(async () => {
      remaining--;
      if (timerEl) timerEl.textContent = `${Math.max(0, remaining)}s`;

      if (remaining <= 0) {
        clearInterval(timer);
        try {
          const done = await api('/api/ads/complete', {
            method: 'POST',
            body: JSON.stringify({ sessionId: s.sessionId })
          });
          toast(`Reward added: ${usdWhole(done.reward / 110)} USDT`, 'success');
          await refreshMe();
          await adsPage();
        } catch (e) {
          toast(e.message, 'error');
          await adsPage();
        }
      }
    }, 1000);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ============================================================
// WALLET PAGE
// ============================================================
async function walletPage() {
  await refreshMe();
  const referrals = await api('/api/referrals').catch(() => ({ successfulCount: 0, requiredSuccessfulReferrals: 10 }));
  const successful = Number(referrals.successfulCount || 0);
  const required = Number(referrals.requiredSuccessfulReferrals || 10);
  const locked = successful < required;
  const progress = Math.min(100, (successful / required) * 100);

  view.innerHTML = `
    <h1 class="page-title">Wallet</h1>
    <p class="page-subtitle">Manage your balance and payments</p>

    <div class="wallet-balance-card">
      <div class="balance-label">Total Balance</div>
      <div class="balance-amount">${usdWhole(me.balance / 110)}</div>
      <div class="balance-currency">USDT</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:10px;">Min Withdraw: ${usdWhole((appConfig?.minWithdraw || 100) / 110)} USDT</div>
    </div>

    <div class="wallet-actions">
      <button class="btn btn-white" onclick="toast('Deposit coming soon!')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        Deposit
      </button>
      <button class="btn btn-accent" onclick="showWithdrawForm()" ${locked ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 18 10.5 8.5 15.5 13.5 23 6"/><polyline points="17 18 23 18 23 12"/></svg>
        Withdraw
      </button>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:14px;font-weight:600;">Referral Progress</span>
        <span style="font-size:13px;color:var(--accent);font-weight:700;">${successful}/${required}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${successful >= required ? 'success' : ''}" style="width:${progress}%"></div>
      </div>
      <p style="font-size:12px;color:var(--text-secondary);margin-top:10px;margin-bottom:0;">
        ${locked ? `Need ${required - successful} more successful referrals` : 'Withdrawal unlocked!'}
      </p>
    </div>

    <div class="section-header">
      <svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
      <h3>Payment Methods</h3>
    </div>
    <div class="payment-method">
      <div class="payment-icon">₿</div>
      <div class="payment-name">Binance USDT (TRC20)</div>
      <div class="payment-status ${appConfig?.payments?.USDT?.enabled ? 'active' : ''}"></div>
    </div>
    <div class="payment-method">
      <div class="payment-icon">Ł</div>
      <div class="payment-name">Litecoin</div>
      <div class="payment-status"></div>
    </div>
    <div class="payment-method">
      <div class="payment-icon">Ξ</div>
      <div class="payment-name">Ethereum</div>
      <div class="payment-status"></div>
    </div>

    <div class="section-header">
      <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 3.88-9.36L1 10"/></svg>
      <h3>Recent Transactions</h3>
      <span class="section-action" onclick="loadPage('history')">View All →</span>
    </div>
  `;

  try {
    const history = await api('/api/history');
    const recent = (history || []).slice(0, 3);
    if (recent.length) {
      recent.forEach(h => {
        view.insertAdjacentHTML('beforeend', `
          <div class="tx-item">
            <div class="tx-left">
              <div class="tx-icon">${h.type === 'ad_reward' ? '▶' : h.type === 'task_reward' ? '☷' : '↗'}</div>
              <div>
                <div class="tx-title">${esc((h.type || '').replace(/_/g, ' '))}</div>
                <div class="tx-date">${esc(h.createdAt?.slice(0, 10) || '')}</div>
              </div>
            </div>
            <div class="tx-amount ${h.amount > 0 ? 'positive' : 'negative'}">${h.amount > 0 ? '+' : ''}${usdWhole(Math.abs(h.amount) / 110)}</div>
          </div>
        `);
      });
    } else {
      view.insertAdjacentHTML('beforeend', '<div class="empty-state" style="padding:20px;"><div class="empty-state-icon">📋</div>No transactions yet</div>');
    }
  } catch (e) {
    view.insertAdjacentHTML('beforeend', '<div class="empty-state" style="padding:20px;">Failed to load transactions</div>');
  }
}

window.showWithdrawForm = function() {
  view.innerHTML = `
    <h1 class="page-title">Withdrawal Request</h1>
    <p class="page-subtitle">Enter your payment details</p>

    <div class="card" style="margin-bottom:16px;">
      <div class="balance-label">Available Balance</div>
      <div class="balance-amount" style="font-size:28px;">${usdWhole(me.balance / 110)}</div>
      <div class="balance-currency">USDT</div>
    </div>

    <form id="withdrawForm">
      <div class="field">
        <label style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">Amount (USDT)</label>
        <input type="number" name="amount" class="input-field" min="0.001" step="0.001" required placeholder="Enter withdrawal amount" style="margin-bottom:0;">
      </div>
      <div class="field">
        <label style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">Payment Method</label>
        <select name="method" class="input-field" required style="margin-bottom:0;">
          <option value="">Select payment method</option>
          ${appConfig?.payments?.USDT?.enabled ? '<option value="Binance USDT">USDT (TRC20)</option>' : ''}
        </select>
      </div>
      <div class="field">
        <label style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">Wallet Address</label>
        <input type="text" name="account" class="input-field" required minlength="5" placeholder="Enter wallet address" style="margin-bottom:0;">
      </div>
      <button type="submit" class="btn btn-accent" style="margin-top:4px;">Submit Request</button>
    </form>
  `;

  document.getElementById('withdrawForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const d = await api('/api/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(f.get('amount')) * 110,
          method: f.get('method'),
          account: f.get('account')
        })
      });
      toast(d.message || 'Request submitted', 'success');
      await walletPage();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
};

// ============================================================
// PROFILE PAGE
// ============================================================
async function profilePage() {
  await refreshMe();
  const joined = me.createdAt
    ? new Date(me.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  view.innerHTML = `
    <h1 class="page-title">Profile</h1>
    <p class="page-subtitle">Your account information</p>

    <div class="profile-header">
      <div class="profile-avatar">${esc((me.firstName || 'U').slice(0, 1).toUpperCase())}
        <div class="level-badge">Lv.1</div>
      </div>
      <div class="profile-info">
        <div class="profile-name">${esc([me.firstName, me.lastName].filter(Boolean).join(' ') || 'Telegram User')}</div>
        <div class="profile-username">@${esc(me.username || 'no_username')}</div>
        <div class="profile-uid">UID: ${esc(me.telegramId)}</div>
        <div class="trust-score">
          <span>Trust</span>
          <span>${Math.min(1000, Math.floor((me.totalEarnings || 0) / 10))}</span>
        </div>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden;">
      <div class="list-item" style="padding:16px;" onclick="loadPage('wallet')">
        <div class="icon-box"><svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg></div>
        <div class="list-content">
          <div class="list-title">My Wallet</div>
          <div class="list-desc">${usdWhole(me.balance / 110)} USDT available</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>

    <div class="section-header">
      <svg viewBox="0 0 24 24"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>
      <h3>Account Overview</h3>
    </div>
    <div class="stats-grid" style="grid-template-columns:repeat(2,1fr);">
      <div class="stat-box">
        <div class="stat-value" style="color:var(--success);">${usdWhole((me.totalEarnings || 0) / 110)}</div>
        <div class="stat-label">Total Earnings</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--accent);">${Number(me.completedTasks || 0)}</div>
        <div class="stat-label">Total Tasks</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--gold);">${Number(me.referralsCount || 0)}</div>
        <div class="stat-label">Total Referrals</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--text-primary);">${usdWhole((me.withdrawnAmount || 0) / 110)}</div>
        <div class="stat-label">Total Withdrawn</div>
      </div>
    </div>

    <div class="section-header">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      <h3>Settings</h3>
    </div>
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:80px;">
      <div class="list-item" style="padding:14px 16px;" onclick="loadPage('history')">
        <div class="icon-box"><svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 3.88-9.36L1 10"/></svg></div>
        <div class="list-content">
          <div class="list-title">Transaction History</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="list-item" style="padding:14px 16px;" onclick="loadPage('support')">
        <div class="icon-box"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></div>
        <div class="list-content">
          <div class="list-title">Help & Support</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="list-item" style="padding:14px 16px;" onclick="toast('Coming soon!')">
        <div class="icon-box" style="background:var(--error-soft);border-color:rgba(239,68,68,0.25);"><svg viewBox="0 0 24 24" style="stroke:var(--error);"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></div>
        <div class="list-content">
          <div class="list-title" style="color:var(--error);">Logout</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// REFERRAL PAGE
// ============================================================
async function referralPage() {
  const d = await api('/api/referrals');
  const link = d.link || `https://t.me/${'EarnWalletBot'}?start=ref_${me?.telegramId || ''}`;
  const successful = Number(d.successfulCount || 0);
  const total = Number(d.totalCount || 0);
  const inProgress = Number(d.inProgressCount || 0);
  const required = Number(d.requiredSuccessfulReferrals || 10);
  const progress = Math.min(100, (successful / required) * 100);

  view.innerHTML = `
    <h1 class="page-title">Referral</h1>
    <p class="page-subtitle">Invite friends and earn USDT rewards</p>

    <div class="referral-card">
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;">Per successful referral</div>
        <div style="font-size:28px;font-weight:800;color:var(--accent);">${usdWhole((d.bonus || 10) / 110)}</div>
        <div style="font-size:12px;color:var(--text-muted);">USDT</div>
      </div>

      <div class="referral-stats">
        <div class="referral-stat">
          <div class="referral-stat-value" style="color:var(--success);">${successful}</div>
          <div class="referral-stat-label">Successful</div>
        </div>
        <div class="referral-stat">
          <div class="referral-stat-value" style="color:var(--gold);">${inProgress}</div>
          <div class="referral-stat-label">In Progress</div>
        </div>
        <div class="referral-stat">
          <div class="referral-stat-value">${total}</div>
          <div class="referral-stat-label">Total</div>
        </div>
      </div>

      <div style="margin:16px 0;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:12px;color:var(--text-secondary);">Withdrawal Unlock Progress</span>
          <span style="font-size:12px;color:var(--accent);font-weight:700;">${successful}/${required}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${successful >= required ? 'success' : ''}" style="width:${progress}%"></div>
        </div>
      </div>

      <div class="referral-link-box">
        <div class="referral-link-text">${esc(link)}</div>
        <button class="btn btn-accent btn-sm" onclick="copyReferral('${esc(link)}')">Copy</button>
      </div>

      <button class="btn btn-white" onclick="shareReferral('${esc(link)}')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.02" x2="15.42" y2="17.97"/><line x1="15.41" y1="6.02" x2="8.59" y2="10.98"/></svg>
        Share on Telegram
      </button>
    </div>

    <div class="section-header">
      <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <h3>Invited Users</h3>
    </div>
    ${(d.referrals || []).length ? d.referrals.map(r => {
      const done = Math.min(Number(r.completedAds || 0), Number(r.requiredAds || 20));
      const need = Number(r.requiredAds || 20);
      const pct = Math.max(0, Math.min(100, done / need * 100));
      const isSuccess = r.status === 'successful';
      const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ') || 'Telegram User';
      return `
        <div class="referral-user">
          <div class="referral-user-avatar">👤</div>
          <div class="referral-user-info">
            <div class="referral-user-name">${esc(fullName)}</div>
            <div class="referral-user-status">${r.username ? '@' + esc(r.username) : ''} · ${isSuccess ? '✓ Successful' : `In Progress ${done}/${need}`}</div>
            <div class="progress-bar" style="margin-top:6px;height:4px;">
              <div class="progress-fill ${isSuccess ? 'success' : ''}" style="width:${pct}%"></div>
            </div>
          </div>
        </div>
      `;
    }).join('') : '<div class="empty-state"><div class="empty-state-icon">♧</div>No invited users yet</div>'}
  `;
}

window.copyReferral = async function(link) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
    else { const el = document.createElement('textarea'); el.value = link; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove(); }
    toast('Referral link copied!', 'success');
  } catch (e) { toast('Failed to copy link', 'error'); }
};

window.shareReferral = function(link) {
  const text = `Join EarnWallet and earn USDT by completing tasks and watching ads!\n\n${link}`;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join EarnWallet and earn USDT!')}`);
  } else {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join EarnWallet and earn USDT!')}`, '_blank');
  }
};

// ============================================================
// HISTORY PAGE
// ============================================================
async function historyPage() {
  const items = await api('/api/history');
  view.innerHTML = `
    <h1 class="page-title">History</h1>
    <p class="page-subtitle">All your transaction records</p>
    ${items.length ? items.map(x => `
      <div class="tx-item">
        <div class="tx-left">
          <div class="tx-icon">${x.type === 'ad_reward' ? '▶' : x.type === 'task_reward' ? '☷' : '↗'}</div>
          <div>
            <div class="tx-title">${esc((x.type || '').replace(/_/g, ' '))}</div>
            <div class="tx-date">${esc(x.note || '')} · ${esc(x.createdAt?.slice(0, 10) || '')}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div class="tx-amount ${x.amount > 0 ? 'positive' : 'negative'}">${x.amount > 0 ? '+' : ''}${usdWhole(Math.abs(x.amount) / 110)}</div>
          <span class="badge ${x.status === 'completed' || x.status === 'approved' ? 'badge-approved' : x.status === 'pending' ? 'badge-pending' : 'badge-rejected'}">${esc(x.status || '')}</span>
        </div>
      </div>
    `).join('') : '<div class="empty-state"><div class="empty-state-icon">📋</div>No transactions yet</div>'}
  `;
}

// ============================================================
// LEADERBOARD PAGE
// ============================================================
async function leaderboardPage() {
  view.innerHTML = `
    <h1 class="page-title">Leaderboard</h1>
    <p class="page-subtitle">Top earners this week</p>

    <div class="podium">
      <div class="podium-item second">
        <div class="podium-avatar">🥈</div>
        <div class="podium-name">Rahul</div>
        <div class="podium-score">12,450</div>
        <div class="podium-rank">2nd</div>
      </div>
      <div class="podium-item first">
        <div class="podium-avatar">🥇</div>
        <div class="podium-name">Aminul</div>
        <div class="podium-score">18,920</div>
        <div class="podium-rank">1st</div>
      </div>
      <div class="podium-item third">
        <div class="podium-avatar">🥉</div>
        <div class="podium-name">Sajal</div>
        <div class="podium-score">9,870</div>
        <div class="podium-rank">3rd</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active">Today</button>
      <button class="tab">Weekly</button>
      <button class="tab">All Time</button>
    </div>

    <div class="rank-row">
      <div class="rank-number">4</div>
      <div class="rank-avatar">👤</div>
      <div class="rank-info">
        <div class="rank-name">Karim</div>
      </div>
      <div class="rank-score">8,540</div>
    </div>
    <div class="rank-row">
      <div class="rank-number">5</div>
      <div class="rank-avatar">👤</div>
      <div class="rank-info">
        <div class="rank-name">Sohan</div>
      </div>
      <div class="rank-score">7,230</div>
    </div>

    <div class="card my-rank" style="margin-top:20px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="rank-avatar" style="border-color:var(--accent);">👤</div>
        <div class="rank-info">
          <div class="rank-name">Your Rank</div>
          <div style="font-size:12px;color:var(--text-muted);">No rank yet</div>
        </div>
        <div class="rank-score">0</div>
      </div>
    </div>

    <div class="empty-state" style="margin-top:20px;">
      <div class="empty-state-icon">🏆</div>
      <p>Leaderboard API is not available yet. Will work automatically once backend is added.</p>
    </div>
  `;
}

// ============================================================
// SUPPORT PAGE
// ============================================================
async function supportPage() {
  let supportUrl = '';
  try {
    const cfg = await api('/api/app-config');
    supportUrl = cfg.supportUrl || '';
  } catch (_) {}
  view.innerHTML = `
    <h1 class="page-title">Support</h1>
    <p class="page-subtitle">Need help? We are here for you!</p>

    <div class="card" style="text-align:center;padding:32px 20px;">
      <div style="font-size:48px;margin-bottom:16px;">💬</div>
      <h3 style="margin-bottom:8px;">EarnWallet Support</h3>
      <p style="color:var(--text-secondary);font-size:13px;line-height:1.7;margin-bottom:20px;">For any questions about your account, tasks, or withdrawals, contact our support team.</p>
      ${supportUrl ? `<button class="btn btn-accent" onclick="openSupport('${esc(supportUrl)}')">Go to Support Channel</button>` : '<div class="empty-state" style="padding:0;">Support link not configured</div>'}
    </div>

    <div class="card" style="margin-top:16px;">
      <h3 style="margin-bottom:12px;font-size:14px;">Quick Links</h3>
      <div class="list-item" style="padding:12px 0;" onclick="loadPage('faq')">
        <div class="list-content">
          <div class="list-title">FAQ & Rules</div>
          <div class="list-desc">Most common questions answered</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="list-item" style="padding:12px 0;" onclick="loadPage('how')">
        <div class="list-content">
          <div class="list-title">How It Works</div>
          <div class="list-desc">Platform usage guide</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>
  `;
}

window.openSupport = function(url) {
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
};

// ============================================================
// INFO / EMPTY PAGES
// ============================================================
async function infoPage(title, subtitle, items) {
  view.innerHTML = `
    <h1 class="page-title">${esc(title)}</h1>
    <p class="page-subtitle">${esc(subtitle)}</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${items.map(([heading, body], i) => `
        <div class="card" style="padding:16px;">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-size:12px;font-weight:700;flex-shrink:0;">${i + 1}</div>
            <div>
              <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${esc(heading)}</div>
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">${esc(body)}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function emptyFeaturePage(title, message) {
  view.innerHTML = `
    <h1 class="page-title">${esc(title)}</h1>
    <div class="empty-state" style="margin-top:40px;">
      <div class="empty-state-icon">✦</div>
      <p>${esc(message)}</p>
      <button class="btn btn-outline" style="width:auto;margin-top:16px;padding:10px 24px;" onclick="loadPage('home')">Back to Home</button>
    </div>
  `;
}

// ============================================================
// UTILITIES
// ============================================================
async function refreshMe() {
  me = await api('/api/me');
  return me;
}

async function loadAppConfig() {
  try {
    appConfig = await api('/api/app-config');
  } catch (e) {
    appConfig = null;
  }
}

// ============================================================
// BOOT
// ============================================================
async function boot() {
  if (!initData) {
    view.innerHTML = `<div class="empty-state" style="margin-top:60px;"><div class="empty-state-icon">🔒</div>Please open EarnWalletBot from Telegram. Direct browser access is not supported.</div>`;
    return;
  }
  try {
    await loadAppConfig();
    const auth = await api('/api/auth', { method: 'POST', body: '{}' });
    me = auth;
    await loadPage('home');
  } catch (e) {
    view.innerHTML = `<div class="empty-state" style="margin-top:60px;"><div class="empty-state-icon">⚠️</div>${esc(e.message)}<br><br><button class="btn btn-outline" style="width:auto;padding:10px 24px;" onclick="location.reload()">Try Again</button></div>`;
  }
}

window.loadPage = loadPage;

boot();
})();
