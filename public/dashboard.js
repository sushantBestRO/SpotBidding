console.log('[DASHBOARD.JS] Script loaded at:', new Date().toISOString());

// State management
let quotes = [];
let refreshInterval = null;
let countdownIntervals = new Map();
let activeBidMonitors = new Map();
let globalStatusPollInterval = null;

// Store bid values locally to prevent loss
const localBidStorage = new Map();

// Debounce function to prevent too many API calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Helper function to format time remaining
function formatTimeRemaining(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

// DOM elements
const authSection = document.getElementById('authSection');
const dashboardContent = document.getElementById('dashboardContent');
const quotesContainer = document.getElementById('quotesContainer');
const totalQueriesSpan = document.getElementById('totalQueries');
const lastUpdatedSpan = document.getElementById('lastUpdated');
const emailInput = document.getElementById('emailInput');
const tokenInput = document.getElementById('tokenInput');

// Toggle logs view
async function toggleLogs() {
    const quotesContainer = document.getElementById('quotesContainer');
    const logsContainer = document.getElementById('logsContainer');
    const viewLogsBtn = document.getElementById('viewLogsBtn');

    if (logsContainer.style.display === 'none') {
        // Show logs
        quotesContainer.style.display = 'none';
        logsContainer.style.display = 'block';
        viewLogsBtn.textContent = 'View Quotes';

        // Fetch and display logs
        await loadLogs();
    } else {
        // Show quotes
        quotesContainer.style.display = 'block';
        logsContainer.style.display = 'none';
        viewLogsBtn.textContent = 'View Logs';
    }
}

// Load logs from server
async function loadLogs() {
    try {
        // Fetch bid logs
        const bidResponse = await fetch('/api/logs/bids');
        const bidData = await bidResponse.json();

        // Fetch error logs
        const errorResponse = await fetch('/api/logs/errors');
        const errorData = await errorResponse.json();

        // Display bid logs
        const bidLogsDiv = document.getElementById('bidLogs');
        if (bidData.bids && bidData.bids.length > 0) {
            bidLogsDiv.innerHTML = bidData.bids.map(log => `
                <div class="log-entry ${log.success ? 'success' : 'failed'}">
                    <div class="log-time">${new Date(log.timestamp).toLocaleString()}</div>
                    <div class="log-content">
                        <strong>${log.enquiryKey}</strong>: ${log.bidType} bid 
                        ${log.success ? 'SUCCESS' : 'FAILED'} at ₹${log.bidPrice}
                        (${log.timeToClosingSec}s before closing, rank ${log.currentRank}, ${log.responseTimeMs}ms)
                    </div>
                </div>
            `).reverse().join('');
        } else {
            bidLogsDiv.innerHTML = '<p>No bid logs for today</p>';
        }

        // Display error logs
        const errorLogsDiv = document.getElementById('errorLogs');
        if (errorData.errors && errorData.errors.length > 0) {
            errorLogsDiv.innerHTML = errorData.errors.map(log => `
                <div class="log-entry error">
                    <div class="log-time">${new Date(log.timestamp).toLocaleString()}</div>
                    <div class="log-content">
                        <strong>${log.context}</strong>: ${log.error.message}
                    </div>
                </div>
            `).reverse().join('');
        } else {
            errorLogsDiv.innerHTML = '<p>No error logs for today</p>';
        }
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

// Initialize
async function init() {
    console.log('[INIT] Starting initialization...');

    try {
        const response = await fetch('/api/user');
        console.log('[INIT] User API response status:', response.status);
        const data = await response.json();
        console.log('[INIT] User data:', data);

        if (data.user) {
            document.getElementById('username-display').textContent = data.user.name;
            console.log('[INIT] Logged in as:', data.user.name, '(' + data.user.username + ')');

            // Show settings link for admins
            if (data.user.isAdmin) {
                document.getElementById('settingsLink').style.display = 'inline-block';
            }

            // Load saved email
            try {
                const emailResponse = await fetch('/api/get-email');
                const emailData = await emailResponse.json();
                if (emailData.email) {
                    emailInput.value = emailData.email;
                }
            } catch (e) {
                console.log('[INIT] Could not load email:', e);
            }

            // Always show loading state initially
            const quotesContainer = document.getElementById('quotesContainer');
            if (quotesContainer) {
                quotesContainer.innerHTML = '<div class="loading">Loading quotes...</div>';
            }

            // Initialize location and WhatsApp functionality
            initializeLocationAndWhatsApp();

            // Force immediate quote loading
            console.log('[INIT] Forcing immediate quote load...');
            setTimeout(() => {
                checkAuthAndLoadQuotes();
            }, 100);

        } else {
            console.log('[INIT] No user found, redirecting to login...');
            window.location.href = '/';
        }
    } catch (error) {
        console.error('[INIT] Critical error:', error);
        console.error('[INIT] Error stack:', error.stack);
        // Don't redirect on error, try to load quotes anyway
        setTimeout(() => {
            checkAuthAndLoadQuotes();
        }, 100);
    }
}

// Check auth and load quotes
async function checkAuthAndLoadQuotes() {
    try {
        console.log('[CHECK AUTH] Attempting to load quotes directly...');
        console.log('[CHECK AUTH] Dashboard element:', dashboardContent);
        console.log('[CHECK AUTH] Auth section element:', authSection);

        // ALWAYS try to load quotes first - don't check for token existence
        const response = await fetch('/api/quotes');

        console.log('[CHECK AUTH] Quotes response status:', response.status);

        if (response.ok) {
            const data = await response.json();
            console.log('[CHECK AUTH] Quotes loaded successfully!');
            console.log('[CHECK AUTH] Number of quotes:', data.quotes?.length);

            // Hide auth section and show dashboard
            authSection.style.display = 'none';
            dashboardContent.style.display = 'block';
            console.log('[CHECK AUTH] Dashboard visibility set to:', dashboardContent.style.display);

            displayQuotes(data.quotes);
            startAutoRefresh();
            return;
        } else {
            // Log the error response
            const errorText = await response.text();
            console.log('[CHECK AUTH] Quotes failed with error:', errorText);
        }

        // Only show auth section if quotes actually failed
        console.log('[CHECK AUTH] Quotes failed, showing auth section');
        authSection.style.display = 'block';
        dashboardContent.style.display = 'none';

    } catch (error) {
        console.error('[CHECK AUTH] Error:', error);
        console.error('[CHECK AUTH] Error stack:', error.stack);
        // Show auth section on error
        authSection.style.display = 'block';
        dashboardContent.style.display = 'none';
    }
}

// Display quotes
async function displayQuotes(quotesData) {
    quotes = quotesData;

    // Apply location filter
    const filteredQuotes = quotes.filter(matchesLocationFilter);

    totalQueriesSpan.textContent = filteredQuotes.length;
    lastUpdatedSpan.textContent = new Date().toLocaleTimeString();

    quotesContainer.innerHTML = filteredQuotes.map(quote => `
        <div class="quote-card" data-enquiry="${quote.enquiry_number}">
            <div class="quote-header">
                <div>
                    <h3>${quote.display_number}</h3>
                    <span class="gid">GID: ${quote.enquiry_number}</span>
                </div>
                
                <div class="header-right">
                    <span class="rank">Rank: ${quote.rank}</span>
                    <span class="quote-status status-${quote.status.toLowerCase()}">${quote.status}</span>
                    
                    ${quote?.extensions?.length > 0 ? `
                        <span class="bid-extension">Extensions #: ${quote.extensions.length}</span>
                    ` : ''}
                </div>
            </div>
            <div class="quote-details">
                <div class="detail-row">
                    <span class="detail-label">Route:</span>
                    <span>${quote.origin} → ${quote.destination}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Type:</span>
                    <span>${quote.transport_type}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Quantity:</span>
                    <span>${quote.cargo_quantity.join(', ')}</span>
                </div>
                ${quote.unit_details && quote.unit_details.charges && quote.unit_details.charges.length > 1 ? `
                    <div class="detail-row">
                        <span class="detail-label">Bidding Units:</span>
                        <div class="unit-details">
                            ${quote.unit_details.charges.map(charge =>
        `<div class="unit-item">• ${charge.units} × ${charge.unitName} (${charge.type})</div>`
    ).join('')}
                            <div class="unit-total">Total: ${quote.unit_details.totalUnits} units</div>
                        </div>
                    </div>
                ` : ''}
                <div class="detail-row">
                    <span class="detail-label">Company:</span>
                    <span>${quote.company_name}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Public Link:</span>
                    <span>
                        <a href="/enquiry/${quote.enquiry_number}" target="_blank">/enquiry/${quote.enquiry_number}</a>
                        <button class="btn btn-small" style="margin-left:8px;" onclick="openPublicEnquiry('${quote.enquiry_number}')">Open</button>
                    </span>
                </div>
                ${quote.closing_time ? `
                    <div class="detail-row">
                        <span class="detail-label">Closing Time:</span>
                        <span class="closing-time">${quote.closing_time}</span>
                    </div>
                ` : ''}
                ${quote.bidding_data && quote.bidding_data.bid_closing_in ? `
                    <div class="detail-row">
                        <span class="detail-label">Time Remaining:</span>
                        <span class="time-remaining">${formatTimeRemaining(quote.bidding_data.bid_closing_in)}</span>
                    </div>
                ` : ''}
            </div>
            <div class="bid-inputs">
                ${quote.unit_details && quote.unit_details.charges && quote.unit_details.charges.length > 1 ? `
                    <h4>Enter Bid Amounts:</h4>
                    <div class="multi-cargo-grid">
                        ${quote.unit_details.charges.map((charge, index) => {
        // Debug logging to understand the data structure
        console.log(`[DEBUG] Processing cargo ${index}:`, charge);
        console.log(`[DEBUG] Quote bid amounts:`, quote.bid_amounts);

        // Find matching cargo data - try multiple strategies
        let matchedCargo = null;
        if (quote.bid_amounts.cargo) {
            console.log(`[DEBUG] Looking for cargoIndex ${index} in:`, quote.bid_amounts.cargo);
            // Strategy 1: Try exact cargoIndex match
            matchedCargo = quote.bid_amounts.cargo.find(c => Number(c.cargoIndex) === index);

            // Strategy 2: If no exact match, try array index match
            if (!matchedCargo && quote.bid_amounts.cargo[index]) {
                console.log(`[DEBUG] No cargoIndex match found, using array index ${index}`);
                matchedCargo = quote.bid_amounts.cargo[index];
            }

            console.log(`[DEBUG] Final matched cargo:`, matchedCargo);
        }
        return `
                            <div class="cargo-card">
                                <div class="cargo-header">${charge.type} (${charge.units}×${charge.unitName.split(' ')[0]})</div>
                                <div class="cargo-inputs">
                                    <div class="input-group market-group">
                                        <label>Market</label>
                                        <input type="number" 
                                               class="cargo-input market-input" 
                                               data-cargo-index="${index}"
                                               data-enquiry="${quote.enquiry_number}"
                                               value="${matchedCargo?.marketValue || ''}"
                                               placeholder="0"
                                               onchange="calculateBidPrices(this, ${index})"
                                               ${quote.bidding_active ? 'readonly' : ''}>
                                    </div>
                                    <div class="bid-inputs-row">
                                        <div class="input-group">
                                            <label>High</label>
                                            <input type="number" 
                                                   class="cargo-input bid-input" 
                                                   data-type="high" 
                                                   data-cargo-index="${index}"
                                                   data-enquiry="${quote.enquiry_number}"
                                                   value="${localBidStorage.get(quote.enquiry_number)?.cargo?.[index]?.high || ''}"
                                                   placeholder="0">
                                        </div>
                                        <div class="input-group">
                                            <label>Medium</label>
                                            <input type="number" 
                                                   class="cargo-input bid-input" 
                                                   data-type="medium" 
                                                   data-cargo-index="${index}"
                                                   data-enquiry="${quote.enquiry_number}"
                                                   value="${localBidStorage.get(quote.enquiry_number)?.cargo?.[index]?.medium || ''}"
                                                   placeholder="0">
                                        </div>
                                        <div class="input-group">
                                            <label>Low</label>
                                            <input type="number" 
                                                   class="cargo-input bid-input" 
                                                   data-type="low" 
                                                   data-cargo-index="${index}"
                                                   data-enquiry="${quote.enquiry_number}"
                                                   value="${localBidStorage.get(quote.enquiry_number)?.cargo?.[index]?.low || ''}"
                                                   placeholder="0">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
    }).join('')}
                    </div>
                ` : `
                    <h4>Enter Bid Amounts:</h4>
                    <div class="single-market-row">
                        <label>Market Rate:</label>
                        <input type="number" 
                               class="single-market-input" 
                               data-enquiry="${quote.enquiry_number}"
                               value="${quote.bid_amounts.marketValue || ''}"
                               placeholder="0"
                               onchange="calculateBidPricesSingle(this)"
                               ${quote.bidding_active ? 'readonly' : ''}> ${quote.bid_amounts.marketValue ? '<br><span style="font-size: 12px;">Added by <b>' + quote.bid_amounts.marketValueUpdatedBy + '</b> at <b>' + quote.bid_amounts.marketValueUpdatedAt + '</b></span > ' : ''}
                    </div >
        <div class="bid-row">
            <div class="bid-input-group">
                <label>High</label>
                <div class="input-wrapper">
                    <span class="currency">₹</span>
                    <input type="number"
                        class="bid-input"
                        data-type="high"
                        data-enquiry="${quote.enquiry_number}"
                        value="${quote && quote.bid_amounts && quote.bid_amounts.high || ''}"
                        placeholder="0.00">
                </div>
            </div>
            <div class="bid-input-group">
                <label>Medium</label>
                <div class="input-wrapper">
                    <span class="currency">₹</span>
                    <input type="number"
                        class="bid-input"
                        data-type="medium"
                        data-enquiry="${quote.enquiry_number}"
                        value="${quote && quote.bid_amounts && quote.bid_amounts.medium || ''}"
                        placeholder="0.00">
                </div>
            </div>
            <div class="bid-input-group">
                <label>Low</label>
                <div class="input-wrapper">
                    <span class="currency">₹</span>
                    <input type="number"
                        class="bid-input"
                        data-type="low"
                        data-enquiry="${quote.enquiry_number}"
                        value="${quote && quote.bid_amounts && quote.bid_amounts.low || ''}"
                        placeholder="0.00">
                </div>
            </div>
        </div>
                `}
                <div class="bid-controls">
                    <button class="btn btn-primary btn-small" 
                            onclick="startSmartBidding('${quote.enquiry_number}', '${quote.closing_timestamp}')"
                            id="start-btn-${quote.enquiry_number}"
                            ${(() => {
            // Check if all required bid amounts are present
            if (quote.bid_amounts.cargo && Array.isArray(quote.bid_amounts.cargo)) {
                // Multi-cargo: check if all cargo types have all bid values
                return quote.bid_amounts.cargo.some(cargo => !cargo.high || !cargo.medium || !cargo.low) ? 'disabled' : '';
            } else {
                // Single cargo: check traditional bid amounts
                return (!quote.bid_amounts.low || !quote.bid_amounts.medium || !quote.bid_amounts.high) ? 'disabled' : '';
            }
        })()}>
                        Start Smart Bidding
                    </button>
                    <button class="btn btn-secondary btn-small" 
                            onclick="stopSmartBidding('${quote.enquiry_number}')"
                            id="stop-btn-${quote.enquiry_number}"
                            style="display: none;">
                        Stop Bidding
                    </button>
                </div>
                <div class="bid-status" id="status-${quote.enquiry_number}"></div>
                <div class="countdown" id="countdown-${quote.enquiry_number}"></div>
                <div class="bidding-monitor" id="monitor-${quote.enquiry_number}"></div>
            </div>
        </div>
    `).join('');

    // Attach event listeners to bid inputs (including cargo inputs)
    document.querySelectorAll('.bid-input, .cargo-input').forEach(input => {
        // Use 'input' event for real-time updates and 'blur' for final save
        input.addEventListener('input', debounce(handleBidChange, 500));
        input.addEventListener('blur', handleBidChange);

        // Prevent value from being cleared on focus
        input.addEventListener('focus', (e) => {
            e.target.dataset.previousValue = e.target.value;
        });
    });

    // Check existing bids and restore bidding monitors
    console.log('[DASHBOARD] Checking bidding status for all quotes...');
    for (const quote of quotes) {
        // Always check bidding status, not just when bids are filled
        try {
            console.log(`[DASHBOARD] Checking status for ${quote.enquiry_number}`);
            const response = await fetch(`/api/bidding-status/${quote.enquiry_number}`);
            const data = await response.json();

            console.log(`[DASHBOARD] Status for ${quote.enquiry_number}:`, data);

            if (data.active) {
                console.log(`[DASHBOARD] Restoring active bidding for ${quote.enquiry_number}`);
                // Restore UI state for active bidding
                updateBiddingUI(quote.enquiry_number, data, true);
                startBiddingMonitor(quote.enquiry_number);
            }
        } catch (error) {
            console.error(`Error checking bidding status for ${quote.enquiry_number}:`, error);
        }
    }
}

// Handle bid input changes
async function handleBidChange(e) {
    const enquiryNumber = e.target.dataset.enquiry;
    const bidType = e.target.dataset.type;
    const value = e.target.value;

    // Store value locally immediately
    if (!localBidStorage.has(enquiryNumber)) {
        localBidStorage.set(enquiryNumber, {});
    }
    localBidStorage.get(enquiryNumber)[bidType] = value;

    // Get all bid values for this enquiry
    const lowInput = document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="low"]`);
    const mediumInput = document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="medium"]`);
    const highInput = document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="high"]`);

    // Use stored values if inputs are empty (prevents data loss)
    const storedValues = localBidStorage.get(enquiryNumber) || {};
    const bids = {
        low: lowInput.value || storedValues.low || '',
        medium: mediumInput.value || storedValues.medium || '',
        high: highInput.value || storedValues.high || ''
    };

    try {
        const response = await fetch('/api/save-bids', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enquiryNumber, bids })
        });

        if (response.ok) {
            const statusDiv = document.getElementById(`status-${enquiryNumber}`);
            statusDiv.textContent = 'Bids saved!';
            statusDiv.className = 'bid-status success';

            // Check if all bids are filled
            if (bids.low && bids.medium && bids.high) {
                statusDiv.textContent = 'All bids filled! Ready for smart bidding.';
                document.getElementById(`start-btn-${enquiryNumber}`).disabled = false;
            } else {
                document.getElementById(`start-btn-${enquiryNumber}`).disabled = true;
                stopSmartBidding(enquiryNumber);
            }

            setTimeout(() => {
                statusDiv.textContent = '';
            }, 3000);
        }
    } catch (error) {
        console.error('Error saving bids:', error);
    }
}

// Start smart bidding
async function startSmartBidding(enquiryNumber, closingTimestamp) {
    const quote = quotes.find(q => q.enquiry_number === enquiryNumber);
    if (!quote) return;

    let bids;

    // Check if this is a multi-cargo enquiry
    if (quote.unit_details && quote.unit_details.charges && quote.unit_details.charges.length > 1) {
        // Multiple cargo types - collect bids for each cargo type
        bids = { cargo: [] };

        for (let index = 0; index < quote.unit_details.charges.length; index++) {
            const lowInput = document.querySelector(`input.cargo-input[data-enquiry="${enquiryNumber}"][data-cargo-index="${index}"][data-type="low"]`);
            const mediumInput = document.querySelector(`input.cargo-input[data-enquiry="${enquiryNumber}"][data-cargo-index="${index}"][data-type="medium"]`);
            const highInput = document.querySelector(`input.cargo-input[data-enquiry="${enquiryNumber}"][data-cargo-index="${index}"][data-type="high"]`);

            if (!lowInput?.value || !mediumInput?.value || !highInput?.value) {
                alert(`Please fill all bid values for ${quote.unit_details.charges[index].type}`);
                return;
            }

            bids.cargo.push({
                low: lowInput.value,
                medium: mediumInput.value,
                high: highInput.value,
                cargoType: quote.unit_details.charges[index].type,
                units: quote.unit_details.charges[index].units
            });
        }
    } else {
        // Single cargo type - use original logic
        bids = {
            low: document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="low"]`).value,
            medium: document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="medium"]`).value,
            high: document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="high"]`).value
        };

        if (!bids.low || !bids.medium || !bids.high) {
            alert('Please fill all three bid values before starting smart bidding.');
            return;
        }
    }

    try {
        const response = await fetch('/api/start-bidding', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                enquiryKey: enquiryNumber,
                enquiryNumber: quote.display_number,
                closingTimestamp,
                bids
            })
        });

        if (response.ok) {
            const responseData = await response.json();
            console.log('[START BIDDING] Response:', responseData);

            // Update UI to show active state
            updateBiddingUI(enquiryNumber, {
                startedBy: 'You',
                userFullName: 'You'
            }, true);

            // Start monitoring
            startBiddingMonitor(enquiryNumber);

            // Force immediate global status update
            if (globalStatusPollInterval) {
                clearInterval(globalStatusPollInterval);
                startGlobalStatusPolling();
            }
        } else {
            const data = await response.json();
            alert(`Failed to start smart bidding: ${data.error}`);
        }
    } catch (error) {
        console.error('Error starting smart bidding:', error);
        alert('Error starting smart bidding. Please try again.');
    }
}

// Stop smart bidding
async function stopSmartBidding(enquiryNumber) {
    try {
        await fetch('/api/stop-bidding', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enquiryKey: enquiryNumber })
        });

        // Update UI to show inactive state
        updateBiddingUI(enquiryNumber, {}, false);
        document.getElementById(`monitor-${enquiryNumber}`).innerHTML = '';

        // Stop monitoring
        if (activeBidMonitors.has(enquiryNumber)) {
            clearInterval(activeBidMonitors.get(enquiryNumber));
            activeBidMonitors.delete(enquiryNumber);
        }

        // Force immediate global status update
        if (globalStatusPollInterval) {
            clearInterval(globalStatusPollInterval);
            startGlobalStatusPolling();
        }
    } catch (error) {
        console.error('Error stopping smart bidding:', error);
    }
}

// Start bidding monitor
function startBiddingMonitor(enquiryNumber) {
    // Clear existing monitor if any
    if (activeBidMonitors.has(enquiryNumber)) {
        clearInterval(activeBidMonitors.get(enquiryNumber));
    }

    const updateStatus = async () => {
        try {
            const response = await fetch(`/api/bidding-status/${enquiryNumber}`);
            const data = await response.json();

            if (data.active) {
                const monitorDiv = document.getElementById(`monitor-${enquiryNumber}`);
                const statusClass = data.status === 'active_bidding' ? 'active' :
                    data.status === 'closed' ? 'closed' : 'monitoring';

                if(monitorDiv == null) return;
                monitorDiv.innerHTML = `
                    <div class="monitor-status ${statusClass}">
                        <div>Status: <strong>${data.status}</strong></div>
                        <div>Current Rank: <strong>${data.currentRank || 'N/A'}</strong></div>
                        <div>Bids Submitted: <strong>${data.bidsSubmitted}/3</strong></div>
                        ${data.timeRemaining ? `<div>Time Remaining: <strong>${formatTimeRemaining(data.timeRemaining)}</strong></div>` : ''}
                    </div>
                `;

                // If bidding is closed, stop monitoring
                if (data.status === 'closed' || data.status === 'timeout') {
                    setTimeout(() => stopSmartBidding(enquiryNumber), 5000);
                }
            } else {
                // Bidding monitor no longer active
                stopSmartBidding(enquiryNumber);
            }
        } catch (error) {
            console.error('Error updating bidding status:', error);
        }
    };

    // Update immediately and then every second
    updateStatus();
    const interval = setInterval(updateStatus, 1000);
    activeBidMonitors.set(enquiryNumber, interval);
}

// Auto refresh quotes every 30 seconds
function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        checkAuthAndLoadQuotes();
    }, 30000);
}

// Event listeners
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
});

document.getElementById('refreshBtn').addEventListener('click', () => {
    checkAuthAndLoadQuotes();
});

// OTP Session storage
let currentOtpSessionId = null;

document.getElementById('authenticateBtn').addEventListener('click', async () => {
    const email = emailInput.value.trim();

    if (!email) {
        alert('Please enter your GoComet email');
        return;
    }

    // Check if we already have a token
    const tokenCheckResponse = await fetch('/api/check-global-token');
    const tokenData = await tokenCheckResponse.json();

    if (tokenData.hasGlobalToken) {
        console.log('[AUTH] Token already exists, checking if it works...');

        // Try to load quotes directly
        const quotesResponse = await fetch('/api/quotes');
        if (quotesResponse.ok) {
            console.log('[AUTH] Existing token works, redirecting to dashboard...');
            checkAuthAndLoadQuotes();
            return;
        }

        console.log('[AUTH] Existing token failed, proceeding with re-authentication...');
    }

    // Save email first
    await fetch('/api/set-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
    });

    try {
        const btn = document.getElementById('authenticateBtn');
        btn.disabled = true;
        btn.textContent = 'Sending OTP...';

        const response = await fetch('/api/authenticate-chrome', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        if (response.ok) {
            const data = await response.json();
            currentOtpSessionId = data.otpSessionId;

            // Hide email section and show OTP section
            document.getElementById('emailSection').style.display = 'none';
            document.getElementById('otpSection').style.display = 'flex';
            document.getElementById('authNote').textContent = 'Chrome is running in the background. Please check your email for the OTP.';

            // Focus on OTP input
            document.getElementById('otpInput').focus();

        } else {
            alert('Failed to send OTP. Please try again.');
            btn.disabled = false;
            btn.textContent = 'Authenticate with Chrome';
        }
    } catch (error) {
        console.error('Error during authentication:', error);
        alert('Authentication error. Please try again.');
        const btn = document.getElementById('authenticateBtn');
        btn.disabled = false;
        btn.textContent = 'Authenticate with Chrome';
    }
});

// Submit OTP button
document.getElementById('submitOtpBtn').addEventListener('click', async () => {
    const otp = document.getElementById('otpInput').value.trim();

    if (!otp) {
        alert('Please enter the OTP');
        return;
    }

    if (!currentOtpSessionId) {
        alert('Session expired. Please try again.');
        resetAuthForm();
        return;
    }

    const btn = document.getElementById('submitOtpBtn');
    btn.disabled = true;
    btn.textContent = 'Verifying OTP...';

    try {
        const otpResponse = await fetch('/api/submit-otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ otpSessionId: currentOtpSessionId, otp })
        });

        if (otpResponse.ok) {
            btn.textContent = 'Authentication successful!';
            document.getElementById('authNote').textContent = 'Authentication successful! Loading quotes...';
            setTimeout(() => {
                checkAuthAndLoadQuotes();
            }, 1000);
        } else {
            alert('OTP verification failed. Please try again.');
            btn.disabled = false;
            btn.textContent = 'Verify OTP';
            document.getElementById('otpInput').value = '';
            document.getElementById('otpInput').focus();
        }
    } catch (error) {
        console.error('Error verifying OTP:', error);
        alert('Error verifying OTP. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Verify OTP';
    }
});

// Cancel OTP button
document.getElementById('cancelOtpBtn').addEventListener('click', () => {
    resetAuthForm();
});

// Reset auth form
function resetAuthForm() {
    currentOtpSessionId = null;
    document.getElementById('emailSection').style.display = 'flex';
    document.getElementById('otpSection').style.display = 'none';
    document.getElementById('authenticateBtn').disabled = false;
    document.getElementById('authenticateBtn').textContent = 'Authenticate with Chrome';
    document.getElementById('otpInput').value = '';
    document.getElementById('authNote').textContent = 'Chrome will run in the background. An OTP will be sent to your email.';
}

// Allow Enter key to submit OTP
document.getElementById('otpInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('submitOtpBtn').click();
    }
});

// Tab switching
document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;

        console.log('[TAB] Switching to:', tabName);

        // Update active tab
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update active content
        document.querySelectorAll('.auth-content').forEach(content => {
            content.classList.remove('active');
        });

        const targetContent = document.getElementById(tabName + 'Auth');
        if (targetContent) {
            targetContent.classList.add('active');
        } else {
            console.error('[TAB] Content not found for:', tabName + 'Auth');
        }
    });
});

// Direct token save
document.getElementById('saveTokenBtn').addEventListener('click', async () => {
    const token = tokenInput.value.trim();

    if (!token) {
        alert('Please enter a valid authorization token');
        return;
    }

    try {
        const btn = document.getElementById('saveTokenBtn');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        console.log('[TOKEN SAVE] Saving token...');

        const response = await fetch('/api/set-auth-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ authToken: token })
        });

        if (response.ok) {
            console.log('[TOKEN SAVE] Token saved successfully');
            btn.textContent = 'Token saved! Loading...';

            // Small delay to ensure token is saved
            setTimeout(() => {
                checkAuthAndLoadQuotes();
            }, 500);
        } else {
            const errorData = await response.json();
            console.error('[TOKEN SAVE] Failed:', errorData);
            alert('Failed to save token: ' + (errorData.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('[TOKEN SAVE] Error:', error);
        alert('Error saving token. Please try again.');
    } finally {
        const btn = document.getElementById('saveTokenBtn');
        btn.disabled = false;
        btn.textContent = 'Save Token';
    }
});

// Update bidding UI based on status
function updateBiddingUI(enquiryNumber, status, isActive) {
    const startBtn = document.getElementById(`start-btn-${enquiryNumber}`);
    const stopBtn = document.getElementById(`stop-btn-${enquiryNumber}`);
    const inputs = document.querySelectorAll(`input[data-enquiry="${enquiryNumber}"]`);
    const statusDiv = document.getElementById(`status-${enquiryNumber}`);

    if (!startBtn || !stopBtn) return; // Elements might not exist yet

    if (isActive) {
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        inputs.forEach(input => {
            input.disabled = true;
        });

        // Check if current user is admin
        const currentUser = document.getElementById('username-display').textContent;
        const isAdmin = document.getElementById('settingsLink').style.display !== 'none';

        // Disable stop button for public submissions if user is not admin
        if (status.isPublicSubmission && !isAdmin) {
            stopBtn.disabled = true;
            stopBtn.title = 'Only admins can stop public submissions';
        } else {
            stopBtn.disabled = false;
            stopBtn.title = '';
        }

        // Show who started the bidding
        if (status.userFullName || status.startedBy) {
            const displayName = status.userFullName || status.startedBy;
            let statusText = `Smart bidding active (started by ${displayName})`;
            if (status.isPublicSubmission) {
                statusText += ' - Public Submission';
            }
            statusDiv.textContent = statusText;
            statusDiv.className = 'bid-status active';
        } else {
            statusDiv.textContent = 'Smart bidding activated!';
            statusDiv.className = 'bid-status success';
        }

        // Update bid values if available
        console.log('[BID UPDATE] Status:', status);
        if (status.bids) {
            console.log('[BID UPDATE] Updating bids for enquiry:', enquiryNumber);
            const highInput = document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="high"]`);
            const mediumInput = document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="medium"]`);
            const lowInput = document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="low"]`);

            if (highInput) highInput.value = Math.round(status.bids.high) || '';
            if (mediumInput) mediumInput.value = Math.round(status.bids.medium) || '';
            if (lowInput) lowInput.value = Math.round(status.bids.low) || '';
        }
    } else {
        startBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
        stopBtn.disabled = false;
        stopBtn.title = '';
        inputs.forEach(input => {
            input.disabled = false;
        });
        statusDiv.textContent = 'Smart bidding stopped.';
        statusDiv.className = 'bid-status';

        setTimeout(() => {
            statusDiv.textContent = '';
        }, 3000);
    }
}

// Start polling for global status updates
function startGlobalStatusPolling() {
    if (globalStatusPollInterval) {
        clearInterval(globalStatusPollInterval);
    }

    // Poll every 10 seconds for status updates (reduced from 2 seconds)
    globalStatusPollInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/bidding-status/all');
            const data = await response.json();

            console.log('[GLOBAL POLL] Received statuses:', data.statuses);

            if (data.statuses) {
                // Check each quote for status updates
                for (const [enquiryKey, status] of Object.entries(data.statuses)) {
                    const isLocallyActive = activeBidMonitors.has(enquiryKey);
                    const stopBtn = document.getElementById(`stop-btn-${enquiryKey}`);

                    // If bidding is active but we don't have a local monitor
                    if (status.active && !isLocallyActive && stopBtn) {
                        console.log(`[GLOBAL POLL] Activating UI for ${enquiryKey} (started by ${status.userFullName || status.startedBy})`);
                        updateBiddingUI(enquiryKey, status, true);

                        // Show monitor info without starting local monitor
                        const monitorDiv = document.getElementById(`monitor-${enquiryKey}`);
                        if (monitorDiv) {
                            let extraInfo = '';
                            if (status.bids) {
                                extraInfo += `
                                    <div style="margin-top: 8px; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 12px;">
                                        <div>High: ₹${Math.round(status.bids.high).toLocaleString()}</div>
                                        <div>Medium: ₹${Math.round(status.bids.medium).toLocaleString()}</div>
                                        <div>Low: ₹${Math.round(status.bids.low).toLocaleString()}</div>
                                        ${status.marketValue ? `<div style="margin-top: 4px; color: #666;">Market: ₹${Math.round(status.marketValue).toLocaleString()}</div>` : ''}
                                    </div>
                                `;
                            }
                            if (status.isPublicSubmission) {
                                extraInfo += `<div style="margin-top: 4px; color: #ff9800; font-size: 12px;">⚠️ Public Submission</div>`;
                            }

                            // Clean bid display - no yellow status box, no colors
                            let bidDisplay = '';

                            if (status.bids) {
                                if (status.bids.cargo && Array.isArray(status.bids.cargo)) {
                                    // Multi-cargo display
                                    bidDisplay = `
                                        <div style="margin-top: 16px; padding: 16px; background: white; border-radius: 8px; border: 1px solid #e9ecef;">
                                            <div style="font-weight: 600; margin-bottom: 12px; color: #495057;">📊 Calculated Bid Prices:</div>
                                            <div style="display: grid; gap: 12px;">
                                    `;

                                    status.bids.cargo.forEach((cargo, index) => {
                                        bidDisplay += `
                                            <div style="padding: 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef;">
                                                <div style="font-weight: 600; color: #495057; margin-bottom: 8px;">Cargo Type ${index + 1}</div>
                                                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                                                    <div style="text-align: center; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e9ecef;">
                                                        <div style="font-weight: 600; color: #495057;">High</div>
                                                        <div style="font-size: 16px; font-weight: 600;">₹${cargo.high.toLocaleString()}</div>
                                                    </div>
                                                    <div style="text-align: center; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e9ecef;">
                                                        <div style="font-weight: 600; color: #495057;">Medium</div>
                                                        <div style="font-size: 16px; font-weight: 600;">₹${cargo.medium.toLocaleString()}</div>
                                                    </div>
                                                    <div style="text-align: center; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e9ecef;">
                                                        <div style="font-weight: 600; color: #495057;">Low</div>
                                                        <div style="font-size: 16px; font-weight: 600;">₹${cargo.low.toLocaleString()}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        `;
                                    });

                                    bidDisplay += `
                                            </div>
                                        </div>
                                    `;
                                } else if (status.bids.high && status.bids.medium && status.bids.low) {
                                    // Single cargo display
                                    bidDisplay = `
                                        <div style="margin-top: 16px; padding: 16px; background: white; border-radius: 8px; border: 1px solid #e9ecef;">
                                            <div style="font-weight: 600; margin-bottom: 12px; color: #495057;">📊 Calculated Bid Prices:</div>
                                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                                                <div style="text-align: center; padding: 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef;">
                                                    <div style="font-weight: 600; color: #495057; margin-bottom: 4px;">High</div>
                                                    <div style="font-size: 18px; font-weight: 600;">₹${status.bids.high.toLocaleString()}</div>
                                                </div>
                                                <div style="text-align: center; padding: 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef;">
                                                    <div style="font-weight: 600; color: #495057; margin-bottom: 4px;">Medium</div>
                                                    <div style="font-size: 18px; font-weight: 600;">₹${status.bids.medium.toLocaleString()}</div>
                                                </div>
                                                <div style="text-align: center; padding: 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef;">
                                                    <div style="font-weight: 600; color: #495057; margin-bottom: 4px;">Low</div>
                                                    <div style="font-size: 18px; font-weight: 600;">₹${status.bids.low.toLocaleString()}</div>
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }
                            }

                            // Only show the clean bid display - no yellow status box
                            monitorDiv.innerHTML = bidDisplay;
                        }
                    }
                    // If bidding stopped elsewhere
                    else if (!status.active && stopBtn && stopBtn.style.display === 'inline-block' && !isLocallyActive) {
                        console.log(`[GLOBAL POLL] Deactivating UI for ${enquiryKey}`);
                        updateBiddingUI(enquiryKey, status, false);
                        const monitorDiv = document.getElementById(`monitor-${enquiryKey}`);
                        if (monitorDiv) {
                            monitorDiv.innerHTML = '';
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error polling global status:', error);
        }
    }, 10000); // Changed from 2000ms to 10000ms (10 seconds)
}

// Clean up on window close
window.addEventListener('beforeunload', () => {
    if (globalStatusPollInterval) {
        clearInterval(globalStatusPollInterval);
    }
});

// Debug function to check system state
window.debugBiddingStatus = async function () {
    try {
        const response = await fetch('/api/debug/status');
        const data = await response.json();
        console.log('=== BIDDING SYSTEM STATUS ===');
        console.log('Active Monitors:', data.activeBidMonitors);
        console.log('Global Status:', data.globalBidStatus);
        console.log('Current User:', data.currentUser);
        console.log('Local Active Monitors:', Array.from(activeBidMonitors.keys()));
        console.log('===========================');
        return data;
    } catch (error) {
        console.error('Error fetching debug status:', error);
    }
};

// Open public enquiry page (admin convenience)
window.openPublicEnquiry = function (enquiryNumber) {
    const url = `/enquiry/${encodeURIComponent(enquiryNumber)}`;
    window.open(url, '_blank', 'noopener');
};

// Location management
let locations = [];
let selectedLocationFilter = '';
let whatsappEnabled = false;

// Load locations from server
async function loadLocations() {
    try {
        const response = await fetch('/api/locations');
        if (response.ok) {
            const data = await response.json();
            locations = data.locations || [];
            populateLocationFilter();
        }
    } catch (error) {
        console.error('Error loading locations:', error);
    }
}

// Populate location filter dropdown
function populateLocationFilter() {
    const locationSelect = document.getElementById('locationFilter');
    if (!locationSelect) return;

    // Clear existing options except "All Locations"
    locationSelect.innerHTML = '<option value="">All Locations</option>';

    // Add location options
    locations.forEach(location => {
        const option = document.createElement('option');
        option.value = location.id;
        option.textContent = location.plantName;
        locationSelect.appendChild(option);
    });
}

// Apply location filter
function applyLocationFilter() {
    selectedLocationFilter = document.getElementById('locationFilter').value;
    console.log('[LOCATION FILTER] Applied filter:', selectedLocationFilter);

    // Re-render quotes with filter
    displayQuotes(quotes);
}

// Check if quote matches location filter
function matchesLocationFilter(quote) {
    if (!selectedLocationFilter) return true;

    const location = locations.find(loc => loc.id === selectedLocationFilter);
    if (!location) return true;

    // Check if the quote's origin/loading location matches the selected location
    const origin = quote.origin?.toLowerCase() || '';
    const plantName = location.plantName?.toLowerCase() || '';
    const sourceLocation = location.sourceLocation?.toLowerCase() || '';

    return origin.includes(plantName.toLowerCase()) ||
        origin.includes(sourceLocation.toLowerCase()) ||
        plantName.includes(origin);
}

// WhatsApp management
function toggleWhatsApp() {
    const checkbox = document.getElementById('enableWhatsAppForNewBids');
    const statusEl = document.getElementById('whatsappStatus');

    whatsappEnabled = checkbox.checked;

    if (whatsappEnabled) {
        statusEl.textContent = 'Enabled';
        statusEl.className = 'whatsapp-status enabled';
    } else {
        statusEl.textContent = 'Disabled';
        statusEl.className = 'whatsapp-status disabled';
    }

    console.log('[WHATSAPP] Status changed to:', whatsappEnabled ? 'Enabled' : 'Disabled');
}

// Load WhatsApp configuration
async function loadWhatsAppConfig() {
    try {
        const response = await fetch('/api/whatsapp-config');
        if (response.ok) {
            const data = await response.json();
            const checkbox = document.getElementById('enableWhatsAppForNewBids');
            const statusEl = document.getElementById('whatsappStatus');

            whatsappEnabled = data.enableWhatsApp || false;
            checkbox.checked = whatsappEnabled;

            if (whatsappEnabled) {
                statusEl.textContent = 'Enabled';
                statusEl.className = 'whatsapp-status enabled';
            } else {
                statusEl.textContent = 'Disabled';
                statusEl.className = 'whatsapp-status disabled';
            }
        }
    } catch (error) {
        console.error('Error loading WhatsApp config:', error);
    }
}

// Initialize location and WhatsApp functionality
function initializeLocationAndWhatsApp() {
    // Set up event listeners
    const applyFilterBtn = document.getElementById('applyLocationFilter');
    const whatsappCheckbox = document.getElementById('enableWhatsAppForNewBids');

    if (applyFilterBtn) {
        applyFilterBtn.addEventListener('click', applyLocationFilter);
    }

    if (whatsappCheckbox) {
        whatsappCheckbox.addEventListener('change', toggleWhatsApp);
    }

    // Load initial data
    loadLocations();
    loadWhatsAppConfig();
}

// Initialize immediately when script loads
console.log('[STARTUP] Initializing dashboard...');
init();

// Also ensure it runs when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[DOM] DOM loaded, checking if init needed...');
    });
} else {
    console.log('[STARTUP] DOM already loaded');
}

// Market rate auto-calculation functions
async function calculateBidPrices(marketRateInput, cargoIndex) {
    const marketRate = parseFloat(marketRateInput.value);
    const enquiryNumber = marketRateInput.dataset.enquiry;

    if (!marketRate || marketRate <= 0) {
        console.log('[CALC] Invalid market rate, clearing bid prices');
        clearBidPrices(enquiryNumber, cargoIndex);
        return;
    }

    // FIX: Validate that we're not using an already calculated price as market rate
    // If market rate seems too high (likely already calculated), warn user
    if (marketRate > 100000) {
        console.warn(`[CALC] Warning: Market rate ₹${marketRate} seems high - ensure this is the base rate, not a calculated price`);
    }

    try {
        // Fetch pricing percentages
        const response = await fetch('/api/public/percentages');
        const data = await response.json();
        const percentages = data.pricePercents || { high: 9, medium: 7, low: 5 };

        // Calculate bid prices
        const highPrice = Math.round(marketRate * (1 + percentages.high / 100));
        const mediumPrice = Math.round(marketRate * (1 + percentages.medium / 100));
        const lowPrice = Math.round(marketRate * (1 + percentages.low / 100));

        console.log(`[CALC] Cargo ${cargoIndex}: Market ₹${marketRate} -> High ₹${highPrice}, Medium ₹${mediumPrice}, Low ₹${lowPrice}`);

        // Update the corresponding bid input fields
        const highInput = document.querySelector(`input.cargo-input[data-cargo-index="${cargoIndex}"][data-type="high"]`);
        const mediumInput = document.querySelector(`input.cargo-input[data-cargo-index="${cargoIndex}"][data-type="medium"]`);
        const lowInput = document.querySelector(`input.cargo-input[data-cargo-index="${cargoIndex}"][data-type="low"]`);

        if (highInput) highInput.value = highPrice;
        if (mediumInput) mediumInput.value = mediumPrice;
        if (lowInput) lowInput.value = lowPrice;

        // Trigger change events to update validation
        [highInput, mediumInput, lowInput].forEach(input => {
            if (input) input.dispatchEvent(new Event('input'));
        });

        // Save market rate to server for persistence
        await saveMarketRate(enquiryNumber, cargoIndex, marketRate);

    } catch (error) {
        console.error('[CALC] Error calculating bid prices:', error);
    }
}

async function calculateBidPricesSingle(marketRateInput) {
    const marketRate = parseFloat(marketRateInput.value);
    const enquiryNumber = marketRateInput.dataset.enquiry;

    if (!marketRate || marketRate <= 0) {
        console.log('[CALC] Invalid market rate, clearing bid prices');
        clearBidPricesSingle(enquiryNumber);
        return;
    }

    // FIX: Validate that we're not using an already calculated price as market rate
    // If market rate seems too high (likely already calculated), warn user
    if (marketRate > 100000) {
        console.warn(`[CALC] Warning: Market rate ₹${marketRate} seems high - ensure this is the base rate, not a calculated price`);
    }

    try {
        // Fetch pricing percentages
        const response = await fetch('/api/public/percentages');
        const data = await response.json();
        const percentages = data.pricePercents || { high: 9, medium: 7, low: 5 };

        // Calculate bid prices
        const highPrice = Math.round(marketRate * (1 + percentages.high / 100));
        const mediumPrice = Math.round(marketRate * (1 + percentages.medium / 100));
        const lowPrice = Math.round(marketRate * (1 + percentages.low / 100));

        console.log(`[CALC] Single cargo: Market ₹${marketRate} -> High ₹${highPrice}, Medium ₹${mediumPrice}, Low ₹${lowPrice}`);

        // Update the corresponding bid input fields
        const highInput = document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="high"]`);
        const mediumInput = document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="medium"]`);
        const lowInput = document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="low"]`);

        if (highInput) highInput.value = highPrice;
        if (mediumInput) mediumInput.value = mediumPrice;
        if (lowInput) lowInput.value = lowPrice;

        // Trigger change events to update validation
        [highInput, mediumInput, lowInput].forEach(input => {
            if (input) input.dispatchEvent(new Event('input'));
        });

        // Save market rate to server for persistence
        await saveMarketRate(enquiryNumber, null, marketRate);

    } catch (error) {
        console.error('[CALC] Error calculating bid prices:', error);
    }
}

function clearBidPrices(enquiryNumber, cargoIndex) {
    const highInput = document.querySelector(`input.cargo-input[data-cargo-index="${cargoIndex}"][data-type="high"]`);
    const mediumInput = document.querySelector(`input.cargo-input[data-cargo-index="${cargoIndex}"][data-type="medium"]`);
    const lowInput = document.querySelector(`input.cargo-input[data-cargo-index="${cargoIndex}"][data-type="low"]`);

    [highInput, mediumInput, lowInput].forEach(input => {
        if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input'));
        }
    });
}

function clearBidPricesSingle(enquiryNumber) {
    const highInput = document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="high"]`);
    const mediumInput = document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="medium"]`);
    const lowInput = document.querySelector(`input[data-enquiry="${enquiryNumber}"][data-type="low"]`);

    [highInput, mediumInput, lowInput].forEach(input => {
        if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input'));
        }
    });
}

// Save market rate to server for persistence
async function saveMarketRate(enquiryNumber, cargoIndex, marketRate) {
    try {
        const response = await fetch('/api/save-market-rate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                enquiryKey: enquiryNumber,
                cargoIndex: cargoIndex,
                marketRate: marketRate
            })
        });

        if (!response.ok) {
            console.error('[SAVE MARKET RATE] Failed to save market rate:', response.statusText);
        } else {
            console.log(`[SAVE MARKET RATE] Saved market rate ₹${marketRate} for ${enquiryNumber}${cargoIndex !== null ? ` cargo ${cargoIndex}` : ''}`);
        }
    } catch (error) {
        console.error('[SAVE MARKET RATE] Error saving market rate:', error);
    }
}

// Start global status polling after a delay
setTimeout(() => {
    console.log('[INIT] Starting global status polling...');
    startGlobalStatusPolling();
}, 2000);
// History Modal Functions
window.showHistoryModal = function (enquiryNumber) {
    const modal = document.getElementById('historyModal');
    const historyList = document.getElementById('historyList');
    if (!modal || !historyList) return;

    // Clear previous history
    historyList.innerHTML = '<div class="loading">Loading history...</div>';

    // Show modal
    modal.style.display = 'block';
    // Add active class for animation/styling if needed
    setTimeout(() => modal.classList.add('active'), 10);

    // Fetch history
    fetch(`/api/bid-history/${enquiryNumber}`)
        .then(response => response.json())
        .then(data => {
            if (data && data.length > 0) {
                historyList.innerHTML = data.map(item => `
                    <div class="history-item">
                        <div class="history-header">
                            <span class="history-time">${new Date(item.timestamp).toLocaleString()}</span>
                            <span class="extension-count">Ext: ${item.extension_count || 0}</span>
                        </div>
                        <div class="history-details">
                            ${item.details || 'Bid extended due to new offer'}
                        </div>
                    </div>
                `).join('');
            } else {
                historyList.innerHTML = '<div class="no-data">No history available</div>';
            }
        })
        .catch(error => {
            console.error('Error fetching history:', error);
            historyList.innerHTML = '<div class="error">Failed to load history</div>';
        });
};

window.closeHistoryModal = function () {
    const modal = document.getElementById('historyModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300); // Wait for animation
    }
};

// Close modal when clicking outside
window.onclick = function (event) {
    const modal = document.getElementById('historyModal');
    if (event.target == modal) {
        closeHistoryModal();
    }
};
