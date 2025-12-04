(function () {

    // Initialize page
    function init() {
        // Set today's date as default
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('dateFilter').value = today;

        // Add event listener for date changes
        document.getElementById('dateFilter').addEventListener('change', function () {
            updateActiveQuickButton(null); // Clear quick button selection
            updatePageTitle();
            loadClosedBids();
        });

        // Add event listeners for date range inputs
        document.getElementById('fromDate').addEventListener('change', function () {
            updatePageTitle();
            loadClosedBids();
        });

        document.getElementById('toDate').addEventListener('change', function () {
            updatePageTitle();
            loadClosedBids();
        });

        // Update page title for today
        updatePageTitle();

        // Load closed bids for today
        loadClosedBids();
    }

    // Get selected date in YYYY-MM-DD format
    function getSelectedDate() {
        const date = document.getElementById('dateFilter').value;
        return date || new Date().toISOString().split('T')[0];
    }

    // Set quick date and update UI
    function setQuickDate(type) {
        const today = new Date();
        const dateFilter = document.getElementById('dateFilter');

        let targetDate;
        switch (type) {
            case 'today':
                targetDate = today;
                break;
            case 'yesterday':
                targetDate = new Date(today);
                targetDate.setDate(today.getDate() - 1);
                break;
            default:
                targetDate = today;
        }

        dateFilter.value = targetDate.toISOString().split('T')[0];
        updateActiveQuickButton(type);
        updatePageTitle();
        loadClosedBids();
    }

    // Update active quick date button
    function updateActiveQuickButton(activeType) {
        document.querySelectorAll('.quick-date-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        if (activeType) {
            const activeBtn = document.querySelector(`[onclick="setQuickDate('${activeType}')"]`);
            if (activeBtn) activeBtn.classList.add('active');
        }
    }

    // Fetch closed bids for a single date
    async function fetchClosedBidsForDate(formattedFromDate, formattedToDate) {
        // Build the exact URL from temp.txt working example, just change the bid_close_time dates
        const urlParams = `page=1&size=15&reset_filter=false&filter%5Bcreated_at%5D%5Bstart_date%5D=&filter%5Bcreated_at%5D%5Bend_date%5D=&filter%5Bconfirmed_at%5D%5Bstart_date%5D=&filter%5Bconfirmed_at%5D%5Bend_date%5D=&filter%5Bquote_valid_from%5D%5Bstart_date%5D=&filter%5Bquote_valid_from%5D%5Bend_date%5D=&filter%5Bmin_quote_valid_till%5D%5Bstart_date%5D=&filter%5Bmin_quote_valid_till%5D%5Bend_date%5D=&filter%5Bbid_close_time%5D%5Bstart_date%5D=${encodeURIComponent(formattedFromDate)}&filter%5Bbid_close_time%5D%5Bend_date%5D=${encodeURIComponent(formattedToDate)}&filter%5Btag%5D=all&filter%5Bcompany_ids%5D%5B%5D=&filter%5Bcurrent_approver_ids%5D%5B%5D=&filter%5Buser_ids%5D%5B%5D=&filter%5Bcargo_types%5D%5B%5D=&filter%5Bcontainer_types%5D%5B%5D=&filter%5Bconsignee_group_ids%5D%5B%5D=&filter%5Bincoterms%5D%5B%5D=&filter%5Bshipment_types%5D%5B%5D=&filter%5Bmodes%5D%5B%5D=&filter%5Bpol_ids%5D%5B%5D=&filter%5Bpod_ids%5D%5B%5D=&filter%5Bshipper_group_ids%5D%5B%5D=&filter%5Bcustomer_group_ids%5D%5B%5D=&filter%5Bvendor_group_ids%5D%5B%5D=&filter%5Bclient_group_ids%5D%5B%5D=&filter%5Bquery%5D=&filter%5Bname%5D=&filter%5Bvendor_client_company_names%5D%5B%5D=&filter%5Borigin%5D=&filter%5Bdestination%5D=&filter%5Bservice_class%5D=&filter%5Boffice_type%5D=&filter%5Bhybrid_mode%5D=&filter%5Btruck_sizes%5D%5B%5D=&filter%5Bvendor_types%5D%5B%5D=&filter%5Bpol_country_names%5D%5B%5D=&filter%5Bpod_country_names%5D%5B%5D=&filter%5Bdistance%5D=&filter%5Benquiry_type%5D=spot`;

        const response = await fetch(`/api/closed-bids?${urlParams}`);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[SINGLE DATE] Received ${data.enquiries?.length || 0} enquiries from ${formattedFromDate} to ${formattedToDate}`);

        // Filter only closed bids
        const closedBids = data.enquiries?.filter(enquiry =>
            enquiry.bidding_closed === true
        ) || [];

        console.log(`[SINGLE DATE] Found ${closedBids.length} closed bids from ${formattedFromDate} to ${formattedToDate}`);
        return closedBids;
    }

    // Fetch closed bids for a date range
    async function fetchClosedBidsForDateRange(fromDate, toDate) {
        const allBids = [];
        const startDate = new Date(fromDate);
        const endDate = new Date(toDate);
        const fromDateObj = new Date(startDate);
        const toDateObj = new Date(endDate);

        let dayCount = 0;
        const maxDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

        console.log(`[DATE RANGE] Fetching data for ${maxDays} days from ${fromDate} to ${toDate}`);

        //while (currentDate <= endDate) {
        dayCount++;
        const dateStr = fromDateObj.toISOString().split('T')[0];
        const formattedDate = formatDateForAPI(dateStr);

        const dateToStr = toDateObj.toISOString().split('T')[0];
        const formattedToDate = formatDateForAPI(dateToStr);

        console.log(`[DATE RANGE] Fetching day ${dayCount}/${maxDays}: ${dateStr} (API format: ${formattedDate})`);

        // Update loading message with progress
        const loadingEl = document.getElementById('loadingMessage');
        if (loadingEl) {
            loadingEl.innerHTML = `Loading closed bids... Day ${dayCount} of ${maxDays} (${dateStr})`;
        }

        try {
            const dayBids = await fetchClosedBidsForDate(formattedDate, formattedToDate);
            allBids.push(...dayBids);
            console.log(`[DATE RANGE] Day ${dayCount}: Found ${dayBids.length} bids`);

            // Add a small delay to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error(`[DATE RANGE] Error fetching data for ${dateStr}:`, error);
            // Continue with other dates even if one fails
        }

        // Move to next day
        //currentDate.setDate(currentDate.getDate() + 1);
        //}

        console.log(`[DATE RANGE] Total bids collected: ${allBids.length}`);
        return allBids;
    }

    // Update page title based on selected date
    function updatePageTitle() {
        const titleEl = document.getElementById('pageTitle');
        const subtitleEl = document.getElementById('pageSubtitle');

        if (currentDateMode === 'single') {
            const selectedDate = getSelectedDate();
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            if (selectedDate === today) {
                titleEl.textContent = "Today's Closed Bids";
                subtitleEl.textContent = "Review completed enquiries and performance";
            } else if (selectedDate === yesterdayStr) {
                titleEl.textContent = "Yesterday's Closed Bids";
                subtitleEl.textContent = "Review completed enquiries and performance";
            } else {
                const dateObj = new Date(selectedDate + 'T00:00:00');
                const formattedDate = dateObj.toLocaleDateString('en-IN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                titleEl.textContent = "Closed Bids";
                subtitleEl.textContent = `Review for ${formattedDate}`;
            }
        } else {
            // Date range mode
            const fromDate = document.getElementById('fromDate')?.value;
            const toDate = document.getElementById('toDate')?.value;

            if (fromDate && toDate) {
                const fromDateObj = new Date(fromDate + 'T00:00:00');
                const toDateObj = new Date(toDate + 'T00:00:00');

                const formatOptions = {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                };

                const fromFormatted = fromDateObj.toLocaleDateString('en-IN', formatOptions);
                const toFormatted = toDateObj.toLocaleDateString('en-IN', formatOptions);

                titleEl.textContent = "Closed Bids - Date Range";
                subtitleEl.textContent = `Review from ${fromFormatted} to ${toFormatted}`;
            } else {
                titleEl.textContent = "Closed Bids - Date Range";
                subtitleEl.textContent = "Select date range to view closed bids";
            }
        }
    }

    // Format date for API (GoComet expects DD/MM/YYYY format)
    function formatDateForAPI(dateStr) {
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    // Load closed bids from API
    async function loadClosedBids() {
        const loadingEl = document.getElementById('loadingMessage');
        const errorEl = document.getElementById('errorMessage');
        const noDataEl = document.getElementById('noDataMessage');
        const tableEl = document.getElementById('bidsTable');

        // Show loading state
        loadingEl.style.display = 'block';
        errorEl.style.display = 'none';
        noDataEl.style.display = 'none';
        tableEl.style.display = 'none';

        try {
            let allClosedBids = [];

            if (currentDateMode === 'single') {
                const selectedDate = getSelectedDate();
                const formattedDate = formatDateForAPI(selectedDate);
                console.log(`[CLOSED BIDS] Loading closed bids for ${selectedDate} (API format: ${formattedDate})`);

                const bids = await fetchClosedBidsForDate(formattedDate);
                allClosedBids = bids;
            } else {
                // Date range mode
                const fromDate = document.getElementById('fromDate').value;
                const toDate = document.getElementById('toDate').value;

                if (!fromDate || !toDate) {
                    throw new Error('Please select both from and to dates');
                }

                if (new Date(fromDate) > new Date(toDate)) {
                    throw new Error('From date cannot be after to date');
                }

                console.log(`[CLOSED BIDS] Loading closed bids for range ${fromDate} to ${toDate}`);
                loadingEl.innerHTML = 'Loading closed bids for date range...';

                allClosedBids = await fetchClosedBidsForDateRange(fromDate, toDate);
            }

            console.log(`[CLOSED BIDS] Received ${allClosedBids.length} total bids`);

            loadingEl.style.display = 'none';
            loadingEl.innerHTML = 'Loading closed bids...'; // Reset loading message

            if (allClosedBids.length === 0) {
                noDataEl.style.display = 'block';
                updateStats([], currentDateMode === 'single' ? getSelectedDate() : `${document.getElementById('fromDate').value} to ${document.getElementById('toDate').value}`);
                // Disable export button when no data
                document.getElementById('exportBtn').disabled = true;
                currentBidsData = [];
                return;
            }

            // Store data for export and display results
            currentBidsData = allClosedBids;
            displayClosedBids(allClosedBids);
            updateStats(allClosedBids, currentDateMode === 'single' ? getSelectedDate() : `${document.getElementById('fromDate').value} to ${document.getElementById('toDate').value}`);
            tableEl.style.display = 'table';

            // Enable export button
            document.getElementById('exportBtn').disabled = false;

        } catch (error) {
            console.error('[CLOSED BIDS] Error loading closed bids:', error);
            loadingEl.style.display = 'none';
            errorEl.style.display = 'block';
            errorEl.textContent = `Error loading closed bids: ${error.message}`;
            // Disable export button on error
            document.getElementById('exportBtn').disabled = true;
            currentBidsData = [];
        }
    }

    // Display closed bids in table
    function displayClosedBids(bids) {
        const tbody = document.getElementById('bidsTableBody');
        tbody.innerHTML = '';

        bids.forEach((bid, index) => {
            const row = document.createElement('tr');
            row.className = 'clickable-row';
            row.dataset.bidIndex = index;

            // Format route
            const route = `${bid.origin?.split(',')[0] || 'Unknown'} → ${bid.destination?.split(',')[0] || 'Unknown'}`;

            // Format cargo quantity
            const cargo = bid.quantity?.join(', ') || 'N/A';

            // Format closed time
            const closedTime = bid.bidding_closed_at ?
                new Date(bid.bidding_closed_at.replace(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/, '$3-$2-$1T$4:$5')).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit'
                }) : 'N/A';

            // Status badge
            let statusClass = 'status-closed';
            if (bid.status === 'Confirmed') statusClass = 'status-confirmed';
            else if (bid.status === 'Lost') statusClass = 'status-lost';

            // Rank badge
            let rankDisplay = 'N/A';
            let rankClass = 'rank-other';
            if (bid.vendor_rank !== null && bid.vendor_rank !== undefined) {
                rankDisplay = `#${bid.vendor_rank}`;
                if (bid.vendor_rank === 1) rankClass = 'rank-1';
                else if (bid.vendor_rank === 2) rankClass = 'rank-2';
            }

            row.innerHTML = `
                <td>
                    <div class="enquiry-name" title="${bid.name}">${bid.name}</div>
                    <div style="font-size: 12px; color: #666;">${bid.key}</div>
                </td>
                <td>
                    <div class="route" title="${route}">${route}</div>
                </td>
                <td title="${cargo}">${cargo.length > 30 ? cargo.substring(0, 30) + '...' : cargo}</td>
                <td>${closedTime}</td>
                <td><span class="status-badge ${statusClass}">${bid.status}</span></td>
                <td><span class="rank-badge ${rankClass}">${rankDisplay}</span></td>
                <td>${bid.quotes_sent || 0}</td>
                <td title="${bid.client_company_name}">${bid.client_company_name?.split(' ')[0] || 'N/A'} <span class="expand-icon">▼</span></td>
            `;

            // Add click handler for expansion
            row.addEventListener('click', () => toggleBidDetails(row, bid, index));

            tbody.appendChild(row);
        });
    }

    // Toggle bid details expansion
    function toggleBidDetails(row, bid, index) {
        const existingDetails = document.getElementById(`details-${index}`);
        const expandIcon = row.querySelector('.expand-icon');

        if (existingDetails) {
            // Collapse
            existingDetails.remove();
            expandIcon.textContent = '▼';
            expandIcon.classList.remove('rotated');
        } else {
            // Expand - first collapse any other open details
            document.querySelectorAll('[id^="details-"]').forEach(el => el.remove());
            document.querySelectorAll('.expand-icon').forEach(icon => {
                icon.textContent = '▼';
                icon.classList.remove('rotated');
            });

            // Create detailed view
            const detailRow = document.createElement('tr');
            detailRow.id = `details-${index}`;
            detailRow.innerHTML = `
                <td colspan="8" class="expanded-details">
                    ${createDetailedView(bid)}
                    <button class="collapse-btn" onclick="toggleBidDetails(this.closest('tr').previousElementSibling, null, ${index})">
                        ▲ Collapse Details
                    </button>
                </td>
            `;

            row.insertAdjacentElement('afterend', detailRow);
            expandIcon.textContent = '▲';
            expandIcon.classList.add('rotated');
        }
    }

    // Create detailed view content
    function createDetailedView(bid) {
        // Format timestamps
        const formatTimestamp = (timestamp) => {
            if (!timestamp) return 'N/A';
            try {
                const date = new Date(timestamp.replace(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/, '$3-$2-$1T$4:$5'));
                return date.toLocaleString('en-IN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                return timestamp;
            }
        };

        // Format address
        const formatAddress = (address) => {
            if (!address) return 'N/A';
            return address.length > 100 ? address.substring(0, 100) + '...' : address;
        };

        return `
            <div class="detail-grid">
                <div class="detail-section">
                    <h4>📋 Enquiry Information</h4>
                    <div class="detail-item">
                        <span class="label">Enquiry ID:</span>
                        <span class="value">${bid.key || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Name:</span>
                        <span class="value">${bid.name || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Type:</span>
                        <span class="value">${bid.enquiry_type || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Mode:</span>
                        <span class="value">${bid.mode || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Shipment Type:</span>
                        <span class="value">${bid.shipment_type || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Label:</span>
                        <span class="value">${bid.enquiry_label || 'N/A'}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <h4>🚚 Cargo & Route</h4>
                    <div class="detail-item">
                        <span class="label">Cargo:</span>
                        <span class="value">${bid.quantity?.join(', ') || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Origin:</span>
                        <span class="value" title="${bid.origin}">${formatAddress(bid.origin)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Origin PIN:</span>
                        <span class="value">${bid.origin_zip_code || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Destination:</span>
                        <span class="value" title="${bid.destination}">${formatAddress(bid.destination)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Dest. PIN:</span>
                        <span class="value">${bid.destination_zip_code || 'N/A'}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <h4>⏰ Timeline</h4>
                    <div class="detail-item">
                        <span class="label">Created:</span>
                        <span class="value">${formatTimestamp(bid.created_at)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Bid Close Time:</span>
                        <span class="value">${formatTimestamp(bid.bid_close_time)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Closed At:</span>
                        <span class="value">${formatTimestamp(bid.bidding_closed_at)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Bidding Closed:</span>
                        <span class="value">${bid.bidding_closed ? 'Yes' : 'No'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Archived:</span>
                        <span class="value">${bid.archived ? 'Yes' : 'No'}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <h4>📊 Bidding Results</h4>
                    <div class="detail-item">
                        <span class="label">Final Status:</span>
                        <span class="value" style="font-weight: 600; color: ${bid.status === 'Confirmed' ? '#2e7d32' : bid.status === 'Lost' ? '#c62828' : '#ef6c00'}">${bid.status || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Your Rank:</span>
                        <span class="value">${bid.vendor_rank ? `#${bid.vendor_rank}` : 'Not Ranked'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Quotes Sent:</span>
                        <span class="value">${bid.quotes_sent || 0}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Client Company:</span>
                        <span class="value">${bid.client_company_name || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Shipper:</span>
                        <span class="value">${bid.shipper || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Consignee:</span>
                        <span class="value">${bid.consignee || 'N/A'}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <h4>🔍 Additional Info</h4>
                    <div class="detail-item">
                        <span class="label">Cargo Hazardous:</span>
                        <span class="value">${bid.cargo_type?.hazardous ? 'Yes' : 'No'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Refrigerated:</span>
                        <span class="value">${bid.cargo_type?.refrigerated ? 'Yes' : 'No'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Envirotainer:</span>
                        <span class="value">${bid.cargo_type?.envirotainer ? 'Yes' : 'No'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Negotiating:</span>
                        <span class="value">${bid.is_negotiating ? 'Yes' : 'No'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">L1 Quote Cost:</span>
                        <span class="value">${bid.l1_quote_total_cost_display || 'N/A'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // Update statistics
    function updateStats(bids, date) {
        const wonBids = bids.filter(bid => bid.status === 'Confirmed').length;
        const lostBids = bids.filter(bid => bid.status === 'Lost').length;
        const closedBids = bids.filter(bid => bid.status === 'Closed').length;
        const totalBids = bids.length;
        const participatedBids = bids.filter(bid => bid.quotes_sent > 0).length;

        const participationRate = totalBids > 0 ? `${Math.round((participatedBids / totalBids) * 100)}%` : '0%';

        document.getElementById('wonCount').textContent = wonBids;
        document.getElementById('lostCount').textContent = lostBids;
        document.getElementById('closedCount').textContent = closedBids;
        document.getElementById('participationRate').textContent = participationRate;

        console.log(`[STATS] Date: ${date}, Total: ${totalBids}, Won: ${wonBids}, Lost: ${lostBids}, Closed: ${closedBids}, Participation: ${participationRate}`);
    }

    // Store current bids data for export
    let currentBidsData = [];
    let currentDateMode = 'single'; // 'single' or 'range'

    // Export to Excel function
    function exportToExcel() {
        if (currentBidsData.length === 0) {
            alert('No data to export');
            return;
        }

        let filenameDate;
        if (currentDateMode === 'single') {
            const selectedDate = getSelectedDate();
            const dateObj = new Date(selectedDate);
            filenameDate = dateObj.toLocaleDateString('en-IN').replace(/\//g, '-');
        } else {
            const fromDate = document.getElementById('fromDate').value;
            const toDate = document.getElementById('toDate').value;
            const fromFormatted = new Date(fromDate).toLocaleDateString('en-IN').replace(/\//g, '-');
            const toFormatted = new Date(toDate).toLocaleDateString('en-IN').replace(/\//g, '-');
            filenameDate = `${fromFormatted}_to_${toFormatted}`;
        }

        // Prepare data for Excel
        const excelData = currentBidsData.map(bid => ({
            'Enquiry ID': bid.key || '',
            'Enquiry Name': bid.name || '',
            'Type': bid.enquiry_type || '',
            'Mode': bid.mode || '',
            'Shipment Type': bid.shipment_type || '',
            'Bid Close Date': formatTimestampForExcel(bid.bid_close_time),
            'Origin': bid.origin || '',
            'Origin PIN': bid.origin_zip_code || '',
            'Destination': bid.destination || '',
            'Destination PIN': bid.destination_zip_code || '',
            'Cargo': bid.quantity?.join(', ') || '',
            'Created At': formatTimestampForExcel(bid.created_at),
            'Bid Close Time': formatTimestampForExcel(bid.bid_close_time),
            'Closed At': formatTimestampForExcel(bid.bidding_closed_at),
            'Status': bid.status || '',
            'Your Rank': bid.vendor_rank ? `#${bid.vendor_rank}` : 'Not Ranked',
            'Quotes Sent': bid.quotes_sent || 0,
            'Client Company': bid.client_company_name || '',
            'Shipper': bid.shipper || '',
            'Consignee': bid.consignee || '',
            'Is Negotiating': bid.is_negotiating ? 'Yes' : 'No',
            'L1 Quote Cost': bid.l1_quote_total_cost_display || '',
            'Cargo Hazardous': bid.cargo_type?.hazardous ? 'Yes' : 'No',
            'Cargo Refrigerated': bid.cargo_type?.refrigerated ? 'Yes' : 'No',
            'Cargo Envirotainer': bid.cargo_type?.envirotainer ? 'Yes' : 'No',
            'Archived': bid.archived ? 'Yes' : 'No'
        }));

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Auto-size columns
        const colWidths = [];
        Object.keys(excelData[0]).forEach(key => {
            const maxLength = Math.max(
                key.length,
                ...excelData.map(row => String(row[key] || '').length)
            );
            colWidths.push({ wch: Math.min(maxLength + 2, 50) });
        });
        ws['!cols'] = colWidths;

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Closed Bids');

        // Generate filename
        const filename = `GoComet_Closed_Bids_${filenameDate}.xlsx`;

        // Save file
        XLSX.writeFile(wb, filename);

        console.log(`[EXCEL EXPORT] Exported ${excelData.length} records to ${filename}`);
    }

    // Format timestamp for Excel
    function formatTimestampForExcel(timestamp) {
        if (!timestamp) return '';
        try {
            const date = new Date(timestamp.replace(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/, '$3-$2-$1T$4:$5'));
            return date.toLocaleString('en-IN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return timestamp;
        }
    }

    // Set date mode (single or range)
    function setDateMode(mode) {
        currentDateMode = mode;

        // Update button states
        document.querySelectorAll('.date-mode-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[onclick="setDateMode('${mode}')"]`).classList.add('active');

        // Show/hide appropriate sections
        if (mode === 'single') {
            document.getElementById('singleDateSection').style.display = 'flex';
            document.getElementById('dateRangeSection').style.display = 'none';
        } else {
            document.getElementById('singleDateSection').style.display = 'none';
            document.getElementById('dateRangeSection').style.display = 'flex';

            // Set default range: last 7 days to today
            const today = new Date();
            const weekAgo = new Date(today);
            weekAgo.setDate(today.getDate() - 7);

            document.getElementById('fromDate').value = weekAgo.toISOString().split('T')[0];
            document.getElementById('toDate').value = today.toISOString().split('T')[0];
        }

        updatePageTitle();
        loadClosedBids();
    }

    // Make functions available globally for onclick handlers
    window.loadClosedBids = loadClosedBids;
    window.setQuickDate = setQuickDate;
    window.exportToExcel = exportToExcel;
    window.setDateMode = setDateMode;

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();