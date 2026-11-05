// Admin Panel Logic & Dashboard Controller
document.addEventListener("DOMContentLoaded", () => {
    fetchAdminStats();
    fetchUsersList();
});

// Fetch Overall System Statistics
async function fetchAdminStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('total-users').innerText = data.stats.totalUsers || 0;
            document.getElementById('total-earnings').innerText = `$${(data.stats.totalEarnings || 0).toFixed(2)}`;
            document.getElementById('total-withdrawals').innerText = `$${(data.stats.totalWithdrawals || 0).toFixed(2)}`;
            document.getElementById('pending-withdrawals').innerText = data.stats.pendingWithdrawals || 0;
        }
    } catch (error) {
        console.error('Error fetching admin stats:', error);
    }
}

// Fetch All Users List for Management
async function fetchUsersList() {
    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        
        if (data.success) {
            const usersTableBody = document.getElementById('users-table-body');
            if (!usersTableBody) return;
            
            usersTableBody.innerHTML = '';
            data.users.forEach(user => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.telegramId}</td>
                    <td>${user.firstName}</td>
                    <td>$${(user.balance || 0).toFixed(2)}</td>
                    <td>${user.referralCount || 0}</td>
                    <td>
                        <button onclick="banUser('${user.telegramId}')" class="btn-danger">Ban</button>
                    </td>
                `;
                usersTableBody.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Error fetching users:', error);
    }
}

// Ban User Function
async function banUser(userId) {
    if (!confirm('Are you sure you want to ban this user?')) return;
    
    try {
        const response = await fetch(`/api/admin/user/ban/${userId}`, {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            alert('User banned successfully');
            fetchUsersList();
        } else {
            alert('Failed to ban user: ' + data.message);
        }
    } catch (error) {
        console.error('Ban error:', error);
    }
}
