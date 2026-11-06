(() => {
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const initData = tg?.initData || '';
const headers = {
  'Content-Type': 'application/json',
  ...(initData ? { Authorization: `tma ${initData}` } : {})
};

const view = document.getElementById('view');
const gate = document.getElementById('gateModal');
const toastEl = document.getElementById('toast');

const BOTTOM_AD_URL = 'https://auctionr.org/4/dbdbab1f1b496a0618bffd138f62f643';
const CHANNEL_URL = 'https://t.me/EarnWallet_Official';
const REFERRAL_BONUS = 10;
const REQUIRED_REFERRALS = 10;

let me = null;
let page = 'home';
let pendingAction = null;
let adPlacements = {};
let adPlacementsLoaded = false;

/* =====================================================
   DIRECT BANNER ADS
   TOP, MIDDLE এবং BOTTOM Banner এখানে সেটআপ করা হয়েছে।
   Admin Panel থেকে এগুলো পরিবর্তন করতে হবে না।
   ===================================================== */

function bannerMarkup(position) {
  return `
    <div class="direct-ad-box" style="width:100%;overflow:hidden;text-align:center;margin:12px 0;padding:8px 0;">
      <small style="display:block;color:#9ba9c5;font-size:10px;margin-bottom:5px;">ADVERTISEMENT</small>
      <div class="direct-banner" data-direct-banner="${position}"></div>
    </div>
  `;
}

function mountBannerAds(scope = document) {
  scope.querySelectorAll('[data-direct-banner]').forEach(container => {
    if (container.dataset.loaded === 'yes') return;

    container.dataset.loaded = 'yes';

    const frame = document.createElement('iframe');
    frame.title = 'Sponsored Banner Advertisement';
    frame.width = '728';
    frame.height = '90';
    frame.loading = 'lazy';
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms');
    frame.style.cssText = 'width:728px;max-width:100%;height:90px;border:0;display:block;margin:auto;background:#fff;';

    /* Adsterra Banner Code: TOP / MIDDLE / BOTTOM */
    frame.srcdoc = `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:0;overflow:hidden;text-align:center}</style>
</head>
<body>
<script>
  atOptions = {
    'key' : '677193ecff90bdd9318829caf0f37774',
    'format' : 'iframe',
    'height' : 90,
    'width' : 728,
    'params' : {}
  };
<\/script>
<script src="https://bicea.org/22/677193ecff90bdd9318829caf0f37774"><\/script>
</body>
</html>`;

    container.appendChild(frame);
  });
}

/* Bottom Direct Link Advertisement */
document.getElementById('bottomAdLink').onclick = () => {
  if (tg?.openLink) {
    tg.openLink(BOTTOM_AD_URL);
  } else {
    window.open(BOTTOM_AD_URL, '_blank', 'noopener');
  }
};

/* Telegram Channel Button */
function channelButton() {
  return `
    <button type="button" id="channelBtn" class="secondary-btn full"
      style="margin-top:12px;">
      ✈ Join EarnWallet Official Channel
    </button>
  `;
}

function connectChannelButton() {
  const btn = document.getElementById('channelBtn');
  if (!btn) return;

  btn.onclick = () => {
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(CHANNEL_URL);
    } else {
      window.open(CHANNEL_URL, '_blank', 'noopener');
    }
  };
}

/* =====================================================
   ADMIN CONTROLLED GATE PLACEMENT
   শুধু Gate Advertisement আগের মতো Admin Panel থেকে আসবে।
   ===================================================== */

async function loadAdPlacements(force = false) {
  if (adPlacementsLoaded && !force) return adPlacements;

  try {
    adPlacements = await api('/api/ad-placements');
    adPlacementsLoaded = true;
  } catch (e) {
    console.warn('Ad placements unavailable:', e.message);
    adPlacements = {};
    adPlacementsLoaded = true;
  }

  return adPlacements;
}

function hydrateAdSlots(scope = document) {
  scope.querySelectorAll('[data-ad-slot]').forEach(node => {
    const config = adPlacements[node.dataset.adSlot];
    const old = node.querySelector('.ad-placeholder');

    if (!config || !config.html) {
      if (old) old.textContent = 'Advertisement';
      return;
    }

    const small = node.querySelector('small');
    if (small) small.textContent = config.label || 'Advertisement';

    const frame = document.createElement('iframe');
    frame.className = 'ad-frame';
    frame.title = config.label || 'Advertisement';
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms');
    frame.setAttribute('loading', 'lazy');
    frame.srcdoc = config.html;

    if (old) old.replaceWith(frame);
  });
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2600);
}

async function api(url, options = {}) {
  const r = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });

  const raw = await r.text();
  let j;

  try {
    j = JSON.parse(raw);
  } catch {
    const hint = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);
    throw new Error(
      `Server returned a non-JSON response (HTTP ${r.status})${hint ? `: ${hint}` : ''}. Check Render deployment and API route.`
    );
  }

  if (!r.ok || j.success === false) {
    throw new Error(j.error || `Request failed (HTTP ${r.status})`);
  }

  return j.data ?? j;
}

const money = n => `৳ ${Number(n || 0).toFixed(2)}`;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

async function gateThen(fn) {
  pendingAction = fn;
  await loadAdPlacements();
  hydrateAdSlots(gate);
  gate.classList.remove('hidden');
}

function closeGate() {
  gate.classList.add('hidden');
  const fn = pendingAction;
  pendingAction = null;
  if (fn) fn();
}

document.getElementById('gateClose').onclick = closeGate;
document.getElementById('continueGate').onclick = closeGate;

document.getElementById('refreshBtn').onclick = () => {
  gateThen(() => loadPage(page));
};

document.querySelectorAll('.nav-item').forEach(b => {
  b.addEventListener('click', () => {
    gateThen(() => loadPage(b.dataset.page));
  });
});

function setActive() {
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
}

function shell(title, sub, content) {
  return `${bannerMarkup('middle')}
    <h1 class="page-title">${title}</h1>
    <p class="page-sub">${sub || ''}</p>
    ${content}`;
}

async function loadPage(p) {
  page = p;
  setActive();
  view.innerHTML = '<div class="skeleton"></div>';

  try {
    if (p === 'home') await home();
    else if (p === 'ads') await adsPage();
    else if (p === 'tasks') await tasksPage();
    else if (p === 'referral') await referralPage();
    else if (p === 'wallet') await walletPage();
    else if (p === 'profile') await profilePage();
    else if (p === 'history') await historyPage();

    await loadAdPlacements();
    hydrateAdSlots(view);
    mountBannerAds(view);
    connectChannelButton();
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}<br><br><button class="secondary-btn" onclick="loadPage(page)">Try again</button></div>`;
  }
}

async function refreshMe() {
  me = await api('/api/me');
  return me;
}

/* HOME PAGE */
async function home() {
  await refreshMe();

  view.innerHTML = `
    ${bannerMarkup('top')}

    <div class="balance-card">
      <div class="eyebrow">TOTAL BALANCE</div>
      <div class="balance">${money(me.balance)}</div>
      <div class="balance-stats">
        <div><small>Today's Earning</small><b>${money(me.todayEarnings)}</b></div>
        <div><small>Total Earning</small><b>${money(me.totalEarnings)}</b></div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-icon">♧</div><b>${Number(me.referralsCount || 0)}</b><small>Successful Referrals</small></div>
      <div class="stat-card"><div class="stat-icon">✓</div><b>${Number(me.completedTasks || 0)}</b><small>Completed Tasks</small></div>
      <div class="stat-card"><div class="stat-icon">◷</div><b>${Number(me.pendingTasks || 0)}</b><small>Pending Tasks</small></div>
      <div class="stat-card"><div class="stat-icon">▣</div><b>${money(me.withdrawnAmount)}</b><small>Withdrawn</small></div>
    </div>

    ${bannerMarkup('middle')}

    <div class="panel" style="margin-top:12px">
      <h3 style="margin-top:0">Referral Rewards</h3>
      <p class="muted">প্রতি ১টি সফল Referral-এর জন্য ৳১০ বোনাস।</p>
      <p class="muted">১০টি সফল Referral সম্পন্ন হলে Withdrawal করার যোগ্যতা অর্জন করবে।</p>
      <button class="primary-btn full" id="homeReferralBtn">Invite Friends</button>
    </div>

    <div class="section-head"><h2>Earn Money</h2><small>Choose an activity</small></div>

    <div class="feature-grid">
      ${feature('▶', 'Watch Ads', 'Watch sponsored ads', 'ads')}
      ${feature('☷', 'Complete Tasks', 'Earn from tasks', 'tasks')}
      ${feature('♧', 'Invite Friends', 'Referral rewards', 'referral')}
      ${feature('▣', 'Withdraw', 'Request payout', 'wallet')}
      ${feature('◷', 'History', 'Your transactions', 'history')}
      ${feature('◉', 'My Profile', 'Account settings', 'profile')}
    </div>

    ${channelButton()}
  `;

  view.querySelectorAll('[data-go]').forEach(b => {
    b.onclick = () => gateThen(() => loadPage(b.dataset.go));
  });

  document.getElementById('homeReferralBtn').onclick = () => {
    gateThen(() => loadPage('referral'));
  };
}

function feature(icon, title, sub, to) {
  return `<button class="feature-card" data-go="${to}">
    <span class="ico">${icon}</span>
    <span><b>${title}</b><small>${sub}</small></span>
  </button>`;
}

/* WATCH ADS PAGE */
async function adsPage() {
  const ads = await api('/api/ads');

  view.innerHTML = shell(
    'Watch Ads',
    'Complete available sponsored activities to earn rewards.',
    `<div class="list">${
      ads.length
        ? ads.map(a => `
          <div class="list-card">
            <div>
              <h3>${esc(a.title)}</h3>
              <p>${Number(a.duration)} seconds • Reward ${money(a.reward)}</p>
            </div>
            <button class="primary-btn" data-ad="${esc(a.id)}">Start</button>
          </div>
        `).join('')
        : '<div class="empty">No reward ads are available right now.</div>'
    }</div>`
  );

  view.querySelectorAll('[data-ad]').forEach(b => {
    b.onclick = () => gateThen(() => startAd(b.dataset.ad));
  });
}

async function startAd(id) {
  try {
    const s = await api(`/api/ads/${encodeURIComponent(id)}/start`, {
      method: 'POST',
      body: '{}'
    });

    if (s.url) tg?.openLink(s.url);

    let remaining = Number(s.duration);

    view.innerHTML = shell(
      'Ad in progress',
      'Keep this page open until the timer finishes.',
      `<div class="panel">
        <div class="amount" id="timer">${remaining}s</div>
        <p class="muted">Reward is credited after the server validates the session.</p>
      </div>`
    );

    const timer = setInterval(async () => {
      remaining--;

      const el = document.getElementById('timer');
      if (el) el.textContent = `${Math.max(0, remaining)}s`;

      if (remaining <= 0) {
        clearInterval(timer);

        try {
          const done = await api('/api/ads/complete', {
            method: 'POST',
            body: JSON.stringify({ sessionId: s.sessionId })
          });

          toast(`Reward added: ${money(done.reward)}`);
          await refreshMe();
          await adsPage();
          mountBannerAds(view);
        } catch (e) {
          toast(e.message);
        }
      }
    }, 1000);
  } catch (e) {
    toast(e.message);
  }
}

/* TASKS PAGE */
async function tasksPage() {
  const tasks = await api('/api/tasks');

  view.innerHTML = shell(
    'Available Tasks',
    'Submit proof when required. Rewards need admin review.',
    `<div class="list">${
      tasks.length
        ? tasks.map(t => `
          <div class="list-card">
            <div>
              <h3>${esc(t.title)}</h3>
              <p>Reward ${money(t.reward)} • ${t.requiresProof ? 'Proof required' : 'Review required'}</p>
              <p>${t.submissionStatus ? `Status: ${esc(t.submissionStatus)}` : 'Not submitted'}</p>
            </div>
            ${
              t.submissionStatus
                ? '<span class="pill">Submitted</span>'
                : `<button class="primary-btn" data-task="${esc(t.id)}" data-url="${esc(t.url || '')}" data-proof="${t.requiresProof ? '1' : '0'}">Open</button>`
            }
          </div>
        `).join('')
        : '<div class="empty">No tasks available.</div>'
    }</div>`
  );

  view.querySelectorAll('[data-task]').forEach(b => {
    b.onclick = () => gateThen(() => {
      taskSubmit(b.dataset.task, b.dataset.url, b.dataset.proof === '1');
    });
  });
}

async function taskSubmit(id, url, proofRequired) {
  if (url && /^https?:\/\//i.test(url)) tg?.openLink(url);

  const proof = prompt(
    proofRequired
      ? 'Enter task proof (link or short details):'
      : 'Optional task proof (leave blank if not required):',
    ''
  );

  if (proof === null) return;

  try {
    await api(`/api/tasks/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ proof })
    });

    toast('Task submitted for review.');
    await tasksPage();
    mountBannerAds(view);
  } catch (e) {
    toast(e.message);
  }
}

/* REFERRAL PAGE */
async function referralPage() {
  const d = await api('/api/referrals');

  const link = d.link || 'Referral link is not available.';
  const successful = Number(d.successfulCount ?? d.count ?? 0);
  const total = Number(d.totalCount || 0);
  const inProgress = Number(d.inProgressCount || 0);
  const required = Number(d.requiredSuccessfulReferrals || REQUIRED_REFERRALS);

  const referralRows = (d.referrals || []).map(r => {
    const done = Math.min(
      Number(r.completedAds || 0),
      Number(r.requiredAds || 20)
    );

    const need = Number(r.requiredAds || 20);
    const percent = Math.max(0, Math.min(100, done / need * 100));
    const successfulStatus = r.status === 'successful';

    const fullName = [
      r.firstName,
      r.lastName
    ].filter(Boolean).join(' ') || 'Telegram User';

    return `
      <div class="list-card" style="display:block">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div>
            <b>${esc(fullName)}</b>
            <p class="muted" style="margin:4px 0 0">
              ${r.username ? '@' + esc(r.username) : 'Telegram user'}
            </p>
          </div>
          <span class="pill" style="${
            successfulStatus ? 'background:#123d35;color:#79e5c3' : ''
          }">
            ${successfulStatus ? 'Successful' : 'In Progress'}
          </span>
        </div>

        <div style="display:flex;justify-content:space-between;margin-top:13px;font-size:11px;color:#aab6d0">
          <span>Ads completed</span>
          <b>${done}/${need}</b>
        </div>

        <div style="height:7px;background:#293653;border-radius:20px;overflow:hidden;margin-top:7px">
          <div style="height:100%;width:${percent}%;background:${
            successfulStatus ? '#19c995' : '#ff9a32'
          };border-radius:20px"></div>
        </div>
      </div>
    `;
  }).join('');

  view.innerHTML = shell(
    'Invite & Earn',
    'Invite friends and earn referral rewards.',
    `
      <div class="panel" style="margin-bottom:12px">
        <h3 style="margin-top:0">Referral Bonus</h3>
        <div class="amount">${money(REFERRAL_BONUS)}</div>
        <p class="muted">প্রতি ১টি সফল Referral-এর জন্য ৳১০।</p>
        <p class="muted">১০টি সফল Referral হলে Withdrawal আনলক হবে।</p>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><b>${successful}</b><small>Successful referrals</small></div>
        <div class="stat-card"><b>${inProgress}</b><small>In progress</small></div>
        <div class="stat-card"><b>${total}</b><small>Total invited</small></div>
        <div class="stat-card"><b>${Math.max(0, required - successful)}</b><small>More needed for withdrawal</small></div>
      </div>

      <div class="panel" style="margin-top:12px">
        <div class="field">
          <label>Your personal referral link</label>
          <div class="copy-row">
            <input id="refLink" readonly value="${esc(link)}">
            <button class="secondary-btn" id="copyRef">Copy</button>
          </div>
        </div>
        <p class="muted" style="font-size:11px;margin:12px 0 0">
          Referral bonus: ${money(REFERRAL_BONUS)} • Withdrawal unlocks at ${required} successful referrals.
        </p>
      </div>

      <h2 class="section-title" style="margin-top:20px">Your invited users</h2>
      <div class="list">
        ${
          referralRows ||
          '<div class="empty">No invited users yet. Share your referral link to invite friends.</div>'
        }
      </div>

      ${channelButton()}
    `
  );

  document.getElementById('copyRef').onclick = async () => {
    const input = document.getElementById('refLink');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        input.select();
        document.execCommand('copy');
      }

      toast('Referral link copied');
    } catch (e) {
      input.select();
      toast('Select and copy your referral link');
    }
  };
}

/* WALLET PAGE */
async function walletPage() {
  await refreshMe();

  const referralData = await api('/api/referrals');

  const successful = Number(
    referralData.successfulCount ?? referralData.count ?? 0
  );

  const required = Number(
    referralData.requiredSuccessfulReferrals || REQUIRED_REFERRALS
  );

  const locked = successful < required;

  view.innerHTML = shell(
    'Wallet & Withdraw',
    'Submit a withdrawal request. Requests are reviewed by the platform.',
    `
      <div class="panel">
        <small class="muted">AVAILABLE BALANCE</small>
        <div class="amount">${money(me.balance)}</div>
        <p class="muted">Minimum withdrawal: configured by platform</p>
      </div>

      <div class="panel" style="margin-top:12px">
        <b>Referral requirement</b>

        <div style="display:flex;justify-content:space-between;margin-top:10px">
          <span class="muted">Successful referrals</span>
          <b>${successful}/${required}</b>
        </div>

        <div style="height:8px;background:#293653;border-radius:20px;overflow:hidden;margin-top:8px">
          <div style="height:100%;width:${Math.min(100, successful / required * 100)}%;background:#19c995"></div>
        </div>

        <p class="muted" style="font-size:11px;margin-bottom:0">
          ${
            locked
              ? `Withdrawal is locked. Complete ${required - successful} more successful referral(s).`
              : 'Your referral requirement is complete. Withdrawal is unlocked.'
          }
        </p>
      </div>

      <div class="panel" style="margin-top:12px">
        <form id="withdrawForm" class="form">
          <div class="field">
            <label>Amount (BDT)</label>
            <input name="amount" type="number" min="1" step="0.01" required placeholder="Enter amount">
          </div>

          <div class="field">
            <label>Payment method</label>
            <select name="method" required>
              <option value="">Select method</option>
              <option>bKash</option>
              <option>Nagad</option>
              <option>Binance USDT</option>
            </select>
          </div>

          <div class="field">
            <label>Payment account / wallet address</label>
            <input name="account" required minlength="5" maxlength="120" placeholder="Enter number or wallet address">
          </div>

          <button class="primary-btn full"
            ${locked ? 'disabled style="opacity:.45;cursor:not-allowed"' : ''}>
            ${locked ? 'Locked — Need More Referrals' : 'Submit Withdrawal'}
          </button>
        </form>
      </div>

      ${channelButton()}
    `
  );

  document.getElementById('withdrawForm').onsubmit = async e => {
    e.preventDefault();

    if (locked) {
      toast(`You need ${required - successful} more successful referrals.`);
      return;
    }

    const f = new FormData(e.target);

    gateThen(async () => {
      try {
        const d = await api('/api/withdraw', {
          method: 'POST',
          body: JSON.stringify({
            amount: Number(f.get('amount')),
            method: f.get('method'),
            account: f.get('account')
          })
        });

        toast(d.message || 'Request submitted');
        await walletPage();
        mountBannerAds(view);
        connectChannelButton();
      } catch (err) {
        toast(err.message);
      }
    });
  };
}

/* HISTORY PAGE */
async function historyPage() {
  const items = await api('/api/history');

  view.innerHTML = shell(
    'Transaction History',
    'Your latest wallet activities.',
    `<div class="list">${
      items.length
        ? items.map(x => `
          <div class="list-card">
            <div>
              <h3>${esc((x.type || 'transaction').replaceAll('_', ' '))}</h3>
              <p>${esc(x.note || '')} • ${esc(x.createdAt || '')}</p>
            </div>
            <div style="text-align:right">
              <b>${money(x.amount)}</b>
              <p class="status">${esc(x.status || '')}</p>
            </div>
          </div>
        `).join('')
        : '<div class="empty">No transactions yet.</div>'
    }</div>`
  );
}

/* PROFILE PAGE */
async function profilePage() {
  await refreshMe();

  const joined = me.createdAt
    ? new Date(me.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : '—';

  const lastLogin = me.lastLogin
    ? new Date(me.lastLogin).toLocaleString('en-GB')
    : '—';

  view.innerHTML = shell(
    'My Profile',
    'Your Telegram account details.',
    `
      <div class="panel">
        <div class="profile-row">
          <div class="avatar">${esc((me.firstName || 'U').slice(0, 1).toUpperCase())}</div>
          <div>
            <b>${esc([me.firstName, me.lastName].filter(Boolean).join(' ') || 'Telegram User')}</b>
            <p class="muted">@${esc(me.username || 'no_username')} • ID ${esc(me.telegramId)}</p>
          </div>
        </div>

        <div class="divider"></div>

        <div class="profile-detail-grid">
          <div class="profile-detail"><small>Account status</small><b class="status-badge">${esc(me.status || 'active')}</b></div>
          <div class="profile-detail"><small>Member since</small><b>${esc(joined)}</b></div>
          <div class="profile-detail"><small>Last login</small><b>${esc(lastLogin)}</b></div>
          <div class="profile-detail"><small>Telegram ID</small><b>${esc(me.telegramId || '—')}</b></div>
          <div class="profile-detail"><small>Email</small><b>${esc(me.email || 'Not added')}</b></div>
          <div class="profile-detail"><small>Phone</small><b>${esc(me.phone || 'Not added')}</b></div>
        </div>
      </div>

      <h2 class="section-title">Account Overview</h2>

      <div class="stat-grid profile-stats">
        <div class="stat-card"><small>Total balance</small><b>${money(me.balance)}</b></div>
        <div class="stat-card"><small>Total earnings</small><b>${money(me.totalEarnings)}</b></div>
        <div class="stat-card"><small>Successful Referrals</small><b>${Number(me.referralsCount || 0)}</b></div>
        <div class="stat-card"><small>Completed tasks</small><b>${Number(me.completedTasks || 0)}</b></div>
        <div class="stat-card"><small>Pending tasks</small><b>${Number(me.pendingTasks || 0)}</b></div>
        <div class="stat-card"><small>Total withdrawn</small><b>${money(me.withdrawnAmount)}</b></div>
      </div>

      <button class="secondary-btn full profile-history-btn" id="historyBtn">
        View transaction history
      </button>

      ${channelButton()}
    `
  );

  document.getElementById('historyBtn').onclick = () => {
    gateThen(() => loadPage('history'));
  };
}

/* START APPLICATION */
async function boot() {
  if (!initData) {
    view.innerHTML = '<div class="empty">Please open EarnWalletBot from your Telegram bot. Direct browser access is not authenticated.</div>';
    return;
  }

  try {
    const d = await api('/api/auth', {
      method: 'POST',
      body: '{}'
    });

    me = d;

    await loadAdPlacements(true);
    await loadPage('home');

    hydrateAdSlots(document);
    mountBannerAds(document);
    connectChannelButton();
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}<br><br><button class="secondary-btn" onclick="location.reload()">Try again</button></div>`;
  }
}

boot();
})();
