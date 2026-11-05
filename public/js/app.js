const tg = window.Telegram.WebApp;
tg.expand();

let currentUser = null;

// Initialize App
async function initApp() {
    const user = tg.initDataUnsafe?.user;

    if (!user) {
        // Fallback for browser testing (Local mock user)
        currentUser = {
            id: 123456789,
            first_name: "Test User",
            username: "testuser"
        };
    } else {
        currentUser = user;
    }

    document.getElementById('user-name').innerText = currentUser.first_name;
    document.getElementById('user-id').innerText = `ID: ${currentUser.id}`;

    // Authenticate / Register with Backend
    await registerOrLoginUser(currentUser);
}

async function registerOrLoginUser(userData) {
    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const data = await response.json();
        if (data.success) {
            updateDashboard(data.user);
        }
    } catch (error) {
        console.error('Auth Error:', error);
    }
}

function updateDashboard(userData) {
    document.getElementById('balance-amount').innerText = `$${userData.balance.toFixed(2)}`;
    document.getElementById('today-earnings').innerText = `$${userData.todayEarnings.toFixed(2)}`;
    document.getElementById('total-earnings').innerText = `$${userData.totalEarnings.toFixed(2)}`;
    document.getElementById('stat-referrals').innerText = userData.referralCount || 0;
    document.getElementById('stat-tasks').innerText = userData.completedTasks || 0;
    document.getElementById('stat-pending').innerText = userData.pendingTasks || 0;
    document.getElementById('stat-withdrawn').innerText = `$${userData.withdrawnAmount.toFixed(2)}`;
}

function switchTab(tabName, element) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    element.classList.add('active');

    const mainHome = document.getElementById('view-home');
    const dynamicView = document.getElementById('dynamic-view');

    if (tabName === 'home') {
        mainHome.style.display = 'block';
        dynamicView.style.display = 'none';
    } else {
        mainHome.style.display = 'none';
        dynamicView.style.display = 'block';
        dynamicView.innerHTML = `<div style="padding: 20px; text-align: center; color: #94a3b8;"><h2>${tabName.toUpperCase()} Section</h2><p>Coming up in next phase...</p></div>`;
    }
}

window.onload = initApp;
