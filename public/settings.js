// Check if user is admin on load
async function checkAdminAccess() {
    try {
        const response = await fetch('/api/user');
        const data = await response.json();
        
        if (!data.user || !data.user.isAdmin) {
            alert('Access denied. Admin privileges required.');
            window.location.href = '/';
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error checking admin access:', error);
        window.location.href = '/';
        return false;
    }
}

// Load users
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        const data = await response.json();
        
        const userListDiv = document.getElementById('userList');
        
        if (data.users && data.users.length > 0) {
            userListDiv.innerHTML = data.users.map(user => `
                <div class="user-item" data-username="${user.username}">
                    <div class="user-info">
                        <strong>${user.name}</strong> (${user.username})
                        ${user.isAdmin ? '<span class="admin-badge">Admin</span>' : ''}
                    </div>
                    <div class="user-actions">
                        <button class="btn btn-small" onclick="changeUserPassword('${user.username}')">Change Password</button>
                        ${!user.isAdmin ? `<button class="btn btn-small btn-danger" onclick="removeUser('${user.username}')">Remove</button>` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            userListDiv.innerHTML = '<p>No users found</p>';
        }
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('userList').innerHTML = '<p class="error">Failed to load users</p>';
    }
}

// Add new user
async function addUser() {
    const username = document.getElementById('newUsername').value.trim();
    const name = document.getElementById('newName').value.trim();
    const password = document.getElementById('newPassword').value;
    const isAdmin = document.getElementById('newIsAdmin').checked;
    
    if (!username || !name || !password) {
        alert('Please fill all fields');
        return;
    }
    
    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, name, password, isAdmin })
        });
        
        if (response.ok) {
            alert('User added successfully');
            // Clear form
            document.getElementById('newUsername').value = '';
            document.getElementById('newName').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('newIsAdmin').checked = false;
            
            // Reload users
            loadUsers();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to add user');
        }
    } catch (error) {
        console.error('Error adding user:', error);
        alert('Error adding user');
    }
}

// Remove user
async function removeUser(username) {
    if (!confirm(`Are you sure you want to remove user ${username}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/users/${username}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert('User removed successfully');
            loadUsers();
        } else {
            alert('Failed to remove user');
        }
    } catch (error) {
        console.error('Error removing user:', error);
        alert('Error removing user');
    }
}

// Change user password (admin changing for another user)
async function changeUserPassword(username) {
    const newPassword = prompt(`Enter new password for ${username}:`);
    if (!newPassword) return;
    
    try {
        const response = await fetch(`/api/users/${username}/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newPassword })
        });
        
        if (response.ok) {
            alert('Password changed successfully');
        } else {
            alert('Failed to change password');
        }
    } catch (error) {
        console.error('Error changing password:', error);
        alert('Error changing password');
    }
}

// Change own password
async function changeOwnPassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPasswordChange').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        alert('Please fill all fields');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        alert('New passwords do not match');
        return;
    }
    
    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        
        if (response.ok) {
            alert('Password changed successfully');
            // Clear form
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPasswordChange').value = '';
            document.getElementById('confirmPassword').value = '';
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to change password');
        }
    } catch (error) {
        console.error('Error changing password:', error);
        alert('Error changing password');
    }
}

// Load active bidding status
async function loadActiveBidding() {
    try {
        const response = await fetch('/api/bidding-status/all');
        const data = await response.json();
        
        const statusDiv = document.getElementById('activeBiddingStatus');
        
        if (data.statuses && Object.keys(data.statuses).length > 0) {
            statusDiv.innerHTML = Object.entries(data.statuses).map(([enquiryKey, status]) => `
                <div class="active-bid-item">
                    <div class="bid-header">
                        <strong>Enquiry: ${enquiryKey}</strong>
                        <span class="status-badge ${status.active ? 'active' : 'inactive'}">
                            ${status.active ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <div class="bid-details">
                        <div>Started by: <strong>${status.startedBy}</strong></div>
                        <div>Status: <strong>${status.status}</strong></div>
                        <div>Current Rank: <strong>${status.currentRank || 'N/A'}</strong></div>
                        <div>Bids Submitted: <strong>${status.bidsSubmitted}/3</strong></div>
                        ${status.bids ? `
                            <div class="bid-prices">
                                <div>High: ₹${Math.round(status.bids.high).toLocaleString()}</div>
                                <div>Medium: ₹${Math.round(status.bids.medium).toLocaleString()}</div>
                                <div>Low: ₹${Math.round(status.bids.low).toLocaleString()}</div>
                                ${status.marketValue ? `<div style="margin-top: 4px; font-size: 12px; color: #666;">Market Value: ₹${Math.round(status.marketValue).toLocaleString()}</div>` : ''}
                                ${status.isPublicSubmission ? `<div style="margin-top: 4px; font-size: 12px; color: #ff9800;">⚠️ Public Submission - Only admins can stop</div>` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            statusDiv.innerHTML = '<p>No active bidding sessions</p>';
        }
    } catch (error) {
        console.error('Error loading active bidding:', error);
        document.getElementById('activeBiddingStatus').innerHTML = '<p class="error">Failed to load active bidding status</p>';
    }
}

// Auto-refresh active bidding every 5 seconds
let refreshInterval = null;
function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        loadActiveBidding();
    }, 5000);
}

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
});

// Load pricing settings (admin)
async function loadPricingSettings() {
    try {
        const res = await fetch('/api/settings/pricing');
        if (!res.ok) return;
        const data = await res.json();
        const p = data.pricePercents || { high: 9, medium: 7, low: 5 };
        document.getElementById('percentHigh').value = p.high;
        document.getElementById('percentMedium').value = p.medium;
        document.getElementById('percentLow').value = p.low;
    } catch (e) {
        console.error('Failed to load pricing settings', e);
    }
}

// Save pricing settings (admin)
async function savePricingSettings() {
    const high = Number(document.getElementById('percentHigh').value || 9);
    const medium = Number(document.getElementById('percentMedium').value || 7);
    const low = Number(document.getElementById('percentLow').value || 5);
    try {
        const res = await fetch('/api/settings/pricing', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ high, medium, low })
        });
        if (res.ok) {
            alert('Pricing percentages saved');
        } else {
            const err = await res.json();
            alert(err.error || 'Failed to save');
        }
    } catch (e) {
        console.error('Failed to save pricing settings', e);
        alert('Failed to save');
    }
}

// Initialize
async function init() {
    const hasAccess = await checkAdminAccess();
    if (!hasAccess) return;
    
    loadUsers();
    loadActiveBidding();
    startAutoRefresh();
    loadPricingSettings();
}

// Cleanup on exit
window.addEventListener('beforeunload', () => {
    if (refreshInterval) clearInterval(refreshInterval);
});

init();