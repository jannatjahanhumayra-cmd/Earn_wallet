const tg = window.Telegram.WebApp;
tg.expand();

const userNameEl = document.getElementById('user-name');
const userAvatarEl = document.getElementById('user-avatar');
const balanceEl = document.getElementById('balance-amount');
const todayEarnEl = document.getElementById('today-earn');
const totalEarnEl = document.getElementById('total-earn');
const statRefs = document.getElementById('stat-refs');
const statTasks = document.getElementById('stat-tasks');
const statPending = document.getElementById('stat-pending');
const statWithdrawn = document.getElementById('stat-withdrawn');

async function initApp() {
  if (!tg.initData) {
    userNameEl.innerText = "Guest Mode";
    return;
  }

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Authorization': 'tma ' + tg.initData, 'Content-Type': 'application/json' }
    });
    
    const result = await res.json();
    
    if (result.success) {
      const user = result.data;
      userNameEl.innerText = user.firstName || 'User';
      if (user.telegramId) {
        userAvatarEl.src = `https://ui-avatars.com/api/?name=${user.firstName || 'U'}&background=ff6600&color=fff`;
      }
      balanceEl.innerText = `৳ ${user.balance || 0}`;
      todayEarnEl.innerText = `৳ ${user.todayEarnings || 0}`;
      totalEarnEl.innerText = `৳ ${user.totalEarnings || 0}`;
      statRefs.innerText = user.referralsCount || 0;
      statTasks.innerText = user.completedTasks || 0;
      statPending.innerText = user.pendingTasks || 0;
      statWithdrawn.innerText = `৳ ${user.withdrawnAmount || 0}`;
    }
  } catch (error) {
    console.error("Network error:", error);
  }
}
initApp();
