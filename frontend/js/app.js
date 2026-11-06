// Telegram WebApp initialize
const tg = window.Telegram.WebApp;
tg.expand(); // ফুল স্ক্রিন

const greetingEl = document.getElementById('greeting');
const statusEl = document.getElementById('status');

async function authenticateUser() {
  // যদি Telegram WebApp এর বাইরে ওপেন করা হয় (যেমন PC ব্রাউজার)
  if (!tg.initData) {
    statusEl.innerText = "⚠️ Please open this inside Telegram App.";
    greetingEl.innerText = "Hello, Guest";
    return;
  }

  try {
    // Backend-এ InitData পাঠানো (যা telegramAuth মিডলওয়্যার ভেরিফাই করবে)
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Authorization': `tma ${tg.initData}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (result.success) {
      const user = result.data;
      greetingEl.innerText = `Hello, ${user.firstName || 'User'}! 👋`;
      statusEl.innerText = `Balance: ৳ ${user.balance} | Status: Logged In`;
      statusEl.style.color = "#4ade80"; // Green
      
      console.log("User Data:", user);
    } else {
      throw new Error(result.error || "Auth failed");
    }
  } catch (error) {
    console.error("Auth Error:", error);
    greetingEl.innerText = "Authentication Failed";
    statusEl.innerText = "Error: " + error.message;
    statusEl.style.color = "#ef4444"; // Red
  }
}

// Run on load
authenticateUser();
