(function() {
  function formatCurrency(n) {
    const num = Number(n || 0);
    return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function getQueryIdFromPath() {
    // Path: /enquiry/:enquiryKey
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[1] || '';
  }

  let percents = { high: 9, medium: 7, low: 5 };

  async function loadPercents() {
    try {
      const res = await fetch('/api/public/percentages');
      if (!res.ok) return;
      const data = await res.json();
      if (data.pricePercents) percents = data.pricePercents;
      // Don't show percentages to user anymore
    } catch (e) {
      // keep defaults
    }
  }

  function validateInput() {
    const mv = Number(document.getElementById('marketValue').value || 0);
    const submitBtn = document.getElementById('submitBid');
    submitBtn.disabled = mv <= 0;
  }

  function validateMultiCargoInput() {
    const submitBtn = document.getElementById('submitBid');
    const cargoInputs = document.querySelectorAll('.cargo-market-input');
    
    let allValid = true;
    cargoInputs.forEach(input => {
      if (!input.value || Number(input.value) <= 0) {
        allValid = false;
      }
    });
    
    submitBtn.disabled = !allValid;
  }

  async function submitMarketPrice() {
    const gid = getQueryIdFromPath();
    
    // Check if this is multi-cargo or single cargo
    const isMultiCargo = document.getElementById('multiCargoSection').style.display !== 'none';
    let marketData;
    
    if (isMultiCargo) {
      // Multiple cargo types - collect all values
      const cargoInputs = document.querySelectorAll('.cargo-market-input');
      const cargoValues = [];
      
      for (let input of cargoInputs) {
        const value = Number(input.value || 0);
        if (value <= 0) {
          alert('Please enter valid market values for all cargo types');
          return;
        }
        cargoValues.push({
          cargoIndex: input.dataset.cargoIndex,
          marketValue: value
        });
      }
      
      marketData = { cargoValues, isMultiCargo: true };
    } else {
      // Single cargo type
      const marketValue = Number(document.getElementById('marketValue').value || 0);
      if (marketValue <= 0) {
        alert('Please enter a valid market value');
        return;
      }
      marketData = { marketValue, isMultiCargo: false };
    }

    const submitBtn = document.getElementById('submitBid');
    const statusDiv = document.getElementById('submitStatus');
    
    // Double-check if bidding is already active before submitting
    try {
      const checkRes = await fetch(`/api/public/enquiry/${encodeURIComponent(gid)}/details`);
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.hasActiveBidding) {
          statusDiv.innerHTML = `<div style="color: #ff9800;">⚠️ Bidding is already active for this enquiry. Refresh the page to see current status.</div>`;
          return;
        }
      }
    } catch (e) {
      // Continue with submission if check fails
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    statusDiv.textContent = 'Processing your market price...';
    
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch('/api/public/submit-market-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enquiryKey: gid, ...marketData }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        
        // Show simple success message - NO bid prices for public users
        const statusDiv = document.getElementById('submitStatus');
        statusDiv.innerHTML = `
          <div style="color: #4caf50; font-weight: 600; margin-bottom: 8px;">✓ Market price submitted successfully!</div>
          <div style="color: #666; margin-bottom: 8px;">Smart bidding has been activated. Only admins can stop the process.</div>
        `;
        
        submitBtn.textContent = 'Submitted';
        submitBtn.disabled = true;
        
        // Disable all inputs to prevent re-submission
        if (isMultiCargo) {
          document.querySelectorAll('.cargo-market-input').forEach(input => input.disabled = true);
        } else {
          document.getElementById('marketValue').disabled = true;
        }
      } else {
        const error = await response.json();
        if (error.error && error.error.includes('already active')) {
          statusDiv.innerHTML = `<div style="color: #ff9800;">⚠️ ${error.error} Please refresh the page.</div>`;
        } else {
          statusDiv.innerHTML = `<div style="color: #f44336;">❌ ${error.error || 'Submission failed'}</div>`;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Market Price';
        }
      }
    } catch (error) {
      console.error('Submission error:', error);
      let errorMessage = '❌ Network error. Please try again.';
      
      if (error.name === 'AbortError') {
        errorMessage = '⏱️ Request timed out. The bidding may have started successfully. Please refresh the page to check.';
      } else if (error.message.includes('fetch')) {
        errorMessage = '🌐 Connection failed. Please check your internet and try again.';
      }
      
      statusDiv.innerHTML = `<div style="color: #f44336;">${errorMessage}</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Market Price';
    }
  }


  async function init() {
    const gid = getQueryIdFromPath();
    document.getElementById('enquiryId').value = gid;
    // Load and show details for transparency (no credentials required)
    try {
      const res = await fetch(`/api/public/enquiry/${encodeURIComponent(gid)}/details`);
      if (res.ok) {
        const data = await res.json();
        
        // Check if enquiry has expired (no time remaining or closed)
        const isExpired = (data.bidding && data.bidding.bid_closing_in !== undefined && data.bidding.bid_closing_in <= 0) ||
                         (data.bidding && data.bidding.status && data.bidding.status.toLowerCase() === 'closed');
        
        if (isExpired) {
          // Hide the page content and show expiry message
          document.querySelector('.container').innerHTML = `
            <div class="card" style="text-align: center; padding: 40px;">
              <h2>Enquiry Expired</h2>
              <p>This enquiry has closed and is no longer accepting bids.</p>
              <div class="sub">Enquiry ID: ${gid}</div>
            </div>
          `;
          return;
        }

        // Store active bidding status for later use
        const hasActiveBidding = data.hasActiveBidding && data.activeBiddingInfo;
        
        console.log('[ENQUIRY] Received data:', data);
        
        const t = document.getElementById('title');
        if (data.display_number) {
          t.textContent = `Enquiry • ${data.display_number}`;
        } else {
          t.textContent = `Enquiry • ${gid}`;
        }
        
        // Update all details with comprehensive data
        document.getElementById('detailDisplay').textContent = data.display_number || gid || '—';
        document.getElementById('detailStatus').textContent = data.status || '—';
        document.getElementById('detailCompany').textContent = data.company_name || '—';
        document.getElementById('detailContact').textContent = data.contact_person || '—';
        
        // Route with better formatting
        let routeText = '—';
        if (data.origin || data.destination) {
          routeText = `${data.origin || 'Unknown'} → ${data.destination || 'Unknown'}`;
        }
        document.getElementById('detailRoute').textContent = routeText;
        
        // Transport type with cleanup
        let typeText = '—';
        if (data.transport_type && data.transport_type.trim()) {
          typeText = data.transport_type.trim();
        }
        document.getElementById('detailType').textContent = typeText;
        
        // Cargo quantity
        let cargoText = '—';
        if (data.cargo_quantity && Array.isArray(data.cargo_quantity) && data.cargo_quantity.length > 0) {
          cargoText = data.cargo_quantity.join(', ');
        }
        document.getElementById('detailCargo').textContent = cargoText;
        
        // Quotes sent
        document.getElementById('detailQuotes').textContent = data.quotes_sent !== undefined ? String(data.quotes_sent) : '—';
        
        // Rank - check both direct and bidding data
        let rankText = '—';
        if (data.vendor_rank !== undefined && data.vendor_rank !== null) {
          rankText = String(data.vendor_rank);
        } else if (data.bidding && data.bidding.vendor_rank !== undefined && data.bidding.vendor_rank !== null) {
          rankText = String(data.bidding.vendor_rank);
        }
        document.getElementById('detailRank').textContent = rankText;
        
        // Time remaining with better formatting
        let timeText = '—';
        if (data.bidding && data.bidding.bid_closing_in !== undefined) {
          const sec = Number(data.bidding.bid_closing_in) || 0;
          if (sec > 0) {
            const hours = Math.floor(sec / 3600);
            const minutes = Math.floor((sec % 3600) / 60);
            const seconds = sec % 60;
            
            if (hours > 0) {
              timeText = `${hours}h ${minutes}m ${seconds}s`;
            } else if (minutes > 0) {
              timeText = `${minutes}m ${seconds}s`;
            } else {
              timeText = `${seconds}s`;
            }
          } else {
            timeText = 'Expired';
          }
        }
        document.getElementById('detailTime').textContent = timeText;
        
        // Closing time
        let closingText = '—';
        if (data.closing_time) {
          closingText = data.closing_time;
        }
        document.getElementById('detailClosing').textContent = closingText;
        
        // Revisions left
        let revisionsText = '—';
        if (data.bidding && data.bidding.revisions_left !== undefined) {
          revisionsText = String(data.bidding.revisions_left);
        }
        document.getElementById('detailRevisions').textContent = revisionsText;
        
        // Unit details for bidding clarity
        if (data.unit_details && data.unit_details.charges && data.unit_details.charges.length > 0) {
          const unitRow = document.getElementById('unitDetailsRow');
          const unitDiv = document.getElementById('detailUnits');
          
          // Show unit details section
          unitRow.style.display = 'block';
          
          // Build unit details display
          const charges = data.unit_details.charges;
          let unitsText = '';
          
          if (charges.length === 1) {
            // Single cargo type
            const charge = charges[0];
            unitsText = `${charge.units} × ${charge.unitName} (${charge.type})`;
            
            document.getElementById('singleCargoSection').style.display = 'block';
            document.getElementById('multiCargoSection').style.display = 'none';
            document.getElementById('unitHint').textContent = `Total: ${charge.units} units`;
          } else {
            // Multiple cargo types - show separate input for each
            unitsText = charges.map(c => `${c.units} × ${c.unitName} (${c.type})`).join('<br>');
            
            document.getElementById('singleCargoSection').style.display = 'none';
            document.getElementById('multiCargoSection').style.display = 'block';
            
            // Create input fields for each cargo type
            const cargoInputsDiv = document.getElementById('cargoInputs');
            cargoInputsDiv.innerHTML = charges.map((charge, index) => `
              <div class="cargo-input-group">
                <label>${charge.type} (${charge.units} × ${charge.unitName})</label>
                <input class="input cargo-market-input" 
                       type="number" 
                       id="cargoValue${index}" 
                       data-cargo-index="${index}"
                       placeholder="Per unit price for this cargo type" />
              </div>
            `).join('');
            
            document.getElementById('multiUnitHint').textContent = 
              `Total: ${data.unit_details.totalUnits} units across ${charges.length} charge types. Enter per-unit price for each cargo type above.`;
            
            // Add event listeners for validation
            charges.forEach((_, index) => {
              document.getElementById(`cargoValue${index}`).addEventListener('input', validateMultiCargoInput);
            });
          }
          
          unitDiv.innerHTML = unitsText;
          console.log('[ENQUIRY] Unit details displayed:', data.unit_details);
        } else {
          // Hide unit details if not available
          document.getElementById('unitDetailsRow').style.display = 'none';
          document.getElementById('unitHint').textContent = 'Unit details will be calculated automatically';
          document.getElementById('singleCargoSection').style.display = 'block';
          document.getElementById('multiCargoSection').style.display = 'none';
        }
      }
      
      // Check if there's already active bidding with submitted values
      if (data.hasActiveBidding && data.activeBiddingInfo && data.activeBiddingInfo.isPublicSubmission) {
        const bidInfo = data.activeBiddingInfo;
        console.log('[ENQUIRY] Found active public submission, showing read-only values:', bidInfo);
        
        // Determine if this is multi-cargo based on bids structure
        const isMultiCargo = bidInfo.bids && bidInfo.bids.cargo && Array.isArray(bidInfo.bids.cargo);
        
        // Show simple message for already submitted - NO bid prices for public users
        const statusDiv = document.getElementById('submitStatus');
        statusDiv.innerHTML = `
          <div style="color: #4caf50; font-weight: 600; margin-bottom: 8px;">✓ Market price already submitted!</div>
          <div style="color: #666; margin-bottom: 8px;">Smart bidding is active. Only admins can make changes.</div>
        `;
        
        // Disable all inputs
        document.getElementById('submitBid').disabled = true;
        document.getElementById('submitBid').textContent = 'Already Submitted';
        
        if (isMultiCargo) {
          document.querySelectorAll('.cargo-market-input').forEach(input => {
            input.disabled = true;
            // Show the market value that was submitted
            const cargoIndex = parseInt(input.dataset.cargoIndex);
            const cargo = bidInfo.bids.cargo.find(c => Number(c.cargoIndex) === cargoIndex);
            if (cargo && cargo.marketValue) {
              input.value = cargo.marketValue;
            }
          });
        } else {
          const marketInput = document.getElementById('marketValue');
          if (marketInput && bidInfo.bids.marketValue) {
            marketInput.value = bidInfo.bids.marketValue;
            marketInput.disabled = true;
          }
        }
        
        // Skip adding event listeners since inputs are disabled
        return;
      }
      
      // Handle active bidding that's NOT from public submission (started by admin)
      if (hasActiveBidding) {
        // Just disable the inputs - don't show any bidding status to public users
        document.getElementById('marketValue').disabled = true;
        document.getElementById('submitBid').disabled = true;
        document.getElementById('submitBid').textContent = 'Bidding Active';
        
        // Skip adding event listeners since inputs are disabled
        return;
      }
    } catch (e) {}
    
    await loadPercents();
    document.getElementById('marketValue').addEventListener('input', validateInput);
    document.getElementById('submitBid').addEventListener('click', submitMarketPrice);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


