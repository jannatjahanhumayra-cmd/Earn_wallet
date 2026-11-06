const tg = window.Telegram.WebApp;
tg.expand(); // ফুল স্ক্রিন

// DOM Elements
const userNameEl = document.getElementById('user-name');
const userAvatarEl = document.getElementById('user-avatar');
const balanceEl = document.getElementById('balance-amount');
const todayEarnEl = document.getElementById('today-earn');
const totalEarnEl = document.getElementById('total-earn');

// Stats Elements
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
    // Telegram Auth Call
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Authorization': 'tma ' + tg.initData,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await res.json();
    
    if (result.success) {
      const user = result.data;
      
      // Update DOM with User Data
      userNameEl.innerText = user.firstName || 'User';
      if (user.telegramId) {
        // ডামি অ্যাভাটার (পরে চাইলে টেলিগ্রাম API থেকে আসল ছবি আনা যাবে)
        userAvatarEl.src = `https://ui-avatars.com/api/?name=${user.firstName || 'U'}&background=ff6600&color=fff`;
      }
      
      // Update Balance
      balanceEl.innerText = `৳ ${user.balance || 0}`;
      todayEarnEl.innerText = `৳ ${user.todayEarnings || 0}`;
      totalEarnEl.innerText = `৳ ${user.totalEarnings || 0}`;
      
      // Update Stats
      statRefs.innerText = user.referralsCount || 0;
      statTasks.innerText = user.completedTasks || 0;
      statPending.innerText = user.pendingTasks || 0;
      statWithdrawn.innerText = `৳ ${user.withdrawnAmount || 0}`;
      
    } else {
      console.error("Auth failed:", result.error);
    }
  } catch (error) {
    console.error("Network error:", error);
  }
}

// Run
initApp();
