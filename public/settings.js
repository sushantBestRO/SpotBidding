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
                        <span class="role-badge ${user.role || (user.isAdmin ? 'admin' : 'analyst')}">${(user.role || (user.isAdmin ? 'admin' : 'analyst')).toUpperCase()}</span>
                    </div>
                    <div class="user-actions">
                        <button class="btn btn-small" onclick="changeUserPassword('${user.username}')">Change Password</button>
                        ${!user.isAdmin && user.role !== 'admin' ? `<button class="btn btn-small btn-danger" onclick="removeUser('${user.username}')">Remove</button>` : ''}
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
    const role = document.getElementById('newRole').value;
    const isAdmin = role === 'admin';

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
            body: JSON.stringify({ username, name, password, role, isAdmin })
        });

        if (response.ok) {
            alert('User added successfully');
            closeAddUserModal();
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
// async function loadPricingSettings() {
//     try {
//         const res = await fetch('/api/settings/pricing');
//         if (!res.ok) return;
//         const data = await res.json();
//         const p = data.pricePercents || { high: 9, medium: 7, low: 5 };
//         document.getElementById('percentHigh').value = p.high;
//         document.getElementById('percentMedium').value = p.medium;
//         document.getElementById('percentLow').value = p.low;
//     } catch (e) {
//         console.error('Failed to load pricing settings', e);
//     }
// }

// Load pricing settings (admin)
async function loadPricingSettings() {
    try {
        const res = await fetch('/api/settings/pricing');
        if (!res.ok) return;
        const data = await res.json();
        const pricePercents = data.pricePercents || {};

        // Load data using unique IDs
        for (let i = 1; i <= 20; i++) {
            const bidKey = `bid_${i}`;
            const bidData = pricePercents[bidKey] || { high: 9, medium: 7, low: 5 };

            // Set values using unique IDs
            const highInput = document.getElementById(`percentHigh_${i}`);
            const mediumInput = document.getElementById(`percentMedium_${i}`);
            const lowInput = document.getElementById(`percentLow_${i}`);

            if (highInput) highInput.value = bidData.high || 9;
            if (mediumInput) mediumInput.value = bidData.medium || 7;
            if (lowInput) lowInput.value = bidData.low || 5;
        }

        console.log('Pricing settings loaded:', pricePercents);
    } catch (e) {
        console.error('Failed to load pricing settings', e);
    }
}

// Save pricing settings (admin)
// async function savePricingSettings() {
//     const high = Number(document.getElementById('percentHigh').value || 9);
//     const medium = Number(document.getElementById('percentMedium').value || 7);
//     const low = Number(document.getElementById('percentLow').value || 5);
//     try {
//         const res = await fetch('/api/settings/pricing', {
//             method: 'PUT',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ high, medium, low })
//         });
//         if (res.ok) {
//             alert('Pricing percentages saved');
//         } else {
//             const err = await res.json();
//             alert(err.error || 'Failed to save');
//         }
//     } catch (e) {
//         console.error('Failed to save pricing settings', e);
//         alert('Failed to save');
//     }
// }

async function savePricingSettings() {
    const pricingData = {};

    // Collect all 20 bid sets in nested format
    document.querySelectorAll('input.highBid').forEach((input, index) => {
        const bidKey = `bid_${index + 1}`;
        
        if (!pricingData[bidKey]) {
            pricingData[bidKey] = {};
        }
        pricingData[bidKey].high = Number(input.value || 9);
    });

    document.querySelectorAll('input.mediumBid').forEach((input, index) => {
        const bidKey = `bid_${index + 1}`;
        
        if (!pricingData[bidKey]) {
            pricingData[bidKey] = {};
        }
        pricingData[bidKey].medium = Number(input.value || 7);
    });

    document.querySelectorAll('input.lowBid').forEach((input, index) => {
        const bidKey = `bid_${index + 1}`;
        
        if (!pricingData[bidKey]) {
            pricingData[bidKey] = {};
        }
        pricingData[bidKey].low = Number(input.value || 5);
    });

    try {
        const res = await fetch('/api/settings/pricing', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pricingData)
        });

        if (res.ok) {
            alert('Pricing percentages saved successfully!');
            console.log('Saved data:', pricingData);
        } else {
            const err = await res.json();
            alert(err.error || 'Failed to save');
        }
    } catch (e) {
        console.error('Failed to save pricing settings', e);
        alert('Failed to save pricing settings');
    }
}

// Load email settings
async function loadEmailSettings() {
    try {
        const response = await fetch('/api/email-config');
        if (!response.ok) return;

        const data = await response.json();

        document.getElementById('recipientEmail').value = data.recipientEmail || '';
        document.getElementById('reportTime').value = data.dailyReportTime || '21:00';
        document.getElementById('enableReports').checked = data.enableDailyReports !== false;
    } catch (error) {
        console.error('Failed to load email settings:', error);
    }
}

// Save email settings
async function saveEmailSettings() {
    const recipientEmail = document.getElementById('recipientEmail').value.trim();
    const reportTime = document.getElementById('reportTime').value;
    const enableReports = document.getElementById('enableReports').checked;

    if (!recipientEmail) {
        alert('Please enter a recipient email address');
        return;
    }

    if (!recipientEmail.includes('@')) {
        alert('Please enter a valid email address');
        return;
    }

    try {
        const response = await fetch('/api/email-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                recipientEmail,
                dailyReportTime: reportTime,
                enableDailyReports: enableReports
            })
        });

        const result = await response.json();

        if (response.ok) {
            showEmailStatus('Email settings saved successfully!', 'success');
        } else {
            showEmailStatus(result.error || 'Failed to save email settings', 'error');
        }
    } catch (error) {
        console.error('Error saving email settings:', error);
        showEmailStatus('Failed to save email settings', 'error');
    }
}

// Test email functionality
async function testEmail() {
    const statusDiv = document.getElementById('emailStatus');
    statusDiv.style.display = 'block';
    statusDiv.className = 'status-message loading';
    statusDiv.textContent = 'Sending test email...';

    try {
        const response = await fetch('/api/email-test', {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok) {
            showEmailStatus(`Test email sent successfully! Message ID: ${result.messageId}`, 'success');
        } else {
            showEmailStatus(result.error || 'Failed to send test email', 'error');
        }
    } catch (error) {
        console.error('Error sending test email:', error);
        showEmailStatus('Failed to send test email', 'error');
    }
}

// Show email status message
function showEmailStatus(message, type) {
    const statusDiv = document.getElementById('emailStatus');
    statusDiv.style.display = 'block';
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message;

    // Hide after 5 seconds for success messages
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}

// Load WhatsApp settings
async function loadWhatsAppSettings() {
    try {
        const response = await fetch('/api/whatsapp-config');
        if (!response.ok) return;

        const data = await response.json();

        document.getElementById('whatsappSenderNumber').value = data.senderNumber || '';
        document.getElementById('whatsappTemplateName').value = data.templateName || 'hello_world';
        document.getElementById('enableWhatsApp').checked = data.enableWhatsApp || false;
    } catch (error) {
        console.error('Failed to load WhatsApp settings:', error);
    }
}

// Save WhatsApp settings
async function saveWhatsAppSettings() {
    const apiKey = document.getElementById('whatsappApiKey').value.trim();
    const senderNumber = document.getElementById('whatsappSenderNumber').value.trim();
    const templateName = document.getElementById('whatsappTemplateName').value.trim();
    const enableWhatsApp = document.getElementById('enableWhatsApp').checked;

    if (!apiKey) {
        alert('Please enter DoubleTick API key');
        return;
    }

    if (!senderNumber) {
        alert('Please enter sender WhatsApp number');
        return;
    }

    if (!templateName) {
        alert('Please enter template name');
        return;
    }

    try {
        const response = await fetch('/api/whatsapp-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apiKey,
                senderNumber,
                templateName,
                enableWhatsApp
            })
        });

        const result = await response.json();

        if (response.ok) {
            showWhatsAppStatus('WhatsApp settings saved successfully!', 'success');
            document.getElementById('whatsappApiKey').value = ''; // Clear for security
        } else {
            showWhatsAppStatus(result.error || 'Failed to save WhatsApp settings', 'error');
        }
    } catch (error) {
        console.error('Error saving WhatsApp settings:', error);
        showWhatsAppStatus('Failed to save WhatsApp settings', 'error');
    }
}

// Test WhatsApp
async function testWhatsApp() {
    const testPhone = prompt('Enter phone number to test (with country code, e.g., +91XXXXXXXXXX):');
    if (!testPhone) return;

    const statusDiv = document.getElementById('whatsappStatus');
    statusDiv.style.display = 'block';
    statusDiv.className = 'status-message loading';
    statusDiv.textContent = 'Sending test message...';

    try {
        const response = await fetch('/api/whatsapp-test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phoneNumber: testPhone,
                message: 'This is a test message from GoComet Bidder WhatsApp integration. System is working correctly!'
            })
        });

        const result = await response.json();

        if (response.ok) {
            showWhatsAppStatus(`Test message sent successfully to ${testPhone}!`, 'success');
        } else {
            showWhatsAppStatus(result.error || 'Failed to send test message', 'error');
        }
    } catch (error) {
        console.error('Error sending test message:', error);
        showWhatsAppStatus('Failed to send test message', 'error');
    }
}

// Show WhatsApp status message
function showWhatsAppStatus(message, type) {
    const statusDiv = document.getElementById('whatsappStatus');
    statusDiv.style.display = 'block';
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message;

    // Hide after 5 seconds for success messages
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}

// Load locations
async function loadLocations() {
    try {
        const response = await fetch('/api/locations');
        if (!response.ok) return;

        const data = await response.json();
        const locationListDiv = document.getElementById('locationList');

        if (data.locations && data.locations.length > 0) {
            locationListDiv.innerHTML = data.locations.map(location => `
                <div class="location-item" data-location-id="${location.id}">
                    <div class="location-info">
                        <div class="location-header">
                            <strong>${location.plantName}</strong>
                            <span class="location-id">(${location.id})</span>
                        </div>
                        <div class="location-details">
                            <div><strong>Person:</strong> ${location.concernedPerson}</div>
                            <div><strong>Mobile:</strong> ${location.mobile}</div>
                            <div><strong>Email:</strong> ${location.email || 'N/A'}</div>
                            <div><strong>Address:</strong> ${location.sourceLocation || 'N/A'}</div>
                        </div>
                    </div>
                    <div class="location-actions">
                        <button class="btn btn-small" onclick="editLocation('${location.id}')">Edit</button>
                        <button class="btn btn-small btn-danger" onclick="removeLocation('${location.id}')">Remove</button>
                    </div>
                </div>
            `).join('');
        } else {
            locationListDiv.innerHTML = '<p>No locations configured</p>';
        }
    } catch (error) {
        console.error('Error loading locations:', error);
        document.getElementById('locationList').innerHTML = '<p class="error">Failed to load locations</p>';
    }
}

// Add location
async function addLocation() {
    const id = document.getElementById('newLocationId').value.trim();
    const plantName = document.getElementById('newPlantName').value.trim();
    const sourceLocation = document.getElementById('newSourceLocation').value.trim();
    const concernedPerson = document.getElementById('newConcernedPerson').value.trim();
    const mobile = document.getElementById('newMobile').value.trim();
    const email = document.getElementById('newEmail').value.trim();

    if (!id || !plantName || !concernedPerson || !mobile) {
        alert('Please fill all required fields (ID, Plant Name, Person, Mobile)');
        return;
    }

    try {
        const response = await fetch('/api/locations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id,
                plantName,
                sourceLocation,
                concernedPerson,
                mobile,
                email,
                // Use default template messages for now
                firstMessage: "New bid available for <>. Details: From <Loading Address> to <Delivery Address>. Please submit your best rate. Bid Closing Date and Time - ",
                winMessage: "Congratulations! You have WON the bid for <>. From <Loading Address> to <Delivery Address>. Our Final Ranking - Market Rate given by you- <> Final Rate: Rs No of Submissions-",
                loseMessage: "You have LOST the bid for <>. From <Loading Address> to <Delivery Address>. Our Final Ranking - Market Rate given by you- <> No of Submissions-"
            })
        });

        if (response.ok) {
            alert('Location added successfully');
            closeAddLocationModal();
            loadLocations();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to add location');
        }
    } catch (error) {
        console.error('Error adding location:', error);
        alert('Error adding location');
    }
}

// Edit location (placeholder - you can implement detailed edit modal)
async function editLocation(locationId) {
    alert(`Edit location functionality for ${locationId} - To be implemented with modal form`);
}

// Remove location
async function removeLocation(locationId) {
    if (!confirm(`Are you sure you want to remove this location?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/locations/${locationId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert('Location removed successfully');
            loadLocations();
        } else {
            alert('Failed to remove location');
        }
    } catch (error) {
        console.error('Error removing location:', error);
        alert('Error removing location');
    }
}

// Tab Management
function initTabSystem() {
    const tabs = document.querySelectorAll('.settings-tab');
    const contents = document.querySelectorAll('.settings-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab
            tab.classList.add('active');

            // Show corresponding content
            const targetTab = tab.getAttribute('data-tab');
            const targetContent = document.getElementById(`${targetTab}-tab`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

// Modal Management
function showAddLocationModal() {
    const modal = document.getElementById('addLocationModal');
    modal.classList.add('active');
    modal.style.display = 'flex';
}

function closeAddLocationModal() {
    const modal = document.getElementById('addLocationModal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);

    // Clear form
    ['newLocationId', 'newPlantName', 'newSourceLocation', 'newConcernedPerson',
        'newMobile', 'newEmail'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });
}

function showAddUserModal() {
    const modal = document.getElementById('addUserModal');
    modal.classList.add('active');
    modal.style.display = 'flex';
}

function closeAddUserModal() {
    const modal = document.getElementById('addUserModal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);

    // Clear form
    document.getElementById('newUsername').value = '';
    document.getElementById('newName').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newRole').value = 'analyst';
}

// Close modals when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        const modalId = e.target.id;
        if (modalId === 'addLocationModal') {
            closeAddLocationModal();
        } else if (modalId === 'addUserModal') {
            closeAddUserModal();
        }
    }
});

// Escape key to close modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const activeModals = document.querySelectorAll('.modal.active');
        activeModals.forEach(modal => {
            if (modal.id === 'addLocationModal') {
                closeAddLocationModal();
            } else if (modal.id === 'addUserModal') {
                closeAddUserModal();
            }
        });
    }
});

// Initialize
async function init() {
    const hasAccess = await checkAdminAccess();
    if (!hasAccess) return;

    // Initialize tab system
    initTabSystem();

    // Load all data
    loadUsers();
    loadActiveBidding();
    startAutoRefresh();
    loadPricingSettings();
    loadEmailSettings();
    loadWhatsAppSettings();
    loadLocations();
    loadTemplates();
}

// Template Management Functions
async function loadTemplates() {
    try {
        const response = await fetch('/api/templates/report');
        if (!response.ok) return;

        const report = await response.json();
        displayTemplates(report);
    } catch (error) {
        console.error('Failed to load templates:', error);
        document.getElementById('templatesList').innerHTML = '<div class="error">Failed to load templates</div>';
    }
}

function displayTemplates(report) {
    const container = document.getElementById('templatesList');

    if (report.totalTemplates === 0) {
        container.innerHTML = `
            <div class="template-info">
                <h3>No templates created yet</h3>
                <p>Click "Create All Templates" to generate 4 freight bidding templates:</p>
                <ul>
                    <li><strong>freight_bid_new</strong> - New bid notifications</li>
                    <li><strong>freight_bid_won</strong> - Winning bid notifications</li>
                    <li><strong>freight_bid_lost</strong> - Lost bid notifications</li>
                    <li><strong>freight_urgent</strong> - Urgent bid reminders</li>
                </ul>
            </div>
        `;
        return;
    }

    let html = `
        <div class="template-summary">
            <div class="summary-stats">
                <div class="stat-item">
                    <span class="stat-number">${report.totalTemplates}</span>
                    <span class="stat-label">Total</span>
                </div>
                <div class="stat-item pending">
                    <span class="stat-number">${report.pendingApproval}</span>
                    <span class="stat-label">Pending</span>
                </div>
                <div class="stat-item approved">
                    <span class="stat-number">${report.approved}</span>
                    <span class="stat-label">Approved</span>
                </div>
                <div class="stat-item rejected">
                    <span class="stat-number">${report.rejected}</span>
                    <span class="stat-label">Rejected</span>
                </div>
            </div>
        </div>
        <div class="templates-list">
    `;

    report.templates.forEach(template => {
        const statusClass = template.status.replace('_', '-');
        const statusText = template.status.replace('_', ' ').toUpperCase();

        html += `
            <div class="template-item">
                <div class="template-header">
                    <strong>${template.name}</strong>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="template-details">
                    <p>${template.description}</p>
                    <small>Created: ${new Date(template.createdAt).toLocaleString()}</small>
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

async function createAllTemplates() {
    const statusDiv = document.getElementById('templateStatus');
    statusDiv.style.display = 'block';
    statusDiv.className = 'status-message loading';
    statusDiv.textContent = 'Creating templates... This may take a few minutes.';

    try {
        const response = await fetch('/api/templates/create-all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (response.ok) {
            showTemplateStatus(
                `Templates created! ${result.summary.successful} successful, ${result.summary.failed} failed. Check your DoubleTick dashboard for approval status.`,
                'success'
            );
            loadTemplates(); // Refresh the display
        } else {
            showTemplateStatus(result.error || 'Failed to create templates', 'error');
        }
    } catch (error) {
        console.error('Error creating templates:', error);
        showTemplateStatus('Failed to create templates', 'error');
    }
}

async function showTemplateReport() {
    try {
        const response = await fetch('/api/templates/report');
        if (!response.ok) return;

        const report = await response.json();

        let message = `Template Report:\n`;
        message += `Total Templates: ${report.totalTemplates}\n`;
        message += `Pending Approval: ${report.pendingApproval}\n`;
        message += `Approved: ${report.approved}\n`;
        message += `Rejected: ${report.rejected}\n\n`;

        if (report.templates.length > 0) {
            message += 'Template Details:\n';
            report.templates.forEach(template => {
                message += `• ${template.name}: ${template.status}\n`;
            });
        }

        alert(message);
    } catch (error) {
        console.error('Failed to get template report:', error);
        alert('Failed to get template report');
    }
}

function showTemplateStatus(message, type) {
    const statusDiv = document.getElementById('templateStatus');
    statusDiv.style.display = 'block';
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message;

    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}

// Cleanup on exit
window.addEventListener('beforeunload', () => {
    if (refreshInterval) clearInterval(refreshInterval);
});

init();