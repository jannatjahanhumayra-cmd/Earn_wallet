const tg = window.Telegram.WebApp;
tg.expand();

const $ = (id) => document.getElementById(id);
const userNameEl = $('user-name');
const userAvatarEl = $('user-avatar');
const balanceEl = $('balance-amount');
const todayEarnEl = $('today-earn');
const totalEarnEl = $('total-earn');
const statRefs = $('stat-refs');
const statTasks = $('stat-tasks');
const statPending = $('stat-pending');
const statWithdrawn = $('stat-withdrawn');

let authHeaders = {};
let currentUser = null;
let watchInterval = null;

function money(value) {
  return `৳ ${Number(value || 0).toFixed(2)}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...authHeaders, ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }
  return result;
}

function updateUser(user) {
  currentUser = user;
  userNameEl.innerText = user.firstName || 'User';
  if (user.telegramId) {
    userAvatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.firstName || 'U')}&background=ff6600&color=fff`;
  }
  balanceEl.innerText = money(user.balance);
  todayEarnEl.innerText = money(user.todayEarnings);
  totalEarnEl.innerText = money(user.totalEarnings);
  statRefs.innerText = user.referralsCount || 0;
  statTasks.innerText = user.completedTasks || 0;
  statPending.innerText = user.pendingTasks || 0;
  statWithdrawn.innerText = money(user.withdrawnAmount);
}

async function refreshUser() {
  const result = await api('/api/me');
  updateUser(result.data);
}

async function initApp() {
  if (!tg.initData) {
    userNameEl.innerText = 'Open inside Telegram';
    return;
  }

  authHeaders = {
    'Authorization': 'tma ' + tg.initData,
    'Content-Type': 'application/json'
  };

  try {
    const result = await api('/api/auth', { method: 'POST' });
    updateUser(result.data);
  } catch (error) {
    userNameEl.innerText = 'Login failed';
    console.error(error);
    tg.showAlert?.(error.message);
  }
}

async function openAds() {
  $('ads-view').hidden = false;
  $('ads-message').innerText = 'Loading advertisements...';
  $('ads-list').innerHTML = '';
  document.querySelector('.action-cards').hidden = true;
  try {
    const result = await api('/api/ads');
    const ads = result.data || [];
    $('ads-message').innerText = ads.length ? `${ads.length} advertisement(s) available` : 'No advertisements available right now. Please check again later.';
    $('ads-list').innerHTML = '';
    ads.forEach(ad => {
      const card = document.createElement('article');
      card.className = 'ad-item';
      const title = document.createElement('h4');
      title.textContent = ad.title;
      const meta = document.createElement('div');
      meta.className = 'ad-meta';
      meta.innerHTML = `<span>Reward: <strong>${money(ad.reward)}</strong></span><span>Time: ${Number(ad.duration)} sec</span>`;
      const button = document.createElement('button');
      button.className = 'watch-button';
      button.textContent = 'Watch Now';
      button.addEventListener('click', () => startAd(ad, button));
      card.append(title, meta, button);
      $('ads-list').appendChild(card);
    });
  } catch (error) {
    $('ads-message').innerText = error.message;
  }
}

async function startAd(ad, button) {
  if (watchInterval) {
    tg.showAlert?.('Finish the current ad first.');
    return;
  }
  button.disabled = true;
  try {
    const result = await api(`/api/ads/${encodeURIComponent(ad.id)}/start`, { method: 'POST' });
    const session = result.data;
    const deadline = Date.now() + session.duration * 1000;
    $('watch-status').hidden = false;
    $('watch-status').innerHTML = 'Advertisement opened. Keep this Mini App open until the timer finishes.<strong id="watch-countdown"></strong>';

    // Open the sponsored destination only after the backend creates a session.
    if (tg.openLink) tg.openLink(session.url);
    else window.open(session.url, '_blank', 'noopener,noreferrer');

    const tick = async () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      const counter = $('watch-countdown');
      if (counter) counter.textContent = remaining > 0 ? `${remaining}s remaining` : 'Verifying reward...';
      if (remaining > 0) return;

      clearInterval(watchInterval);
      watchInterval = null;
      try {
        const completed = await api('/api/ads/complete', {
          method: 'POST',
          body: JSON.stringify({ sessionId: session.sessionId })
        });
        if (counter) counter.textContent = `Completed! ${money(completed.data.reward)} added`;
        await refreshUser();
        button.closest('.ad-item')?.remove();
        $('ads-message').innerText = $('ads-list').children.length
          ? 'More advertisements are available.'
          : 'You have completed all currently available advertisements.';
      } catch (error) {
        if (counter) counter.textContent = error.message;
        button.disabled = false;
      }
    };
    await tick();
    if (deadline > Date.now()) watchInterval = setInterval(tick, 1000);
  } catch (error) {
    button.disabled = false;
    tg.showAlert?.(error.message);
  }
}

$('open-ads')?.addEventListener('click', openAds);
$('back-home')?.addEventListener('click', () => {
  $('ads-view').hidden = true;
  document.querySelector('.action-cards').hidden = false;
  if (watchInterval) {
    // Keep the active timer running even if the user returns to the dashboard.
  }
});
document.querySelectorAll('.nav-item').forEach((item, index) => {
  item.addEventListener('click', (event) => {
    if (index === 1) {
      event.preventDefault();
      openAds();
    }
  });
});

initApp();
