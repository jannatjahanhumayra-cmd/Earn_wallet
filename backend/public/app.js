(() => {
'use strict';

// ============================================================
// TELEGRAM WEB APP INIT
// ============================================================
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

// ============================================================
// DOM REFERENCES
// ============================================================
const view = document.getElementById('view');
const toastEl = document.getElementById('toast');
const menuBackdrop = document.getElementById('menuBackdrop');
const moreMenu = document.getElementById('moreMenu');
const menuToggle = document.getElementById('menuToggle');

// ============================================================
// STATE
// ============================================================
let me = null;
let page = 'home';
let appConfig = null;

// ============================================================
// UTILITIES
// ============================================================
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => `৳ ${Number(n || 0).toFixed(2)}`;
const usd = n => `$ ${Number(n || 0).toFixed(3)}`;

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
    throw new Error(`সার্ভার ত্রুটি (HTTP ${r.status})${hint ? `: ${hint}` : ''}`);
  }
  if (!r.ok || j.success === false) {
    throw new Error(j.error || `অনুরোধ ব্যর্থ (HTTP ${r.status})`);
  }
  return j.data ?? j;
}

// ============================================================
// MENU
// ============================================================
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

// ============================================================
// NAVIGATION
// ============================================================
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
    else if (p === 'how') await infoPage('হাউ টু ওয়ার্ক', 'EarnWallet ব্যবহারের সহজ গইড', [
      ['১. টেলিগ্রাম থেকে শুরু করুন', 'EarnWallet বটটি খুলুন এবং Mini App ওপেন করুন। আপনার টেলিগ্রাম অ্যাকাউন্ট স্বয়ংক্রিয়ভাবে যাচাই হবে।'],
      ['২. উপলব্ধ কার্যক্রম সম্পন্ন করুন', 'বিজ্ঞাপন দেখুন বা টাস্ক সম্পন্ন করুন। নির্দেশনা অনুযায়ী কাজ করুন।'],
      ['৩. যাচাইয়ের জন্য অপেক্ষা করুন', 'বিজ্ঞাপন পুরস্কার স্বয়ংক্রিয়ভাবে যোগ হবে। টাস্ক পুরস্কার অ্যাডমিন অনুমোদনের পর দেওয়া হবে।'],
      ['৪. বন্ধুদের আমন্ত্রণ জানান', 'আপনার রেফারেল লিংক শেয়ার করুন। সফল রেফারেলের জন্য পুরস্কার পাবেন।'],
      ['৫. উত্তোলনের অনুরোধ করুন', 'ন্যূনতম ব্যালেন্স ও রেফারেল শর্ত পূরণ করলে উত্তোলন করতে পারবেন।']
    ]);
    else if (p === 'faq') await infoPage('FAQ ও নিয়ম', 'EarnWallet ব্যবহারের আগে প্ল্যাটফর্মের নিয়মগুলো দেখে নিন।', [
      ['রেফারেল কখন সফল হয়?', 'রেফারেল করা ইউজার যখন নির্ধারিত সংখ্যক বিজ্ঞাপন সফলভাবে সম্পন্ন করে।'],
      ['উত্তোলন কখন চালু হবে?', 'নির্ধারিত সংখ্যক সফল রেফারেল ও ন্যূনতম ব্যালেন্স পূরণ করতে হবে।'],
      ['আমি কি ব্যালেন্স পরিবর্তন করতে পারি?', 'না। ব্যালেন্ ও অ্যাকাউন্ট তথ্য সার্ভার দ্বারা নিয়ন্ত্রিত।'],
      ['বিজ্ঞাপন কেন দেখা যাচ্ছে না?', 'বিজ্ঞাপনের উপলব্ধতা অ্যাডমিন সেটিং, নেটওয়ার্ক ও ব্রাউজারের উপর নির্ভর করে।'],
      ['একই টাস্ক দুইবার জমা দেওয়া যাবে?', 'না। Backend ডুপ্লিকেট সাবমিশন প্রতিরোধ করে।']
    ]);
    else if (p === 'notifications') await emptyFeaturePage('নোটিফিকেশন', 'নোটিফিকেশন সিস্টেম শীঘ্রই যোগ করা হবে।');
    else if (p === 'support') await supportPage();
    else if (p === 'daily') await emptyFeaturePage('দৈনিক বোনাস', 'দৈনিক বোনাস সিস্টেম শীঘ্রই চাল হবে।');
  } catch (e) {
    view.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div>${esc(e.message)}<br><br><button class="btn btn-outline" style="width:auto;padding:10px 24px;" onclick="loadPage('${esc(page)}')">আবার চেষ্টা করুন</button></div>`;
    toast(e.message, 'error');
  }
}

// Nav item clicks
document.querySelectorAll('.nav-item, .menu-link').forEach(b => {
  b.addEventListener('click', () => {
    const target = b.dataset.page;
    closeMoreMenu();
    loadPage(target);
  });
});

// Refresh button
document.getElementById('refreshBtn').onclick = () => loadPage(page);

// ============================================================
// HOME PAGE
// ============================================================
async function homePage() {
  await refreshMe();
  const referrals = await api('/api/referrals').catch(() => ({ referrals: [], successfulCount: 0, requiredSuccessfulReferrals: 10 }));
  const history = await api('/api/history').catch(() => []);
  const tasks = await api('/api/tasks').catch(() => []);

  // Recent withdrawals from history (withdrawal type)
  const withdrawals = (history || []).filter(h => h.type === 'withdrawal' && h.status === 'completed').slice(0, 5);

  // Task counts
  const completedTasks = tasks.filter(t => t.submissionStatus === 'approved').length;
  const pendingTasks = tasks.filter(t => t.submissionStatus === 'pending').length;

  view.innerHTML = `
    <!-- Balance Hero -->
    <div class="balance-hero">
      <div class="balance-label">মোট ব্যালেন্স</div>
      <div class="balance-amount">${money(me.balance)}</div>
      <div class="balance-currency">≈ ${usd(me.balance / 110)} USDT</div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-value" style="color:var(--success);">${money(me.todayEarnings || 0)}</div>
        <div class="stat-label">আকের আয়</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--gold);">${Number(me.referralsCount || 0)}</div>
        <div class="stat-label">সফল রেফারেল</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--accent);">${completedTasks}</div>
        <div class="stat-label">সম্পন্ন টাস্ক</div>
      </div>
    </div>

    <!-- Live Withdrawals -->
    ${withdrawals.length ? `
    <div class="section-header">
      <svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
      <h3>সাম্প্রতিক উত্তোলন</h3>
    </div>
    ${withdrawals.map(w => `
      <div class="live-ticker" style="margin-bottom:8px;">
        <div class="live-dot"></div>
        <div class="live-text">ইউজার ${esc(w.userId?.slice(-4) || '****')} ${money(Math.abs(w.amount))} উত্তোলন করেছেন</div>
      </div>
    `).join('')}
    ` : ''}

    <!-- Notice Banner -->
    <div class="notice-banner">
      <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div class="notice-text">${appConfig?.maintenanceMessage || 'স্বাগতম EarnWallet-এ! নিয়মিত টাস্ক ও বিজ্ঞাপন সম্পন্ন করে পুরস্কার অর্জন করুন।'}</div>
    </div>

    <!-- Daily Bonus -->
    <div class="daily-bonus" onclick="toast('দৈনিক বোনাস শীঘ্রই চালু হবে!')">
      <div class="daily-bonus-left">
        <div class="daily-bonus-icon">🎁</div>
        <div>
          <div class="daily-bonus-title">দৈনিক চেক-ইন</div>
          <div class="daily-bonus-subtitle">প্রতিদিন লগইন করে বোনাস পান</div>
        </div>
      </div>
      <button class="daily-bonus-btn">✓</button>
    </div>

    <!-- How to Work -->
    <div class="section-header">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <h3>হাউ টু ওয়ার্ক</h3>
    </div>
    <div class="card" style="padding:0;">
      <div class="list-item" style="padding:14px 16px;">
        <div class="icon-box icon-box-accent"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div>
        <div class="list-content">
          <div class="list-title">টাস্ক সম্পন্ন করুন</div>
          <div class="list-desc">নির্দেশনা অনুযয়ী টাস্ক করুন</div>
        </div>
      </div>
      <div class="list-item" style="padding:14px 16px;">
        <div class="icon-box icon-box-success"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="list-content">
          <div class="list-title">পুরস্কার অর্জন করুন</div>
          <div class="list-desc">সফলভাবে সম্পন্ন করলে পুরস্কার পাবেন</div>
        </div>
      </div>
      <div class="list-item" style="padding:14px 16px;">
        <div class="icon-box" style="background:rgba(251,191,36,0.12);border-color:rgba(251,191,36,0.25);"><svg viewBox="0 0 24 24" style="stroke:var(--gold);"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
        <div class="list-content">
          <div class="list-title">বন্ধুদের আমন্ত্রণ জানান</div>
          <div class="list-desc">রেফারেল থেকে অতিরিক্ত আয়</div>
        </div>
      </div>
    </div>

    <!-- Feature Grid -->
    <div class="section-header">
      <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <h3>কার্যক্রম</h3>
    </div>
    <div class="feature-grid">
      ${featureCard('▶', 'বিজ্ঞপন দেখুন', 'পুরস্কার পেতে দেখুন', 'ads')}
      ${featureCard('☷', 'টাস্ক সম্পন্ন করুন', 'টাস্ক করে আয় করুন', 'tasks')}
      ${featureCard('♧', 'বন্ধুদের আমন্ত্রণ জানান', 'রেফারেল পুরস্কার', 'referral')}
      ${featureCard('▣', 'উত্তোলন করুন', 'পেমেন্ট নিন', 'wallet')}
      ${featureCard('◷', 'হিস্ট্রি দেখুন', 'লেনদেনের তথ্য', 'history')}
      ${featureCard('◉', 'প্রোফাইল', 'অ্যাকাউন্ট সেটিংস', 'profile')}
    </div>

    <!-- Recent Activity -->
    <div class="section-header">
      <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 3.88-9.36L1 10"/></svg>
      <h3>সাম্প্রতিক কার্যক্রম</h3>
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
        <div class="tx-amount ${h.amount > 0 ? 'positive' : 'negative'}">${h.amount > 0 ? '+' : ''}${money(Math.abs(h.amount))}</div>
      </div>
    `).join('') : '<div class="empty-state"><div class="empty-state-icon">📋</div>এখনো কোনো কার্যক্রম নেই</div>'}
  `;

  // Bind feature card clicks
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
    <h1 class="page-title">টাস্ক</h1>
    <p class="page-subtitle">উপলব্ধ টাস্ক সম্পন্ন করে পুরস্কার অর্জন করুন</p>

    <div class="tabs">
      <button class="tab active" onclick="switchTaskTab(this, 'available')">উপলব্ধ (${available.length})</button>
      <button class="tab" onclick="switchTaskTab(this, 'pending')">অপেক্ষমাণ (${pending.length})</button>
      <button class="tab" onclick="switchTaskTab(this, 'completed')">সম্পন্ন (${completed.length})</button>
    </div>

    <div id="task-available">
      ${available.length ? available.map(t => taskCard(t)).join('') : '<div class="empty-state"><div class="empty-state-icon">☷</div>কোনো উপলব্ধ টাস্ক নেই</div>'}
    </div>

    <div id="task-pending" class="hidden">
      ${pending.length ? pending.map(t => taskCard(t, 'pending')).join('') : '<div class="empty-state"><div class="empty-state-icon">⏳</div>অপেক্ষমাণ টাস্ নেই</div>'}
    </div>

    <div id="task-completed" class="hidden">
      ${completed.length ? completed.map(t => taskCard(t, 'completed')).join('') : '<div class="empty-state"><div class="empty-state-icon">✓</div>সম্পন্ন টাস্ক নেই</div>'}
    </div>
  `;

  // Bind task buttons
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
  const btnText = status === 'pending' ? 'অপেক্মাণ' : status === 'completed' ? 'সম্পন্ন' : 'শুরু করুন';
  return `
    <div class="task-card">
      <div class="task-logo">${t.logo || '☷'}</div>
      <div class="task-info">
        <div class="task-name">${esc(t.title)}</div>
        <div class="task-meta">
          <span class="task-reward">${money(t.reward)}</span>
          ${t.category ? `<span class="badge badge-info">${esc(t.category)}</span>` : ''}
        </div>
      </div>
      ${!status ? `<button class="task-btn" data-task="${esc(t.id)}">${btnText}</button>` : `<span class="task-btn ${btnClass}">${btnText}</span>`}
    </div>
  `;
}

function taskDetails(task) {
  view.innerHTML = `
    <h1 class="page-title">টাস্ক বিবরণ</h1>
    <p class="page-subtitle">${esc(task.title)}</p>

    <div class="card card-accent">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span class="badge badge-info">${esc(task.category || 'টাস্ক')}</span>
        <span class="task-reward" style="font-size:18px;">${money(task.reward)}</span>
      </div>
      <div class="task-name" style="font-size:16px;margin-bottom:8px;">${esc(task.title)}</div>
      <p style="color:var(--text-secondary);font-size:13px;line-height:1.7;margin-bottom:16px;">${esc(task.description || 'টাস্কের নির্দেশনা অনুসরণ করুন এবং প্রমাণ আপলোড করুন।')}</p>
      ${task.url ? `<a href="${esc(task.url)}" target="_blank" class="btn btn-outline" style="margin-bottom:12px;text-decoration:none;" onclick="if(tg?.openLink){tg.openLink('${esc(task.url)}');return false;}">টাস্ক লিংক ওপেন করুন ↗</a>` : ''}
    </div>

    <div class="section-header">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <h3>প্রমাণ আপলোড করুন</h3>
    </div>

    <label class="upload-zone" id="uploadZone">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <strong>স্ক্রিনশট নির্বাচন করুন</strong>
      <span>JPG বা PNG · সর্বোচ্চ ৬৫০ KB</span>
      <input type="file" id="taskProofImage" accept="image/png,image/jpeg" style="display:none;">
    </label>

    <img id="taskImagePreview" class="preview-img hidden" alt="স্ক্রিনশট প্রিভিউ">

    ${task.requiresProof !== false ? `
    <div class="field" style="margin-top:8px;">
      <label style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">অতিরিক্ত তথ্য (ঐচ্ছিক)</label>
      <textarea id="taskProofText" class="input-field" rows="3" placeholder="টাস্ক সম্পন্ন করার বিবরণ লিখুন..." style="margin-bottom:0;"></textarea>
    </div>
    ` : ''}

    <button class="btn btn-accent" id="submitTaskProof">সাবমিট করুন</button>
    <p style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:12px;">অ্যাডমিন অনুমোদনের পর পুরস্কার যোগ হবে</p>
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
      toast('JPG বা PNG ছবি নির্বাচন করুন', 'error'); return;
    }
    try {
      proofImage = await compressProofImage(file);
      preview.src = proofImage;
      preview.classList.remove('hidden');
      uploadZone.classList.add('hidden');
    } catch (e) { toast(e.message, 'error'); }
  };

  document.getElementById('submitTaskProof').onclick = async () => {
    if (!proofImage) { toast('অনুগ্রহ করে স্ক্রিনশট আপলোড করুন', 'error'); return; }
    const btn = document.getElementById('submitTaskProof');
    btn.disabled = true; btn.textContent = 'জমা হচ্ছে...';
    try {
      const proofText = document.getElementById('taskProofText')?.value?.trim() || '';
      await api(`/api/tasks/${encodeURIComponent(task.id)}/submit`, {
        method: 'POST',
        body: JSON.stringify({ proofImageDataUrl: proofImage, proof: proofText })
      });
      toast('টাস্ক সফলভাবে জমা হয়েছে!', 'success');
      await tasksPage();
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'সাবমিট করুন'; }
  };
}

function compressProofImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ছবি পড়তে ব্যর্থ'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('অবৈধ ছবি'));
      img.onload = () => {
        const maxSide = 1280, scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.78, data = canvas.toDataURL('image/jpeg', quality);
        while (data.length > 850000 && quality > 0.42) { quality -= 0.08; data = canvas.toDataURL('image/jpeg', quality); }
        if (data.length > 850000) return reject(new Error('ছবিটি খুব বড়। দয়া করে ছোট ছবি নির্বাচন করুন।'));
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
    <h1 class="page-title">বিজ্ঞাপন</h1>
    <p class="page-subtitle">বিজ্ঞাপন দেখে পুরস্কার অর্জন করুন</p>

    ${ads.length ? ads.map(a => `
      <div class="ad-card">
        <div class="ad-header">
          <span class="ad-badge ad-badge-sponsored">SPONSORED</span>
          <span class="ad-timer">⏱ ${a.duration} সেকেন্ড</span>
        </div>
        <div class="ad-title">${esc(a.title)}</div>
        <div class="ad-reward">${money(a.reward)}</div>
        <div class="ad-reward-label">পুরস্কার</div>
        <div class="ad-footer">
          <span class="ad-meta">দেখুন এবং পুরস্কার পান</span>
          <button class="task-btn" data-ad="${esc(a.id)}">শুরু করুন</button>
        </div>
      </div>
    `).join('') : '<div class="empty-state"><div class="empty-state-icon">▶</div>এখন কোনো বিজ্ঞাপন উপলব্ধ নেই</div>'}
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
      <h1 class="page-title">বিজ্ঞাপন চলছে</h1>
      <p class="page-subtitle">টাইমার শেষ হওয়া পর্যন্ত অপেক্ষা করুন</p>
      <div class="timer-container">
        <div class="timer-circle">${remaining}s</div>
        <div class="timer-label">পুরস্কার যোগ হওয়ার জন্য অপেক্ষা করুন...</div>
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
          toast(`পুরস্কার যোগ হয়েছে: ${money(done.reward)}`, 'success');
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
    <h1 class="page-title">ওয়ালেট</h1>
    <p class="page-subtitle">ব্যালেন্স ও পেমেন্ট পরিচালনা করুন</p>

    <div class="wallet-balance-card">
      <div class="balance-label">মোট ব্যালেন্স</div>
      <div class="balance-amount">${money(me.balance)}</div>
      <div class="balance-currency">≈ ${usd(me.balance / 110)} USDT</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:10px;">ন্যূনতম উত্তোলন: ${money(appConfig?.minWithdraw || 100)}</div>
    </div>

    <div class="wallet-actions">
      <button class="btn btn-white" onclick="toast('ডিপোজিট শীঘ্রই চালু হবে!')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        ডিপোজিট
      </button>
      <button class="btn btn-accent" onclick="showWithdrawForm()" ${locked ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 18 10.5 8.5 15.5 13.5 23 6"/><polyline points="17 18 23 18 23 12"/></svg>
        উত্তোলন
      </button>
    </div>

    <!-- Referral Progress -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:14px;font-weight:600;">রেফারেল প্রগ্রেস</span>
        <span style="font-size:13px;color:var(--accent);font-weight:700;">${successful}/${required}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${progress}%"></div>
      </div>
      <p style="font-size:12px;color:var(--text-secondary);margin-top:10px;margin-bottom:0;">
        ${locked ? `আরো ${required - successful}টি সফল রেফারেল করতে হবে` : 'উত্তোলন চালু আছে!'}
      </p>
    </div>

    <!-- Payment Methods -->
    <div class="section-header">
      <svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
      <h3>পেমেন্ট মেথড</h3>
    </div>
    <div class="payment-method">
      <div class="payment-icon">📱</div>
      <div class="payment-name">বিকাশ</div>
      <div class="payment-status ${appConfig?.payments?.bKash?.enabled ? 'active' : ''}"></div>
    </div>
    <div class="payment-method">
      <div class="payment-icon">💰</div>
      <div class="payment-name">নগদ</div>
      <div class="payment-status ${appConfig?.payments?.Nagad?.enabled ? 'active' : ''}"></div>
    </div>
    <div class="payment-method">
      <div class="payment-icon">₮</div>
      <div class="payment-name">USDT (TRC20)</div>
      <div class="payment-status ${appConfig?.payments?.USDT?.enabled ? 'active' : ''}"></div>
    </div>
    <div class="payment-method">
      <div class="payment-icon">Ł</div>
      <div class="payment-name">লাইটকয়েন</div>
      <div class="payment-status"></div>
    </div>
    <div class="payment-method">
      <div class="payment-icon">Ξ</div>
      <div class="payment-name">ইথেরিয়াম</div>
      <div class="payment-status"></div>
    </div>

    <!-- Transaction History Preview -->
    <div class="section-header">
      <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 3.88-9.36L1 10"/></svg>
      <h3>সাম্প্রতিক লেনদেন</h3>
      <span class="section-action" onclick="loadPage('history')">সব দেখুন →</span>
    </div>
  `;

  // Load recent transactions
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
            <div class="tx-amount ${h.amount > 0 ? 'positive' : 'negative'}">${h.amount > 0 ? '+' : ''}${money(Math.abs(h.amount))}</div>
          </div>
        `);
      });
    } else {
      view.insertAdjacentHTML('beforeend', '<div class="empty-state" style="padding:20px;"><div class="empty-state-icon">📋</div>কোনো লেনদেন নেই</div>');
    }
  } catch (e) {
    view.insertAdjacentHTML('beforeend', '<div class="empty-state" style="padding:20px;">লেনদেন লোড করতে ব্যর্থ</div>');
  }
}

window.showWithdrawForm = function() {
  view.innerHTML = `
    <h1 class="page-title">উত্তোলনের অনুরোধ</h1>
    <p class="page-subtitle">আপনার পেমেন্ট তথ্য দিন</p>

    <div class="card" style="margin-bottom:16px;">
      <div class="balance-label">উপলব্ধ ব্যালেন্স</div>
      <div class="balance-amount" style="font-size:28px;">${money(me.balance)}</div>
    </div>

    <form id="withdrawForm">
      <div class="field">
        <label style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">পরিমাণ (BDT)</label>
        <input type="number" name="amount" class="input-field" min="1" step="0.01" required placeholder="উত্তোলনের পরিমাণ লিখুন" style="margin-bottom:0;">
      </div>
      <div class="field">
        <label style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">পেমেন্ট মেথড</label>
        <select name="method" class="input-field" required style="margin-bottom:0;">
          <option value="">পেমেন্ট মেথড নির্বাচন করুন</option>
          ${appConfig?.payments?.bKash?.enabled ? '<option value="bKash">বিকাশ</option>' : ''}
          ${appConfig?.payments?.Nagad?.enabled ? '<option value="Nagad">নগদ</option>' : ''}
          ${appConfig?.payments?.USDT?.enabled ? '<option value="Binance USDT">USDT (TRC20)</option>' : ''}
        </select>
      </div>
      <div class="field">
        <label style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:block;">পেমেন্ট অ্যাকাউন্ট / ওয়ালেট</label>
        <input type="text" name="account" class="input-field" required minlength="5" placeholder="ফোন নম্বর বা ওয়ালেট ঠিকানা" style="margin-bottom:0;">
      </div>
      <button type="submit" class="btn btn-accent" style="margin-top:4px;">অনুরোধ জমা দিন</button>
    </form>
  `;

  document.getElementById('withdrawForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const d = await api('/api/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(f.get('amount')),
          method: f.get('method'),
          account: f.get('account')
        })
      });
      toast(d.message || 'অনুরোধ জমা হয়েছে', 'success');
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
    ? new Date(me.createdAt).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  view.innerHTML = `
    <h1 class="page-title">প্রোফাইল</h1>
    <p class="page-subtitle">আপনার অ্যাকাউন্ট তথ্য</p>

    <div class="profile-header">
      <div class="profile-avatar">${esc((me.firstName || 'U').slice(0, 1).toUpperCase())}
        <div class="level-badge">Lv.1</div>
      </div>
      <div class="profile-info">
        <div class="profile-name">${esc([me.firstName, me.lastName].filter(Boolean).join(' ') || 'টেলিগ্রাম ইউজার')}</div>
        <div class="profile-username">@${esc(me.username || 'no_username')}</div>
        <div class="profile-uid">UID: ${esc(me.telegramId)}</div>
        <div class="trust-score">
          <span>বিশ্বাস</span>
          <span>${Math.min(1000, Math.floor((me.totalEarnings || 0) / 10))}</span>
        </div>
      </div>
    </div>

    <!-- Wallet Summary -->
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="list-item" style="padding:16px;" onclick="loadPage('wallet')">
        <div class="icon-box"><svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg></div>
        <div class="list-content">
          <div class="list-title">আমা ওয়ালেট</div>
          <div class="list-desc">${money(me.balance)} উপলব্ধ</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>

    <!-- Stats -->
    <div class="section-header">
      <svg viewBox="0 0 24 24"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>
      <h3>অ্যাকাউন্ট ওভারভিউ</h3>
    </div>
    <div class="stats-grid" style="grid-template-columns:repeat(2,1fr);">
      <div class="stat-box">
        <div class="stat-value" style="color:var(--success);">${money(me.totalEarnings)}</div>
        <div class="stat-label">মোট আয়</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--accent);">${Number(me.completedTasks || 0)}</div>
        <div class="stat-label">মোট টাস্ক</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--gold);">${Number(me.referralsCount || 0)}</div>
        <div class="stat-label">মোট রেফারেল</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="color:var(--text-primary);">${money(me.withdrawnAmount)}</div>
        <div class="stat-label">মোট উত্তোলন</div>
      </div>
    </div>

    <!-- Settings -->
    <div class="section-header">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      <h3>সেটিংস</h3>
    </div>
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:80px;">
      <div class="list-item" style="padding:14px 16px;" onclick="loadPage('history')">
        <div class="icon-box"><svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 3.88-9.36L1 10"/></svg></div>
        <div class="list-content">
          <div class="list-title">লেনদেন হিস্ট্রি</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="list-item" style="padding:14px 16px;" onclick="loadPage('support')">
        <div class="icon-box"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></div>
        <div class="list-content">
          <div class="list-title">হেল্প ও সাপোর্ট</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="list-item" style="padding:14px 16px;" onclick="toast('শীঘ্রই আসছে!')">
        <div class="icon-box" style="background:var(--error-soft);border-color:rgba(239,68,68,0.25);"><svg viewBox="0 0 24 24" style="stroke:var(--error);"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></div>
        <div class="list-content">
          <div class="list-title" style="color:var(--error);">লগআউট</div>
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
    <h1 class="page-title">রেফারেল</h1>
    <p class="page-subtitle">বন্ধুদের আমন্ত্রণ জানান এবং পুরস্কার অর্জন করুন</p>

    <div class="referral-card">
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;">প্রতি সফল রেফারেলে</div>
        <div style="font-size:28px;font-weight:800;color:var(--accent);">${money(d.bonus || 10)}</div>
      </div>

      <div class="referral-stats">
        <div class="referral-stat">
          <div class="referral-stat-value" style="color:var(--success);">${successful}</div>
          <div class="referral-stat-label">সফল</div>
        </div>
        <div class="referral-stat">
          <div class="referral-stat-value" style="color:var(--gold);">${inProgress}</div>
          <div class="referral-stat-label">চলমান</div>
        </div>
        <div class="referral-stat">
          <div class="referral-stat-value">${total}</div>
          <div class="referral-stat-label">মোট</div>
        </div>
      </div>

      <div style="margin:16px 0;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:12px;color:var(--text-secondary);">উত্তোলন আনলক প্রগ্রেস</span>
          <span style="font-size:12px;color:var(--accent);font-weight:700;">${successful}/${required}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${successful >= required ? 'success' : ''}" style="width:${progress}%"></div>
        </div>
      </div>

      <div class="referral-link-box">
        <div class="referral-link-text">${esc(link)}</div>
        <button class="btn btn-accent btn-sm" onclick="copyReferral('${esc(link)}')">কপি</button>
      </div>

      <button class="btn btn-white" onclick="shareReferral('${esc(link)}')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.02" x2="15.42" y2="17.97"/><line x1="15.41" y1="6.02" x2="8.59" y2="10.98"/></svg>
        TELEGRAM-এ শেয়ার করুন
      </button>
    </div>

    <div class="section-header">
      <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <h3>আমন্ত্রিত ইউজার</h3>
    </div>
    ${(d.referrals || []).length ? d.referrals.map(r => {
      const done = Math.min(Number(r.completedAds || 0), Number(r.requiredAds || 20));
      const need = Number(r.requiredAds || 20);
      const pct = Math.max(0, Math.min(100, done / need * 100));
      const isSuccess = r.status === 'successful';
      const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ') || 'টেলিগ্রাম ইউজার';
      return `
        <div class="referral-user">
          <div class="referral-user-avatar">👤</div>
          <div class="referral-user-info">
            <div class="referral-user-name">${esc(fullName)}</div>
            <div class="referral-user-status">${r.username ? '@' + esc(r.username) : ''} · ${isSuccess ? '✓ সফল' : `চলমান ${done}/${need}`}</div>
            <div class="progress-bar" style="margin-top:6px;height:4px;">
              <div class="progress-fill ${isSuccess ? 'success' : ''}" style="width:${pct}%"></div>
            </div>
          </div>
        </div>
      `;
    }).join('') : '<div class="empty-state"><div class="empty-state-icon">♧</div>এখনো কাউকে আমন্ত্রণ জানাননি</div>'}
  `;
}

window.copyReferral = async function(link) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
    else { const el = document.createElement('textarea'); el.value = link; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove(); }
    toast('রেফারেল লিংক কপি হয়েছে!', 'success');
  } catch (e) { toast('লিংক কপি করতে ব্যর্থ', 'error'); }
};

window.shareReferral = function(link) {
  const text = `EarnWallet-এ যোগ দিন এবং টাস্ক ও বিজ্ঞাপন দেখে আয় করুন!\n\n${link}`;
  if (tg?.shareGameScore || tg?.openTelegramLink) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('EarnWallet-এ যোগ দিন!')}`);
  } else {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('EarnWallet-এ যোগ দিন!')}`, '_blank');
  }
};

// ============================================================
// HISTORY PAGE
// ============================================================
async function historyPage() {
  const items = await api('/api/history');
  view.innerHTML = `
    <h1 class="page-title">লেনদেন হিস্ট্রি</h1>
    <p class="page-subtitle">আপনার সমস্ত লেনদেনের তথ্য</p>
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
          <div class="tx-amount ${x.amount > 0 ? 'positive' : 'negative'}">${x.amount > 0 ? '+' : ''}${money(Math.abs(x.amount))}</div>
          <span class="badge ${x.status === 'completed' || x.status === 'approved' ? 'badge-approved' : x.status === 'pending' ? 'badge-pending' : 'badge-rejected'}">${esc(x.status || '')}</span>
        </div>
      </div>
    `).join('') : '<div class="empty-state"><div class="empty-state-icon">📋</div>কোনো লেনদেন নেই</div>'}
  `;
}

// ============================================================
// LEADERBOARD PAGE (placeholder - no API)
// ============================================================
async function leaderboardPage() {
  view.innerHTML = `
    <h1 class="page-title">লিডারবোর্ড</h1>
    <p class="page-subtitle">শীর্ষ অর্জনকারীদের তালিকা</p>

    <!-- Podium -->
    <div class="podium">
      <div class="podium-item second">
        <div class="podium-avatar">🥈</div>
        <div class="podium-name">রাহুল</div>
        <div class="podium-score">12,450</div>
        <div class="podium-rank">২য়</div>
      </div>
      <div class="podium-item first">
        <div class="podium-avatar">🥇</div>
        <div class="podium-name">আমিনুল</div>
        <div class="podium-score">18,920</div>
        <div class="podium-rank">১ম</div>
      </div>
      <div class="podium-item third">
        <div class="podium-avatar">🥉</div>
        <div class="podium-name">সজল</div>
        <div class="podium-score">9,870</div>
        <div class="podium-rank">৩য়</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active">আজ</button>
      <button class="tab">সাপ্তাহিক</button>
      <button class="tab">সর্বকাল</button>
    </div>

    <!-- Rank List -->
    <div class="rank-row">
      <div class="rank-number">4</div>
      <div class="rank-avatar">👤</div>
      <div class="rank-info">
        <div class="rank-name">করিম</div>
      </div>
      <div class="rank-score">8,540</div>
    </div>
    <div class="rank-row">
      <div class="rank-number">5</div>
      <div class="rank-avatar">👤</div>
      <div class="rank-info">
        <div class="rank-name">সোহান</div>
      </div>
      <div class="rank-score">7,230</div>
    </div>

    <!-- My Rank -->
    <div class="card my-rank" style="margin-top:20px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="rank-avatar" style="border-color:var(--accent);">👤</div>
        <div class="rank-info">
          <div class="rank-name">আপনার র‍্যাঙ্ক</div>
          <div style="font-size:12px;color:var(--text-muted);">এখনো তািকায নেই</div>
        </div>
        <div class="rank-score">0</div>
      </div>
    </div>

    <div class="empty-state" style="margin-top:20px;">
      <div class="empty-state-icon">🏆</div>
      <p>লিডারবোর্ড API বর্তমানে উপলব্ধ নেই। Backend যোগ করলে স্বয়ংক্রিয়ভাবে কাজ করবে।</p>
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
    <h1 class="page-title">সাপোর্ট</h1>
    <p class="page-subtitle">সাহায্য প্রয়োজন? আমরা আছি!</p>

    <div class="card" style="text-align:center;padding:32px 20px;">
      <div style="font-size:48px;margin-bottom:16px;">💬</div>
      <h3 style="margin-bottom:8px;">EarnWallet সাপোর্ট</h3>
      <p style="color:var(--text-secondary);font-size:13px;line-height:1.7;margin-bottom:20px;">অ্যাকাউন্ট, টাস্ক বা উত্তোলন সংক্রান্ত যেকোনো প্রশ্নের জন্য আমাদের সাপোর্ট টিমের সাথে যোগাযোগ করুন।</p>
      ${supportUrl ? `<button class="btn btn-accent" onclick="openSupport('${esc(supportUrl)}')">সাপোর্ট চ্যানেলে যান</button>` : '<div class="empty-state" style="padding:0;">সাপোর্ট লিংক কনফিগার করা হয়নি</div>'}
    </div>

    <div class="card" style="margin-top:16px;">
      <h3 style="margin-bottom:12px;font-size:14px;">সাধারণ প্রশ্ন</h3>
      <div class="list-item" style="padding:12px 0;" onclick="loadPage('faq')">
        <div class="list-content">
          <div class="list-title">FAQ ও নিয়ম দেখুন</div>
          <div class="list-desc">সবচেয়ে সাধারণ প্রশ্নের উত্তর</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="list-item" style="padding:12px 0;" onclick="loadPage('how')">
        <div class="list-content">
          <div class="list-title">হাউ টু ওয়ার্ক</div>
          <div class="list-desc">প্ল্যাটফর্ম ব্যবহারের গাই</div>
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
// INFO PAGE
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

// ============================================================
// EMPTY FEATURE PAGE
// ============================================================
async function emptyFeaturePage(title, message) {
  view.innerHTML = `
    <h1 class="page-title">${esc(title)}</h1>
    <div class="empty-state" style="margin-top:40px;">
      <div class="empty-state-icon">✦</div>
      <p>${esc(message)}</p>
      <button class="btn btn-outline" style="width:auto;margin-top:16px;padding:10px 24px;" onclick="loadPage('home')">হোমে ফিরে যান</button>
    </div>
  `;
}

// ============================================================
// REFRESH USER DATA
// ============================================================
async function refreshMe() {
  me = await api('/api/me');
  return me;
}

// ============================================================
// LOAD APP CONFIG
// ============================================================
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
    view.innerHTML = `<div class="empty-state" style="margin-top:60px;"><div class="empty-state-icon">🔒</div>অনুগ্রহ করে EarnWalletBot থেকে এই অ্যাপটি ওপে করুন। সরাসরি ব্রাউজারে অ্যাক্সেস সমর্থিত নয়।</div>`;
    return;
  }
  try {
    await loadAppConfig();
    const auth = await api('/api/auth', { method: 'POST', body: '{}' });
    me = auth;
    await loadPage('home');
  } catch (e) {
    view.innerHTML = `<div class="empty-state" style="margin-top:60px;"><div class="empty-state-icon">⚠️</div>${esc(e.message)}<br><br><button class="btn btn-outline" style="width:auto;padding:10px 24px;" onclick="location.reload()">আবার চেষ্টা করুন</button></div>`;
  }
}

// Expose loadPage globally
window.loadPage = loadPage;

boot();
})();
