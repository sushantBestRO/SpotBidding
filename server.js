//Author - Saksham Solanki | Date - 27/07/2025
//Co-Author - Claude 4 Opus

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const axios = require('axios');
const puppeteer = require('puppeteer');
const fs = require('fs');
const logger = require('./logger');
require('dotenv').config();

const app = express();

// User data file path
const usersFilePath = path.join(__dirname, 'users.json');
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'gocomet-bidder-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Load users from file or use defaults
let users = {};
try {
  if (fs.existsSync(usersFilePath)) {
    const usersData = fs.readFileSync(usersFilePath, 'utf8');
    users = JSON.parse(usersData);
  } else {
    // Default users
    users = {
      'bestroadways': { password: 'sg@1234', name: 'Best Roadways', isAdmin: true },
      'admin': { password: 'admin123', name: 'Administrator', isAdmin: true }
    };
    // Save defaults to file
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
  }
} catch (error) {
  console.error('Error loading users:', error);
  users = {
    'bestroadways': { password: 'sg@1234', name: 'Best Roadways', isAdmin: true },
    'admin': { password: 'admin123', name: 'Administrator', isAdmin: true }
  };
}

// Function to save users to file
function saveUsers() {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving users:', error);
    return false;
  }
}

const bidSessions = new Map();
const activeBidMonitors = new Map(); // Track active bid monitors
const bidSubmissionCache = new Map(); // Cache prepared bid payloads
const quoteRankCache = new Map(); // Cache individual quote ranks to prevent glitches
const globalBidStatus = new Map(); // Global status for all active bids (shared across users)

// Config file path
const configPath = path.join(__dirname, 'web_config.json');
console.log('[STARTUP] Config path:', configPath);
console.log('[STARTUP] Config exists:', fs.existsSync(configPath));

// Config management functions
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(data);
      console.log('[CONFIG] Loaded config, has globalAuthToken:', !!config.globalAuthToken);
      return config;
    } else {
      console.log('[CONFIG] Config file not found at:', configPath);
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
}

// API Configuration
const API_BASE_URL = 'https://enquiry.gocomet.com';

function getHeaders(authToken) {
  return {
    'accept': 'application/json',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.9',
    'authorization': authToken || '',
    'cache-control': 'no-cache',
    'ops-client-schema': 'app',
    'origin': 'https://app.gocomet.com',
    'pragma': 'no-cache',
    'priority': 'u=1, i',
    'referer': 'https://app.gocomet.com/',
    'schema': 'app',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
  };
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Routes
app.get('/', (req, res) => {
  console.log('[ROOT] Session user:', req.session.user);
  if (req.session.user) {
    console.log('[ROOT] User logged in, serving dashboard');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  } else {
    console.log('[ROOT] No user session, serving login page');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

// Public enquiry page (NO AUTH)
app.get('/enquiry/:enquiryKey', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'enquiry.html'));
});

app.get('/settings', requireAuth, (req, res) => {
  if (!req.session.user.isAdmin) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (users[username] && users[username].password === password) {
    req.session.user = {
      username,
      name: users[username].name,
      isAdmin: users[username].isAdmin || false
    };
    res.json({ success: true, user: req.session.user });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/user', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// Check if global token exists (no auth required for initial check)
app.get('/api/check-global-token', (req, res) => {
  const config = loadConfig();
  const hasGlobalToken = !!config.globalAuthToken;
  console.log('[TOKEN CHECK] Global token exists:', hasGlobalToken);
  res.json({ hasGlobalToken });
});

// Test token endpoint
app.get('/api/test-token', requireAuth, async (req, res) => {
  const config = loadConfig();
  const authToken = config.globalAuthToken;
  
  if (!authToken) {
    return res.json({ success: false, error: 'No token in config' });
  }
  
  try {
    // Test with a simple API call
    const url = `${API_BASE_URL}/api/v1/vendor/enquiries/spot?page=1&size=1`;
    const response = await axios.get(url, { headers: getHeaders(authToken) });
    
    res.json({ 
      success: true, 
      message: 'Token is valid',
      tokenWorks: true,
      statusCode: response.status,
      quotesCount: response.data.enquiries?.length || 0
    });
  } catch (error) {
    res.json({ 
      success: false, 
      tokenWorks: false,
      error: error.message,
      statusCode: error.response?.status
    });
  }
});

// GoComet API endpoints
app.get('/api/quotes', requireAuth, async (req, res) => {
  console.log('[QUOTES API] Request received from user:', req.session.user?.username);
  const sessionId = req.session.id;
  const userSession = bidSessions.get(sessionId) || {};
  
  // ALWAYS use global token - there's only ONE token for the whole system
  const config = loadConfig();
  const authToken = config.globalAuthToken;
  
  console.log('[QUOTES API] Config loaded:', !!config);
  console.log('[QUOTES API] Loading quotes with token:', !!authToken);
  
  if (!authToken) {
    console.log('[QUOTES API] No global token found');
    return res.status(401).json({ error: 'GoComet authentication required', needsAuth: true });
  }
  
  try {
    const url = `${API_BASE_URL}/api/v1/vendor/enquiries/spot?page=1&size=15&reset_filter=false&filter%5Benquiry_type%5D=spot`;
    console.log('[QUOTES API] Fetching from:', url);
    console.log('[QUOTES API] Token preview:', authToken.substring(0, 50) + '...');
    console.log('[QUOTES API] Token starts with Bearer?:', authToken.startsWith('Bearer'));
    
    const response = await axios.get(url, { headers: getHeaders(authToken) });
    
    console.log('[QUOTES API] Response status:', response.status);
    const enquiries = response.data.enquiries || [];
    console.log('[QUOTES API] Total enquiries:', enquiries.length);
    const quotesWithBidding = [];
    
    // Filter only Open quotes
    const openEnquiries = enquiries.filter(enquiry => 
      enquiry.status === 'Open' || enquiry.status === 'open'
    );
    
    // Build quotes WITH unit details for multi-cargo support
    for (const enquiry of openEnquiries) {
      const enquiryNumber = enquiry.key || 'N/A';
      
      // Use rank directly from the enquiry data
      const currentRank = enquiry.vendor_rank || 'N/A';
      
      // Try to get unit details from quote data for better bidding info
      let unitDetails = null;
      try {
        const quotesUrl = `${API_BASE_URL}/api/v1/vendor/enquiries/${enquiryNumber}/quotes`;
        const qRes = await axios.get(quotesUrl, { headers: getHeaders(authToken) });
        const quote = Array.isArray(qRes.data) ? qRes.data[0] : null;
        
        if (quote && quote.charges_list?.['11_freight_charges']) {
          const freightCharges = quote.charges_list['11_freight_charges'];
          const chargeKeys = Object.keys(freightCharges).filter(key => 
            key.startsWith('freight_charges_custom_charge') && key !== 'display_name'
          );
          
          if (chargeKeys.length > 0) {
            const unitDetailsArray = [];
            let totalUnits = 0;
            
            for (const chargeKey of chargeKeys) {
              const charge = freightCharges[chargeKey];
              const units = Number(charge.units) || 0;
              totalUnits += units;
              
              unitDetailsArray.push({
                type: charge.display_name || chargeKey,
                units: units,
                unitName: charge.unit_name || 'UNIT',
                description: `${units} × ${charge.unit_name || 'UNIT'}`
              });
            }
            
            unitDetails = {
              totalUnits,
              charges: unitDetailsArray,
              description: unitDetailsArray.map(u => u.description).join(' + ')
            };
          }
        }
      } catch (e) {
        console.log(`[QUOTES API] Could not fetch unit details for ${enquiryNumber}:`, e.message);
      }
      
      quotesWithBidding.push({
        enquiry_number: enquiryNumber,
        display_number: enquiry.name || 'N/A',
        rank: currentRank,
        status: enquiry.status || 'Open',
        origin: enquiry.origin || 'N/A',
        destination: enquiry.destination || 'N/A',
        transport_type: `${enquiry.shipment_type || ''} ${enquiry.mode || ''}`.trim() || 'N/A',
        cargo_quantity: enquiry.quantity || [],
        closing_time: enquiry.bid_close_time || null,
        closing_timestamp: enquiry.bid_close_timestamp || null,
        company_name: enquiry.client_company_name || 'N/A',
        contact_person: enquiry.shipper || enquiry.consignee || 'N/A',
        quotes_sent: enquiry.quotes_sent || 0,
        enquiry_data: enquiry,
        bidding_data: null, // Only fetch when smart bidding is active
        unit_details: unitDetails, // Include unit details for multi-cargo support
        // Get bid amounts from active bidding session or user session
        bid_amounts: (() => {
          const globalStatus = globalBidStatus.get(enquiryNumber);
          if (globalStatus && globalStatus.bids) {
            console.log(`[QUOTES API] Bidding data found for ${enquiryNumber} (active: ${globalStatus.active}), bid structure:`, JSON.stringify(globalStatus.bids, null, 2));
            return globalStatus.bids;
          }
          return userSession.bids?.[enquiryNumber] || { low: '', medium: '', high: '' };
        })(),
        // Include bidding status
        bidding_active: (() => {
          const globalStatus = globalBidStatus.get(enquiryNumber);
          return globalStatus?.active || false;
        })()
      });
    }
    
    console.log('[QUOTES API] Open quotes:', quotesWithBidding.length);
    res.json({ quotes: quotesWithBidding });
  } catch (error) {
    console.error('[QUOTES API] Error:', error.message);
    console.error('[QUOTES API] Error status:', error.response?.status);
    console.error('[QUOTES API] Error data:', error.response?.data);
    
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      res.status(401).json({ error: 'GoComet authentication expired', needsAuth: true });
    } else {
      res.status(500).json({ error: 'Failed to fetch quotes', details: error.message });
    }
  }
});

// ===== Public pricing config (NO AUTH) =====
app.get('/api/public/percentages', (req, res) => {
  const cfg = loadConfig();
  const pricePercents = cfg.pricePercents || { high: 9, medium: 7, low: 5 };
  res.json({ pricePercents });
});

// Public market price submission (NO AUTH) - starts smart bidding
app.post('/api/public/submit-market-price', async (req, res) => {
  const { enquiryKey, marketValue, cargoValues, isMultiCargo } = req.body;
  
  // Validate input based on cargo type
  if (!enquiryKey) {
    return res.status(400).json({ error: 'Invalid enquiry key' });
  }
  
  if (isMultiCargo) {
    if (!cargoValues || !Array.isArray(cargoValues) || cargoValues.length === 0) {
      return res.status(400).json({ error: 'Invalid cargo values for multi-cargo enquiry' });
    }
    for (const cargo of cargoValues) {
      if (!cargo.marketValue || cargo.marketValue <= 0) {
        return res.status(400).json({ error: 'Invalid market value for cargo type' });
      }
    }
  } else {
    if (!marketValue || marketValue <= 0) {
      return res.status(400).json({ error: 'Invalid market value' });
    }
  }

  const cfg = loadConfig();
  const authToken = cfg.globalAuthToken;
  const pricePercents = cfg.pricePercents || { high: 9, medium: 7, low: 5 };

  if (!authToken) {
    return res.status(503).json({ error: 'System not configured for bidding' });
  }

  try {
    let bids;
    
    if (isMultiCargo) {
      // Multiple cargo types - create bid structure for each cargo
      bids = { cargo: [] };
      
      console.log('[PUBLIC SUBMISSION] Received cargoValues:', JSON.stringify(cargoValues, null, 2));
      
      for (const cargo of cargoValues) {
        const bidItem = {
          cargoIndex: cargo.cargoIndex,
          high: Math.round(cargo.marketValue * (1 + pricePercents.high / 100)),
          medium: Math.round(cargo.marketValue * (1 + pricePercents.medium / 100)),
          low: Math.round(cargo.marketValue * (1 + pricePercents.low / 100)),
          marketValue: cargo.marketValue
        };
        console.log('[PUBLIC SUBMISSION] Adding cargo bid:', JSON.stringify(bidItem, null, 2));
        bids.cargo.push(bidItem);
      }
    } else {
      // Single cargo type - use original logic
      bids = {
        high: Math.round(marketValue * (1 + pricePercents.high / 100)),
        medium: Math.round(marketValue * (1 + pricePercents.medium / 100)),
        low: Math.round(marketValue * (1 + pricePercents.low / 100)),
        marketValue: marketValue
      };
    }

    // Check if bidding already active
    if (activeBidMonitors.has(enquiryKey)) {
      return res.status(409).json({ error: 'Smart bidding already active for this enquiry' });
    }

    const globalStatus = globalBidStatus.get(enquiryKey);
    if (globalStatus && globalStatus.active) {
      return res.status(409).json({ error: 'Smart bidding already active for this enquiry' });
    }

    // Get enquiry details for closing timestamp
    let closingTimestamp = null;
    try {
      const biddingUrl = `${API_BASE_URL}/api/v1/vendor/enquiries/${enquiryKey}/bidding-data`;
      const biddingRes = await axios.get(biddingUrl, { headers: getHeaders(authToken) });
      const biddingData = biddingRes.data;
      
      if (biddingData.bid_closing_in && biddingData.bid_closing_in > 0) {
        // Calculate closing timestamp from current time + remaining seconds
        closingTimestamp = new Date(Date.now() + (biddingData.bid_closing_in * 1000)).toISOString();
      } else {
        return res.status(400).json({ error: 'Enquiry has expired or no valid closing time' });
      }
    } catch (error) {
      return res.status(400).json({ error: 'Unable to fetch enquiry details' });
    }

    // Start smart bidding monitor
    const monitor = startSmartBiddingMonitor({
      enquiryKey,
      enquiryNumber: enquiryKey, // Use enquiry key as display number for public submissions
      closingTimestamp,
      bids,
      sessionId: 'public-submission', // Special session ID for public submissions
      authToken
    });

    // Mark as public submission (cannot be stopped by submitter)
    monitor.startedBy = 'public-submission';
    monitor.userFullName = 'Public Submission';
    monitor.isPublicSubmission = true;
    monitor.marketValue = isMultiCargo ? cargoValues : marketValue;
    monitor.isMultiCargo = isMultiCargo;

    // Set in activeBidMonitors
    activeBidMonitors.set(enquiryKey, monitor);

    // Set global status
    const globalStatusData = {
      active: true,
      status: monitor.status,
      currentRank: monitor.currentRank,
      bidsSubmitted: monitor.bidsSubmitted,
      timeRemaining: monitor.timeRemaining,
      startedBy: 'public-submission',
      userFullName: 'Public Submission',
      bids: bids,
      marketValue: isMultiCargo ? cargoValues : marketValue,
      isPublicSubmission: true,
      isMultiCargo: isMultiCargo,
      timestamp: new Date().toISOString()
    };
    globalBidStatus.set(enquiryKey, globalStatusData);

    logger.logBid(enquiryKey, 'PUBLIC_SUBMISSION', marketValue, monitor.timeRemaining, monitor.currentRank, true, 0, {
      calculatedBids: bids,
      percentages: pricePercents
    });

    res.json({ 
      success: true, 
      message: 'Smart bidding started with your market price',
      bids: bids // Show calculated bids to admin only
    });

  } catch (error) {
    console.error('Error starting public bidding:', error);
    res.status(500).json({ error: 'Failed to start smart bidding' });
  }
});

// Public enquiry details (NO AUTH) - uses stored global token server-side
app.get('/api/public/enquiry/:enquiryKey/details', async (req, res) => {
  const { enquiryKey } = req.params;
  const cfg = loadConfig();
  const authToken = cfg.globalAuthToken;

  const baseDetails = { enquiryKey };

  if (!authToken) {
    console.log('[PUBLIC DETAILS] No auth token available');
    return res.json({ ...baseDetails, limited: true });
  }

  try {
    // First try to get enquiry from the main quotes list (like dashboard does)
    let enquiryData = null;
    try {
      const quotesListUrl = `${API_BASE_URL}/api/v1/vendor/enquiries/spot?page=1&size=50&reset_filter=false&filter%5Benquiry_type%5D=spot`;
      const quotesListRes = await axios.get(quotesListUrl, { headers: getHeaders(authToken) });
      const enquiries = quotesListRes.data.enquiries || [];
      
      console.log('[PUBLIC DETAILS] Total enquiries in list:', enquiries.length);
      console.log('[PUBLIC DETAILS] Looking for enquiry key:', enquiryKey);
      console.log('[PUBLIC DETAILS] Available keys:', enquiries.map(e => e.key));
      
      enquiryData = enquiries.find(e => e.key === enquiryKey);
      console.log('[PUBLIC DETAILS] Found enquiry in list:', !!enquiryData);
      
      if (!enquiryData) {
        // Try with larger page size in case it's not in first 50
        console.log('[PUBLIC DETAILS] Not found in first 50, trying larger size...');
        const largerUrl = `${API_BASE_URL}/api/v1/vendor/enquiries/spot?page=1&size=200&reset_filter=false&filter%5Benquiry_type%5D=spot`;
        const largerRes = await axios.get(largerUrl, { headers: getHeaders(authToken) });
        const allEnquiries = largerRes.data.enquiries || [];
        enquiryData = allEnquiries.find(e => e.key === enquiryKey);
        console.log('[PUBLIC DETAILS] Found in larger list:', !!enquiryData);
      }
      
      if (enquiryData) {
        console.log('[PUBLIC DETAILS] Enquiry data keys:', Object.keys(enquiryData));
      }
    } catch (e) {
      console.log('[PUBLIC DETAILS] Failed to fetch quotes list:', e.message);
    }

    // Fetch bidding data for timing/rank
    let bidding = null;
    try {
      const biddingUrl = `${API_BASE_URL}/api/v1/vendor/enquiries/${enquiryKey}/bidding-data`;
      const bidRes = await axios.get(biddingUrl, { headers: getHeaders(authToken) });
      bidding = bidRes.data;
      console.log('[PUBLIC DETAILS] Bidding data fetched:', !!bidding);
    } catch (e) {
      console.log('[PUBLIC DETAILS] Failed to fetch bidding data:', e.message);
    }

    // Build comprehensive response with all enquiry data
    let meta = {};
    if (enquiryData) {
      meta = {
        // Basic info
        display_number: enquiryData.name || enquiryData.display_number || undefined,
        enquiry_number: enquiryData.key || enquiryKey,
        
        // Route info
        origin: enquiryData.origin || undefined,
        destination: enquiryData.destination || undefined,
        transport_type: `${enquiryData.shipment_type || ''} ${enquiryData.mode || ''}`.trim() || undefined,
        
        // Company info
        company_name: enquiryData.client_company_name || undefined,
        contact_person: enquiryData.shipper || enquiryData.consignee || undefined,
        
        // Status and timing
        status: enquiryData.status || undefined,
        closing_time: enquiryData.bid_close_time || undefined,
        closing_timestamp: enquiryData.bid_close_timestamp || undefined,
        
        // Cargo details
        cargo_quantity: enquiryData.quantity || [],
        
        // Unit details for bidding
        unit_details: null, // Will be filled from quote data
        
        // Bidding stats
        quotes_sent: enquiryData.quotes_sent || 0,
        vendor_rank: enquiryData.vendor_rank || undefined,
        
        // Full enquiry data for reference
        enquiry_data: enquiryData
      };
      console.log('[PUBLIC DETAILS] Comprehensive meta extracted:', Object.keys(meta));
    } else {
      console.log('[PUBLIC DETAILS] Enquiry not found in main list, trying alternative methods...');
      
      // Fallback 1: Try direct enquiry details endpoint
      try {
        const directUrl = `${API_BASE_URL}/api/v1/vendor/enquiries/${enquiryKey}`;
        console.log('[PUBLIC DETAILS] Trying direct enquiry URL:', directUrl);
        const directRes = await axios.get(directUrl, { headers: getHeaders(authToken) });
        if (directRes.data) {
          enquiryData = directRes.data;
          console.log('[PUBLIC DETAILS] Found via direct API:', Object.keys(enquiryData));
        }
      } catch (e) {
        console.log('[PUBLIC DETAILS] Direct enquiry API failed:', e.message);
      }
      
      // Fallback 2: try to get from quotes endpoint
      if (!enquiryData) {
        try {
          const quotesUrl = `${API_BASE_URL}/api/v1/vendor/enquiries/${enquiryKey}/quotes`;
          console.log('[PUBLIC DETAILS] Trying quotes URL:', quotesUrl);
          const qRes = await axios.get(quotesUrl, { headers: getHeaders(authToken) });
          const q = Array.isArray(qRes.data) ? qRes.data[0] : null;
          if (q) {
            console.log('[PUBLIC DETAILS] Found quote data:', Object.keys(q));
            meta = {
              origin: q.origin || q.enquiry_origin || q.route_origin || undefined,
              destination: q.destination || q.enquiry_destination || q.route_destination || undefined,
              transport_type: (q.shipment_type ? `${q.shipment_type} ` : '') + (q.mode || ''),
              company_name: q.client_company_name || q.company_name || undefined,
              display_number: q.name || q.enquiry_name || q.display_number || undefined,
              enquiry_number: enquiryKey,
              // Add any other fields from quote
              status: q.status || undefined,
              cargo_quantity: q.cargo_quantity || q.quantity || [],
              contact_person: q.shipper || q.consignee || undefined
            };
            console.log('[PUBLIC DETAILS] Meta from quotes:', Object.keys(meta));
          }
        } catch (e) {
          console.log('[PUBLIC DETAILS] Failed to fetch quotes:', e.message);
        }
      }
      
      // If we found enquiry data via direct API, process it
      if (enquiryData) {
        meta = {
          // Basic info
          display_number: enquiryData.name || enquiryData.display_number || undefined,
          enquiry_number: enquiryData.key || enquiryKey,
          
          // Route info
          origin: enquiryData.origin || undefined,
          destination: enquiryData.destination || undefined,
          transport_type: `${enquiryData.shipment_type || ''} ${enquiryData.mode || ''}`.trim() || undefined,
          
          // Company info
          company_name: enquiryData.client_company_name || undefined,
          contact_person: enquiryData.shipper || enquiryData.consignee || undefined,
          
          // Status and timing
          status: enquiryData.status || undefined,
          closing_time: enquiryData.bid_close_time || undefined,
          closing_timestamp: enquiryData.bid_close_timestamp || undefined,
          
          // Cargo details
          cargo_quantity: enquiryData.quantity || [],
          
          // Bidding stats
          quotes_sent: enquiryData.quotes_sent || 0,
          vendor_rank: enquiryData.vendor_rank || undefined,
          
          // Full enquiry data for reference
          enquiry_data: enquiryData
        };
        console.log('[PUBLIC DETAILS] Meta from direct API:', Object.keys(meta));
      }
    }

    // Try to get unit details from quote data for better bidding info
    if (!meta.unit_details) {
      try {
        const quotesUrl = `${API_BASE_URL}/api/v1/vendor/enquiries/${enquiryKey}/quotes`;
        const qRes = await axios.get(quotesUrl, { headers: getHeaders(authToken) });
        const quote = Array.isArray(qRes.data) ? qRes.data[0] : null;
        
        if (quote && quote.charges_list?.['11_freight_charges']) {
          const freightCharges = quote.charges_list['11_freight_charges'];
          const chargeKeys = Object.keys(freightCharges).filter(key => 
            key.startsWith('freight_charges_custom_charge') && key !== 'display_name'
          );
          
          const unitDetails = [];
          let totalUnits = 0;
          
          for (const chargeKey of chargeKeys) {
            const charge = freightCharges[chargeKey];
            const units = Number(charge.units) || 0;
            totalUnits += units;
            
            unitDetails.push({
              type: charge.display_name || chargeKey,
              units: units,
              unitName: charge.unit_name || 'UNIT',
              description: `${units} × ${charge.unit_name || 'UNIT'}`
            });
          }
          
          meta.unit_details = {
            totalUnits,
            charges: unitDetails,
            description: unitDetails.map(u => u.description).join(' + ')
          };
          
          console.log('[PUBLIC DETAILS] Unit details extracted:', meta.unit_details);
        }
      } catch (e) {
        console.log('[PUBLIC DETAILS] Could not fetch unit details:', e.message);
      }
    }

    // Check if there's already active bidding for this enquiry
    const globalStatus = globalBidStatus.get(enquiryKey);
    const hasActiveBidding = activeBidMonitors.has(enquiryKey) || (globalStatus && globalStatus.active);
    
    console.log('[PUBLIC DETAILS] globalStatus for enquiry:', JSON.stringify(globalStatus, null, 2));
    
    const response = { 
      ...baseDetails, 
      ...meta, 
      bidding,
      hasActiveBidding,
      activeBiddingInfo: hasActiveBidding ? {
        startedBy: globalStatus?.startedBy || 'Unknown',
        userFullName: globalStatus?.userFullName || 'Unknown User',
        isPublicSubmission: globalStatus?.isPublicSubmission || false,
        marketValue: globalStatus?.marketValue || null,
        bids: globalStatus?.bids || null,
        status: globalStatus?.status || 'active'
      } : null
    };
    console.log('[PUBLIC DETAILS] Final activeBiddingInfo:', JSON.stringify(response.activeBiddingInfo, null, 2));
    return res.json(response);
  } catch (error) {
    console.error('[PUBLIC DETAILS] Error:', error);
    return res.json({ ...baseDetails, error: error.message });
  }
});

// Chrome automation for login with OTP
async function performChromeLogin(email, otpCallback) {
  console.log('Starting Chrome OTP login process...');
  let browser = null;
  
  try {
    browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-logging',
        '--v=1'
      ]
    });

    const page = await browser.newPage();
    
    // Enable performance logging to capture network logs
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');
    await client.send('Page.enable');
    
    let capturedToken = null;
    
    // Listen for network responses to capture the token
    client.on('Network.responseReceived', async (params) => {
      const url = params.response.url;
      const status = params.response.status;
      
      // Check if this is the OTP login response
      if (url.includes('login.gocomet.com/api/v1/login/otp-login') && status === 200) {
        try {
          // Get the response body
          const response = await client.send('Network.getResponseBody', {
            requestId: params.requestId
          });
          
          if (response.body) {
            const data = JSON.parse(response.body);
            if (data.token) {
              capturedToken = data.token;
              console.log('Captured token from OTP login response');
            }
          }
        } catch (err) {
          console.log('Error getting response body:', err);
        }
      }
    });
    
    // Navigate to login page
    await page.goto('https://www.gocomet.com/login', { waitUntil: 'networkidle2' });
    
    // Enter email
    await page.waitForSelector('input[type="email"]#email', { timeout: 10000 });
    await page.type('input[type="email"]#email', email);
    console.log(`Typed email: ${email}`);
    
    // Click "Login with OTP" button
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button[type="button"]');
      for (const button of buttons) {
        if (button.textContent.includes('Login with OTP')) {
          button.click();
          break;
        }
      }
    });
    console.log('Clicked Login with OTP button');
    
    // Wait a bit for OTP to be sent
    await page.waitForTimeout(2000);
    
    // Request OTP from user
    const otp = await otpCallback();
    console.log('Received OTP from user');
    
    // Enter OTP
    await page.waitForSelector('input#otp_value', { timeout: 10000 });
    await page.type('input#otp_value', otp);
    console.log('Entered OTP');
    
    // Click Login button
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button[type="submit"]');
      for (const button of buttons) {
        if (button.textContent.includes('Login')) {
          button.click();
          break;
        }
      }
    });
    console.log('Clicked Login button');
    
    // Wait for login to complete and token to be captured
    await page.waitForFunction(
      () => window.location.href.includes('app.gocomet.com'),
      { timeout: 30000 }
    );
    
    console.log('Login successful!');
    
    // Give a bit of time for token to be captured
    await page.waitForTimeout(2000);
    
    await browser.close();
    return capturedToken;
    
  } catch (error) {
    console.error('Chrome login error:', error);
    if (browser) {
      await browser.close();
    }
    return null;
  }
}

app.post('/api/set-email', requireAuth, (req, res) => {
  const { email } = req.body;
  const sessionId = req.session.id;
  
  if (!bidSessions.has(sessionId)) {
    bidSessions.set(sessionId, {});
  }
  
  bidSessions.get(sessionId).email = email;
  
  // Save to config
  const config = loadConfig();
  config[sessionId] = { email };
  saveConfig(config);
  
  res.json({ success: true });
});

app.get('/api/get-email', requireAuth, (req, res) => {
  const sessionId = req.session.id;
  const userSession = bidSessions.get(sessionId) || {};
  const config = loadConfig();
  const email = config.globalEmail || userSession.email || '';
  
  res.json({ email });
});

// Store OTP session data temporarily
const otpSessions = new Map();

app.post('/api/authenticate-chrome', requireAuth, async (req, res) => {
  const { email } = req.body;
  const sessionId = req.session.id;
  
  try {
    // Generate a unique OTP session ID
    const otpSessionId = Math.random().toString(36).substring(7);
    
    // Start Chrome login process
    const otpPromise = new Promise((resolve) => {
      otpSessions.set(otpSessionId, { resolve, email });
    });
    
    // Start Chrome automation in background
    performChromeLogin(email, () => otpPromise).then(token => {
      if (token) {
        if (!bidSessions.has(sessionId)) {
          bidSessions.set(sessionId, {});
        }
        
        bidSessions.get(sessionId).authToken = token;
        bidSessions.get(sessionId).email = email;
        
        // Save to config globally
        const config = loadConfig();
        config.globalAuthToken = token;
        config.globalEmail = email;
        saveConfig(config);
        
        // Clean up OTP session
        otpSessions.delete(otpSessionId);
      }
    }).catch(error => {
      console.error('Chrome automation error:', error);
      otpSessions.delete(otpSessionId);
    });
    
    // Return OTP session ID to frontend
    res.json({ success: true, otpSessionId, message: 'OTP sent. Please check your email.' });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Submit OTP endpoint
app.post('/api/submit-otp', requireAuth, async (req, res) => {
  const { otpSessionId, otp } = req.body;
  
  const otpSession = otpSessions.get(otpSessionId);
  if (!otpSession) {
    return res.status(400).json({ error: 'Invalid OTP session' });
  }
  
  // Resolve the OTP promise with the provided OTP
  otpSession.resolve(otp);
  
  // Wait a bit for the Chrome automation to complete
  setTimeout(async () => {
    // Check if authentication was successful
    const config = loadConfig();
    if (config.globalAuthToken) {
      res.json({ success: true, message: 'Authentication successful' });
    } else {
      res.status(400).json({ error: 'Authentication failed. Please try again.' });
    }
  }, 5000); // Wait 5 seconds for Chrome automation to complete
});

// Direct token input endpoint
app.post('/api/set-auth-token', requireAuth, (req, res) => {
  let { authToken } = req.body;
  const sessionId = req.session.id;
  
  // Strip "Bearer " prefix if present
  if (authToken && authToken.startsWith('Bearer ')) {
    authToken = authToken.substring(7);
    console.log('[SET TOKEN] Stripped "Bearer " prefix from token');
  }
  
  if (!bidSessions.has(sessionId)) {
    bidSessions.set(sessionId, {});
  }
  
  bidSessions.get(sessionId).authToken = authToken;
  
  // Save to config globally
  const config = loadConfig();
  config.globalAuthToken = authToken;
  const saved = saveConfig(config);
  
  console.log('[SET TOKEN] Token saved to config:', saved);
  console.log('[SET TOKEN] Token starts with:', authToken.substring(0, 20) + '...');
  
  // Verify token was saved
  const verifyConfig = loadConfig();
  console.log('[SET TOKEN] Verification - token exists in config:', !!verifyConfig.globalAuthToken);
  
  res.json({ success: true, saved });
});

app.post('/api/save-bids', requireAuth, (req, res) => {
  const { enquiryNumber, bids } = req.body;
  const sessionId = req.session.id;
  
  if (!bidSessions.has(sessionId)) {
    bidSessions.set(sessionId, {});
  }
  
  const userSession = bidSessions.get(sessionId);
  if (!userSession.bids) {
    userSession.bids = {};
  }
  
  userSession.bids[enquiryNumber] = bids;
  
  // Only log when all three price ranges are filled and no monitor is active
  if (bids.low && bids.medium && bids.high && !activeBidMonitors.has(enquiryNumber)) {
    console.log(`All bid prices filled for ${enquiryNumber}. Ready for smart bidding.`);
  }
  
  res.json({ success: true });
});

// Get quote details for bidding
app.get('/api/quotes/:enquiryKey', requireAuth, async (req, res) => {
  const { enquiryKey } = req.params;
  const sessionId = req.session.id;
  const userSession = bidSessions.get(sessionId) || {};
  
  // First check global token, then session token
  const config = loadConfig();
  const authToken = config.globalAuthToken;
  
  if (!authToken) {
    return res.status(401).json({ error: 'GoComet authentication required', needsAuth: true });
  }
  
  try {
    const url = `${API_BASE_URL}/api/v1/vendor/enquiries/${enquiryKey}/quotes`;
    const response = await axios.get(url, { headers: getHeaders(authToken) });
    
    res.json({ quotes: response.data });
  } catch (error) {
    console.error('Error fetching quote details:', error.message);
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      res.status(401).json({ error: 'GoComet authentication expired', needsAuth: true });
    } else {
      res.status(500).json({ error: 'Failed to fetch quote details' });
    }
  }
});

// Submit bid
app.post('/api/submit-bid', requireAuth, async (req, res) => {
  const { quoteId, payload } = req.body;
  const sessionId = req.session.id;
  const userSession = bidSessions.get(sessionId) || {};
  
  // First check global token, then session token
  const config = loadConfig();
  const authToken = config.globalAuthToken;
  
  if (!authToken) {
    return res.status(401).json({ error: 'GoComet authentication required', needsAuth: true });
  }
  
  try {
    const url = `${API_BASE_URL}/api/v1/vendor/quotes/${quoteId}/submit`;
    const response = await axios.put(url, payload, { headers: getHeaders(authToken) });
    
    console.log(`Bid submitted successfully for quote ${quoteId}`);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Error submitting bid:', error.message);
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      res.status(401).json({ error: 'GoComet authentication expired', needsAuth: true });
    } else {
      res.status(500).json({ error: 'Failed to submit bid', details: error.message });
    }
  }
});

// Save market rate for persistence
app.post('/api/save-market-rate', requireAuth, (req, res) => {
  const { enquiryKey, cargoIndex, marketRate } = req.body;
  
  if (!enquiryKey || marketRate <= 0) {
    return res.status(400).json({ error: 'Invalid enquiry key or market rate' });
  }
  
  // Initialize session bids if not exists
  if (!req.session.bids) {
    req.session.bids = {};
  }
  if (!req.session.bids[enquiryKey]) {
    req.session.bids[enquiryKey] = {};
  }
  
  // Save market rate based on cargo type
  if (cargoIndex !== null && cargoIndex !== undefined) {
    // Multi-cargo: save to specific cargo index
    if (!req.session.bids[enquiryKey].cargo) {
      req.session.bids[enquiryKey].cargo = [];
    }
    
    // Find or create cargo entry
    let cargoEntry = req.session.bids[enquiryKey].cargo.find(c => Number(c.cargoIndex) === Number(cargoIndex));
    if (!cargoEntry) {
      cargoEntry = { cargoIndex: Number(cargoIndex) };
      req.session.bids[enquiryKey].cargo.push(cargoEntry);
    }
    
    cargoEntry.marketValue = marketRate;
    console.log(`[SAVE MARKET RATE] Saved multi-cargo market rate ₹${marketRate} for ${enquiryKey} cargo ${cargoIndex}`);
  } else {
    // Single cargo: save to root level
    req.session.bids[enquiryKey].marketValue = marketRate;
    console.log(`[SAVE MARKET RATE] Saved single-cargo market rate ₹${marketRate} for ${enquiryKey}`);
  }
  
  res.json({ success: true });
});

// Start smart bidding monitor
app.post('/api/start-bidding', requireAuth, async (req, res) => {
  const { enquiryKey, enquiryNumber, closingTimestamp, bids } = req.body;
  const sessionId = req.session.id;
  const userSession = bidSessions.get(sessionId) || {};
  
  // First check global token, then session token
  const config = loadConfig();
  const authToken = config.globalAuthToken;
  
  if (!authToken) {
    return res.status(401).json({ error: 'GoComet authentication required', needsAuth: true });
  }
  
  // Validate bid structure based on type
  if (bids.cargo && Array.isArray(bids.cargo)) {
    // Multi-cargo validation
    for (const cargo of bids.cargo) {
      if (!cargo.high || !cargo.medium || !cargo.low) {
        return res.status(400).json({ error: 'All three bid values (high, medium, low) are required for each cargo type' });
      }
    }
  } else {
    // Single cargo validation
    if (!bids.high || !bids.medium || !bids.low) {
      return res.status(400).json({ error: 'All three bid values (high, medium, low) are required' });
    }
  }
  
  // CRITICAL: Check if monitor already exists FIRST
  if (activeBidMonitors.has(enquiryKey)) {
    console.log(`[START-BIDDING] Monitor already exists for ${enquiryKey}, rejecting new request`);
    return res.status(409).json({ error: 'Smart bidding already active for this enquiry' });
  }
  
  // Check global status as well
  const globalStatus = globalBidStatus.get(enquiryKey);
  if (globalStatus && globalStatus.active) {
    console.log(`[START-BIDDING] Global status shows active bidding for ${enquiryKey}, rejecting`);
    return res.status(409).json({ 
      error: 'Smart bidding already active for this enquiry', 
      startedBy: globalStatus.userFullName || globalStatus.startedBy 
    });
  }
  
  console.log(`[START-BIDDING] No existing monitor for ${enquiryKey}, proceeding to create new one`);
  
  // Now it's safe to start a new monitor
  const monitor = startSmartBiddingMonitor({
    enquiryKey,
    enquiryNumber,
    closingTimestamp,
    bids,
    sessionId,
    authToken
  });
  
  // Add user info to monitor
  monitor.startedBy = req.session.user?.username || 'unknown';
  monitor.userFullName = req.session.user?.name || req.session.user?.username || 'Unknown User';
  
  // Set in activeBidMonitors
  activeBidMonitors.set(enquiryKey, monitor);
  console.log(`[START-BIDDING] Started new monitor for ${enquiryKey} by ${monitor.startedBy}`);
  
  // Set global status so other users can see
  const globalStatusData = {
    active: true,
    status: monitor.status,
    currentRank: monitor.currentRank,
    bidsSubmitted: monitor.bidsSubmitted,
    timeRemaining: monitor.timeRemaining,
    startedBy: monitor.startedBy,
    userFullName: monitor.userFullName,
    bids: bids,
    timestamp: new Date().toISOString()
  };
  globalBidStatus.set(enquiryKey, globalStatusData);
  console.log(`[GLOBAL STATUS SET] ${enquiryKey} started by ${monitor.startedBy} (${monitor.userFullName})`)
  
  res.json({ success: true, message: 'Smart bidding monitor started' });
});

// Stop bidding monitor
app.post('/api/stop-bidding', requireAuth, (req, res) => {
  const { enquiryKey } = req.body;
  
  console.log(`[STOP REQUEST] Attempting to stop ${enquiryKey} by ${req.session.user?.username}`);
  
  const monitor = activeBidMonitors.get(enquiryKey);
  if (monitor) {
    // Set status to stopped first
    monitor.status = 'stopped';
    
    // Clear all intervals and timeouts
    if (monitor.intervalId) {
      clearInterval(monitor.intervalId);
      console.log(`[STOP] Cleared main interval for ${enquiryKey}`);
    }
    if (monitor.timeoutId) {
      clearTimeout(monitor.timeoutId);
      console.log(`[STOP] Cleared timeout for ${enquiryKey}`);
    }
    if (monitor.timeSyncIntervalId) {
      clearInterval(monitor.timeSyncIntervalId);
      console.log(`[STOP] Cleared time sync interval for ${enquiryKey}`);
    }
    
    // Delete from all maps
    activeBidMonitors.delete(enquiryKey);
    bidSubmissionCache.delete(enquiryKey);
    
    // Update global status to show it's stopped but preserve bid data for UI display
    const currentStatus = globalBidStatus.get(enquiryKey) || {};
    
    // Preserve bid data in user session before clearing global status
    if (currentStatus.bids) {
      if (!req.session.bids) {
        req.session.bids = {};
      }
      req.session.bids[enquiryKey] = currentStatus.bids;
      console.log(`[STOP] Preserved bid data in user session for ${enquiryKey}:`, JSON.stringify(currentStatus.bids, null, 2));
    }
    
    globalBidStatus.set(enquiryKey, {
      ...currentStatus,
      active: false,
      status: 'stopped',
      stoppedBy: req.session.user?.username,
      timestamp: new Date().toISOString(),
      // Preserve bid data for UI display even when stopped
      bids: currentStatus.bids || null
    });
    
    // Delete global status after a short delay to ensure UI updates
    setTimeout(() => {
      globalBidStatus.delete(enquiryKey);
      console.log(`[STOP] Removed global status for ${enquiryKey}`);
    }, 1000);
    
    console.log(`[STOP] Successfully stopped monitor for ${enquiryKey}`);
    console.log(`[STOP] Active monitors remaining: ${activeBidMonitors.size}`);
    console.log(`[STOP] Global statuses remaining: ${globalBidStatus.size}`);
  } else {
    console.log(`[STOP] No monitor found for ${enquiryKey}, checking global status...`);
    
    // Even if no local monitor, update global status
    if (globalBidStatus.has(enquiryKey)) {
      const currentStatus = globalBidStatus.get(enquiryKey) || {};
      
      // Preserve bid data in user session before clearing global status
      if (currentStatus.bids) {
        if (!req.session.bids) {
          req.session.bids = {};
        }
        req.session.bids[enquiryKey] = currentStatus.bids;
        console.log(`[STOP] Preserved bid data in user session for ${enquiryKey}:`, JSON.stringify(currentStatus.bids, null, 2));
      }
      
      globalBidStatus.set(enquiryKey, {
        ...currentStatus,
        active: false,
        status: 'stopped',
        stoppedBy: req.session.user?.username,
        timestamp: new Date().toISOString(),
        // Preserve bid data for UI display even when stopped
        bids: currentStatus.bids || null
      });
      
      setTimeout(() => {
        globalBidStatus.delete(enquiryKey);
        console.log(`[STOP] Removed global status for ${enquiryKey}`);
      }, 1000);
    }
  }
  
  res.json({ success: true, message: 'Bidding monitor stopped' });
});

// Get logs
app.get('/api/logs/bids', requireAuth, (req, res) => {
  try {
    const bids = logger.getTodaysBids();
    res.json({ success: true, bids });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bid logs' });
  }
});

app.get('/api/logs/errors', requireAuth, (req, res) => {
  try {
    const errors = logger.getTodaysErrors();
    res.json({ success: true, errors });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch error logs' });
  }
});

// Get bidding status
app.get('/api/bidding-status/:enquiryKey', requireAuth, (req, res) => {
  const { enquiryKey } = req.params;
  const monitor = activeBidMonitors.get(enquiryKey);
  const globalStatus = globalBidStatus.get(enquiryKey);
  
  console.log(`[STATUS CHECK] ${enquiryKey}: Monitor exists: ${!!monitor}, Global status exists: ${!!globalStatus}`);
  console.log(`[STATUS CHECK] Current user: ${req.session.user?.username}`);
  
  if (!monitor && !globalStatus) {
    return res.json({ active: false });
  }
  
  // Always prefer monitor status if it exists
  if (monitor) {
    const status = {
      active: true,
      status: monitor.status,
      currentRank: monitor.currentRank,
      bidsSubmitted: monitor.bidsSubmitted,
      timeRemaining: monitor.timeRemaining,
      startedBy: monitor.startedBy || 'unknown',
      userFullName: monitor.userFullName || globalStatus?.userFullName || 'Unknown',
      bids: globalStatus?.bids || {}
    };
    console.log(`[STATUS CHECK] Returning monitor status for ${enquiryKey}`);
    return res.json(status);
  }
  
  // Return global status if no local monitor
  console.log(`[STATUS CHECK] Returning global status for ${enquiryKey}`);
  return res.json(globalStatus);
});

// Get all active bidding statuses
app.get('/api/bidding-status/all', requireAuth, (req, res) => {
  const allStatuses = {};
  
  console.log(`[ALL STATUS] Active monitors: ${activeBidMonitors.size}, Global statuses: ${globalBidStatus.size}`);
  
  // First add all global statuses
  for (const [key, status] of globalBidStatus) {
    if (status.active) {
      allStatuses[key] = status;
    }
  }
  
  // Then update with local monitor data if available (more recent)
  for (const [key, monitor] of activeBidMonitors) {
    const globalData = globalBidStatus.get(key) || {};
    allStatuses[key] = {
      active: true,
      status: monitor.status,
      currentRank: monitor.currentRank,
      bidsSubmitted: monitor.bidsSubmitted,
      timeRemaining: monitor.timeRemaining,
      startedBy: monitor.startedBy || 'unknown',
      userFullName: monitor.userFullName || globalData.userFullName || 'Unknown',
      bids: globalData.bids || {}
    };
  }
  
  console.log(`[ALL STATUS] Returning ${Object.keys(allStatuses).length} active statuses`);
  res.json({ statuses: allStatuses });
});

// Admin middleware
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// User management endpoints
app.get('/api/users', requireAdmin, (req, res) => {
  const userList = Object.entries(users).map(([username, data]) => ({
    username,
    name: data.name,
    isAdmin: data.isAdmin || false
  }));
  res.json({ users: userList });
});

// ===== Admin: Pricing percentage settings =====
app.get('/api/settings/pricing', requireAdmin, (req, res) => {
  const cfg = loadConfig();
  const pricePercents = cfg.pricePercents || { high: 9, medium: 7, low: 5 };
  res.json({ pricePercents });
});

app.put('/api/settings/pricing', requireAdmin, (req, res) => {
  try {
    const { high, medium, low } = req.body || {};
    const parsed = {
      high: Number(high),
      medium: Number(medium),
      low: Number(low)
    };
    // Basic validation
    for (const [k, v] of Object.entries(parsed)) {
      if (!Number.isFinite(v)) return res.status(400).json({ error: `Invalid value for ${k}` });
      if (v < 0 || v > 100) return res.status(400).json({ error: `${k} must be between 0 and 100` });
    }
    const cfg = loadConfig();
    cfg.pricePercents = parsed;
    const ok = saveConfig(cfg);
    if (!ok) return res.status(500).json({ error: 'Failed to save settings' });
    res.json({ success: true, pricePercents: cfg.pricePercents });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { username, name, password, isAdmin } = req.body;
  
  if (!username || !name || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  if (users[username]) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  
  users[username] = {
    password,
    name,
    isAdmin: isAdmin || false
  };
  
  if (saveUsers()) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to save user' });
  }
});

app.delete('/api/users/:username', requireAdmin, (req, res) => {
  const { username } = req.params;
  
  if (!users[username]) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (users[username].isAdmin) {
    return res.status(403).json({ error: 'Cannot remove admin users' });
  }
  
  delete users[username];
  
  if (saveUsers()) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

app.put('/api/users/:username/password', requireAdmin, (req, res) => {
  const { username } = req.params;
  const { newPassword } = req.body;
  
  if (!users[username]) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required' });
  }
  
  users[username].password = newPassword;
  
  if (saveUsers()) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// Change own password
app.post('/api/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const username = req.session.user.username;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both passwords are required' });
  }
  
  if (users[username].password !== currentPassword) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  
  users[username].password = newPassword;
  
  if (saveUsers()) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// Smart Bidding Monitor Function
function startSmartBiddingMonitor(config) {
  const { enquiryKey, enquiryNumber, closingTimestamp, bids, sessionId, authToken } = config;
  
  const monitor = {
    enquiryKey: enquiryKey, // Store enquiry key to ensure isolation
    intervalId: null,
    timeoutId: null,
    timeSyncIntervalId: null, // Store time sync interval ID
    status: 'waiting',
    currentRank: null,
    bidsSubmitted: 0,
    timeRemaining: null,
    lastBidPrice: null,
    lastBidTime: null,
    revisionsLeft: 3,
    bidInProgress: false,
    submittedBidTypes: new Set(),
    pollingRate: null,
    cachedQuote: null,
    lastQuoteFetch: 0
  };
  
  // Calculate time until closing with millisecond precision
  const closingTime = new Date(closingTimestamp).getTime();
  
  // Sync with server time
  let serverTimeOffset = 0;
  
  // Function to sync time with server - CRITICAL for accuracy
  async function syncServerTime() {
    try {
      const syncStart = Date.now();
      const biddingData = await fetchBiddingData();
      const syncEnd = Date.now();
      const networkLatency = (syncEnd - syncStart) / 2; // Estimate one-way latency
      
      if (biddingData && biddingData.bid_closing_in) {
        const serverRemainingMs = biddingData.bid_closing_in * 1000;
        const localRemainingMs = closingTime - syncEnd;
        serverTimeOffset = localRemainingMs - serverRemainingMs - networkLatency;
        console.log(`[TIME SYNC] ${enquiryKey}: Server offset ${serverTimeOffset}ms (latency: ${networkLatency}ms)`);
        
        // If offset is significant, log a warning
        if (Math.abs(serverTimeOffset) > 1000) {
          console.warn(`[TIME SYNC] ${enquiryKey}: Large time offset detected: ${serverTimeOffset}ms`);
        }
      }
    } catch (error) {
      console.error('Failed to sync time with server:', error);
    }
  }
  
  // Initial time sync
  syncServerTime();
  
  // Re-sync periodically for accuracy
  monitor.timeSyncIntervalId = setInterval(() => {
    if (monitor.status !== 'closed' && monitor.status !== 'timeout') {
      syncServerTime();
    }
  }, 30000); // Re-sync every 30 seconds
  
  // Function to fetch current bidding data
  async function fetchBiddingData() {
    try {
      const biddingUrl = `${API_BASE_URL}/api/v1/vendor/enquiries/${enquiryKey}/bidding-data`;
      const response = await axios.get(biddingUrl, { headers: getHeaders(authToken) });
      
      // Make sure we're updating the correct monitor's rank
      if (monitor.enquiryKey === enquiryKey) {
        monitor.currentRank = response.data.vendor_rank !== undefined && response.data.vendor_rank !== null ? response.data.vendor_rank : null;
        monitor.revisionsLeft = response.data.revisions_left !== undefined ? response.data.revisions_left : 3; // Default to 3 if undefined
        monitor.timeRemaining = response.data.bid_closing_in || 0;
        
        // Update cache to prevent glitches
        if (monitor.currentRank !== null) {
          quoteRankCache.set(enquiryKey, monitor.currentRank);
        }
        
        // Log the rank for debugging
        console.log(`${enquiryKey}: Fetched rank ${monitor.currentRank}, revisions ${monitor.revisionsLeft} from bidding data`);
        
        // Update global status with latest data
        updateGlobalStatus(enquiryKey, monitor);
      } else {
        console.error(`Monitor mismatch! Expected ${enquiryKey} but monitor is for ${monitor.enquiryKey}`);
      }
      
      return response.data;
    } catch (error) {
      logger.logError(`Fetching bidding data for ${enquiryKey}`, error);
      return null;
    }
  }
  
  // Function to fetch quote details with caching
  async function fetchQuoteDetails(forceRefresh = false) {
    try {
      const now = Date.now();
      // Use cache if available and less than 5 seconds old (unless forced)
      if (!forceRefresh && monitor.cachedQuote && (now - monitor.lastQuoteFetch) < 5000) {
        return monitor.cachedQuote;
      }
      
      const url = `${API_BASE_URL}/api/v1/vendor/enquiries/${enquiryKey}/quotes`;
      const response = await axios.get(url, { headers: getHeaders(authToken) });
      
      if (response.data && response.data.length > 0) {
        monitor.cachedQuote = response.data[0];
        monitor.lastQuoteFetch = now;
        return response.data[0]; // Get first quote (should be our quote)
      }
      return null;
    } catch (error) {
      logger.logError(`Fetching quote details for ${enquiryKey}`, error);
      return null;
    }
  }
  
  // Function to prepare bid payload with proper unit handling
  function prepareBidPayload(quote, bidPrice, cargoSpecificPrices = null) {
    try {
      // Check if freight charges exist
      const freightCharges = quote.charges_list?.['11_freight_charges'];
      if (!freightCharges) {
        console.error('No freight charges found in quote');
        return null;
      }
      
      // Find all freight charge keys (there might be multiple for different container types)
      const chargeKeys = Object.keys(freightCharges).filter(key => 
        key.startsWith('freight_charges_custom_charge') && key !== 'display_name'
      );
      
      if (chargeKeys.length === 0) {
        console.error('No freight charge keys found');
        return null;
      }
      
      console.log(`[PREPARE BID] Found ${chargeKeys.length} freight charges:`, chargeKeys);
      
      // Get charge details
      const chargeDetails = [];
      for (let i = 0; i < chargeKeys.length; i++) {
        const chargeKey = chargeKeys[i];
        const charge = freightCharges[chargeKey];
        const units = Number(charge.units) || 0;
        chargeDetails.push({
          key: chargeKey,
          units: units,
          unitName: charge.unit_name || 'UNKNOWN',
          displayName: charge.display_name || chargeKey,
          index: i
        });
        console.log(`[PREPARE BID] ${chargeKey}: ${units} units (${charge.unit_name})`);
      }
      
      // Create updated quote
      const updatedQuote = JSON.parse(JSON.stringify(quote));
      
      if (cargoSpecificPrices && Array.isArray(cargoSpecificPrices)) {
        // Multi-cargo pricing: Use specific price for each cargo type
        console.log(`[PREPARE BID] Using cargo-specific prices for ${chargeDetails.length} cargo types`);
        
        for (const detail of chargeDetails) {
          const cargoPrice = cargoSpecificPrices.find(cp => Number(cp.cargoIndex) === detail.index);
          if (cargoPrice) {
            console.log(`[PREPARE BID] ${detail.key}: Setting unit price ₹${cargoPrice.price} per unit (${detail.units} total units)`);
            updatedQuote.charges_list['11_freight_charges'][detail.key].price = String(cargoPrice.price);
          } else {
            console.error(`[PREPARE BID] No price found for cargo index ${detail.index}`);
            return null;
          }
        }
      } else {
        // Single cargo pricing: Use uniform price per unit across all charges
        console.log(`[PREPARE BID] Using uniform price per unit: ₹${bidPrice}`);
        
        if (chargeKeys.length === 1) {
          // Single charge type
          const chargeKey = chargeKeys[0];
          const units = chargeDetails[0].units;
          
          console.log(`[PREPARE BID] Single charge: ${chargeKey}, setting unit price ₹${bidPrice} per unit (${units} total units)`);
          updatedQuote.charges_list['11_freight_charges'][chargeKey].price = String(bidPrice);
        } else {
          // Multiple charge types - use same unit price for all
          for (const detail of chargeDetails) {
            console.log(`[PREPARE BID] ${detail.key}: setting unit price ₹${bidPrice} per unit (${detail.units} total units)`);
            updatedQuote.charges_list['11_freight_charges'][detail.key].price = String(bidPrice);
          }
        }
      }
      
      return { quote: updatedQuote };
    } catch (error) {
      console.error('Error preparing bid payload:', error);
      return null;
    }
  }
  
  // Function to submit bid with retry logic and duplicate prevention
  async function submitBidWithRetry(bidPrice, bidType, maxRetries = 2) {
    // Prevent duplicate submissions
    if (monitor.bidInProgress || monitor.submittedBidTypes.has(bidType)) {
      console.log(`${bidType} bid already submitted or in progress for ${enquiryKey}`);
      return false;
    }
    
    monitor.bidInProgress = true;
    let retryCount = 0;
    let success = false;
    
    try {
      while (retryCount <= maxRetries) {
        success = await submitBid(bidPrice, bidType, retryCount);
        if (success) {
          monitor.submittedBidTypes.add(bidType);
          break;
        }
        
        retryCount++;
        if (retryCount <= maxRetries) {
          console.log(`Retrying ${bidType} bid (attempt ${retryCount + 1}/${maxRetries + 1})...`);
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between retries
        }
      }
    } finally {
      monitor.bidInProgress = false;
    }
    
    return success;
  }
  
  // Function to submit bid - optimized for speed
  async function submitBid(bidPrice, bidType, retryCount = 0) {
    const startTime = Date.now();
    let quote = null; // Define quote outside try block
    
    try {
      // Get quote details (use cache if recent)
      quote = await fetchQuoteDetails(retryCount > 0); // Force refresh on retry
      if (!quote) {
        console.error('Failed to fetch quote details for bidding');
        return false;
      }
      
      // Prepare payload with cargo-specific pricing support
      let cargoSpecificPrices = null;
      if (bids.cargo && Array.isArray(bids.cargo)) {
        // Multi-cargo pricing: extract prices for this bid type
        cargoSpecificPrices = bids.cargo.map(cargo => ({
          cargoIndex: cargo.cargoIndex,
          price: cargo[bidType.toLowerCase()]
        }));
      }
      
      const payload = prepareBidPayload(quote, bidPrice, cargoSpecificPrices);
      if (!payload) {
        console.error('Failed to prepare bid payload');
        return false;
      }
      
      // Submit bid ASAP
      const url = `${API_BASE_URL}/api/v1/vendor/quotes/${quote.id}/submit`;
      const response = await axios.put(url, payload, { 
        headers: getHeaders(authToken),
        timeout: 5000 // 5 second timeout for faster failure
      });
      
      const elapsed = Date.now() - startTime;
      
      // Calculate time to closing for logging
      const now = Date.now();
      const adjustedClosingTime = closingTime - serverTimeOffset;
      const timeToClosing = adjustedClosingTime - now;
      
      // Log successful bid with timing details and user info
      logger.logBid(enquiryKey, bidType, bidPrice, timeToClosing, monitor.currentRank, true, elapsed, {
        revisionsLeft: monitor.revisionsLeft,
        bidsSubmitted: monitor.bidsSubmitted + 1,
        startedBy: monitor.startedBy,
        userFullName: monitor.userFullName
      });
      
      monitor.bidsSubmitted++;
      monitor.lastBidPrice = bidPrice;
      monitor.status = `${bidType} bid submitted`;
      
      // Update global status
      updateGlobalStatus(enquiryKey, monitor);
      
      // Force refresh quote cache after bid
      fetchQuoteDetails(true); // Don't await, let it run in background
      
      return true;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      
      // Calculate time to closing for logging
      const now = Date.now();
      const adjustedClosingTime = closingTime - serverTimeOffset;
      const timeToClosing = adjustedClosingTime - now;
      
      // Log failed bid with error details and user info
      logger.logBid(enquiryKey, bidType, bidPrice, timeToClosing, monitor.currentRank, false, elapsed, {
        error: error.message,
        retryCount: retryCount,
        startedBy: monitor.startedBy,
        userFullName: monitor.userFullName
      });
      
      // Log detailed error
      logger.logError(`Bid submission for ${enquiryKey}`, error, {
        enquiryKey,
        bidType,
        bidPrice,
        quoteId: quote?.id
      });
      
      return false;
    }
  }
  
  // Pre-fetch quote details before the last 10 seconds
  async function preFetchQuoteDetails() {
    if (monitor.status === 'preparing') {
      const now = Date.now();
      const timeUntilClosing = closingTime - now;
      const secondsRemaining = Math.floor(timeUntilClosing / 1000);
      
      // Pre-fetch quote details at 15 seconds to warm up cache
      if (secondsRemaining <= 15 && secondsRemaining > 10) {
        fetchQuoteDetails(true); // Don't await
      }
    }
  }
  
  // Main monitoring logic
  async function checkAndBid() {
    // CRITICAL: Check if this monitor still exists in activeBidMonitors
    if (!activeBidMonitors.has(enquiryKey) || monitor.status === 'stopped') {
      console.log(`[MONITOR] ${enquiryKey} has been stopped, terminating checkAndBid`);
      clearInterval(monitor.intervalId);
      clearTimeout(monitor.timeoutId);
      if (monitor.timeSyncIntervalId) {
        clearInterval(monitor.timeSyncIntervalId);
      }
      return;
    }
    
    const now = Date.now();
    const adjustedClosingTime = closingTime - serverTimeOffset;
    const timeUntilClosing = adjustedClosingTime - now;
    const secondsRemaining = Math.floor(timeUntilClosing / 1000);
    const msRemaining = timeUntilClosing;
    
    // Pre-fetch quote details if approaching last 10 seconds
    if (secondsRemaining <= 15 && secondsRemaining > 10) {
      preFetchQuoteDetails();
    }
    
    // Fetch current bidding data
    const biddingData = await fetchBiddingData();
    if (!biddingData) return;
    
    // If we're in the last 10 seconds
    if (secondsRemaining <= 10 && secondsRemaining > 0) {
      monitor.status = 'active_bidding';
      
      // Switch to ultra-fast polling in last 10 seconds
      if (monitor.intervalId && monitor.pollingRate !== 200) {
        clearInterval(monitor.intervalId);
        monitor.intervalId = setInterval(checkAndBid, 200); // Check every 0.2 seconds for better precision
        monitor.pollingRate = 200;
      }
      
      // AGGRESSIVE BID TIMING LOGIC - Using milliseconds for precision
      const now = Date.now();
      
      // Determine bid prices based on single or multi-cargo structure
      let highPrice, mediumPrice, lowPrice;
      if (bids.cargo && Array.isArray(bids.cargo)) {
        // Multi-cargo: use first cargo type's prices for timing decisions (all should have same relative values)
        const primaryCargo = bids.cargo[0];
        highPrice = primaryCargo.high;
        mediumPrice = primaryCargo.medium;
        lowPrice = primaryCargo.low;
      } else {
        // Single cargo: use direct prices
        highPrice = bids.high;
        mediumPrice = bids.medium;
        lowPrice = bids.low;
      }
      
      // HIGH bid: Submit ASAP when we hit 9 seconds or less
      if (!monitor.submittedBidTypes.has('HIGH') && monitor.revisionsLeft > 0) {
        if (secondsRemaining <= 9) {
          console.log(`${enquiryKey}: Submitting HIGH bid at ${secondsRemaining}s (${msRemaining}ms) remaining`);
          monitor.lastBidTime = now;
          await submitBidWithRetry(highPrice, 'HIGH');
          
          // Force immediate rank check after HIGH bid
          await fetchBiddingData();
        }
      }
      
      // MEDIUM bid: Submit if we're not rank 1 and have time (but save LOW for last 2s)
      if (!monitor.submittedBidTypes.has('MEDIUM') && monitor.revisionsLeft > 0 && (monitor.currentRank === null || monitor.currentRank !== 1)) {
        // Submit MEDIUM if we have more than 2 seconds left OR if we're in last 2s but need to act fast
        if (secondsRemaining > 2 || (secondsRemaining <= 2 && monitor.submittedBidTypes.has('HIGH'))) {
          console.log(`${enquiryKey}: Not rank 1 (current: ${monitor.currentRank}), submitting MEDIUM bid at ${secondsRemaining}s (${msRemaining}ms) remaining`);
          monitor.lastBidTime = now;
          await submitBidWithRetry(mediumPrice, 'MEDIUM');
          
          // Force immediate rank check after MEDIUM bid
          await fetchBiddingData();
        }
      }
      
      // LOW bid: Submit in last 2 seconds if still not rank 1 - ULTRA AGGRESSIVE
      if (!monitor.submittedBidTypes.has('LOW') && monitor.revisionsLeft > 0 && (monitor.currentRank === null || monitor.currentRank !== 1)) {
        if (msRemaining <= 2000) { // Last 2000ms (2 seconds)
          console.log(`${enquiryKey}: URGENT - Still not rank 1 (current: ${monitor.currentRank}), submitting LOW bid at ${msRemaining}ms remaining`);
          monitor.lastBidTime = now;
          await submitBidWithRetry(lowPrice, 'LOW');
        }
      }
      
      // Log status periodically
      if (monitor.currentRank === 1 && monitor.bidsSubmitted > 0) {
        if (Math.floor(msRemaining / 1000) % 2 === 0 && monitor.lastStatusLog !== Math.floor(msRemaining / 1000)) {
          console.log(`${enquiryKey}: Rank 1 maintained. ${Math.floor(msRemaining / 1000)}s remaining`);
          monitor.lastStatusLog = Math.floor(msRemaining / 1000);
        }
      }
    }
    // If we're more than 1 minute away, check every 30 seconds
    else if (secondsRemaining > 60) {
      monitor.status = 'monitoring';
      // Clear frequent interval and set slower one
      if (monitor.intervalId && monitor.pollingRate !== 30000) {
        clearInterval(monitor.intervalId);
        monitor.intervalId = setInterval(checkAndBid, 30000); // Check every 30 seconds
        monitor.pollingRate = 30000;
      }
    }
    // If we're within 1 minute, check every second
    else if (secondsRemaining <= 60 && secondsRemaining > 10) {
      monitor.status = 'preparing';
      // Clear slow interval and set fast one
      if (monitor.intervalId && monitor.pollingRate !== 1000) {
        clearInterval(monitor.intervalId);
        monitor.intervalId = setInterval(checkAndBid, 1000); // Check every second
        monitor.pollingRate = 1000;
      }
    }
    
    // If bidding has closed
    if (secondsRemaining <= 0) {
      monitor.status = 'closed';
      clearInterval(monitor.intervalId);
      clearTimeout(monitor.timeoutId);
      
      // Clean up after 5 minutes
      setTimeout(() => {
        console.log(`[CLEANUP] Removing monitor and status for ${enquiryKey}`);
        if (monitor.timeSyncIntervalId) {
          clearInterval(monitor.timeSyncIntervalId); // Clear time sync interval
        }
        activeBidMonitors.delete(enquiryKey);
        bidSubmissionCache.delete(enquiryKey);
        globalBidStatus.delete(enquiryKey);
      }, 300000);
    }
  }
  
  // Start monitoring
  checkAndBid();
  
  // Set initial interval based on time remaining
  const initialTimeRemaining = Math.floor((closingTime - Date.now()) / 1000);
  if (initialTimeRemaining > 60) {
    monitor.intervalId = setInterval(checkAndBid, 30000); // Check every 30 seconds
  } else {
    monitor.intervalId = setInterval(checkAndBid, 1000); // Check every second
  }
  
  // Set timeout to stop monitoring after closing time + 1 minute
  monitor.timeoutId = setTimeout(() => {
    clearInterval(monitor.intervalId);
    monitor.status = 'timeout';
  }, closingTime - Date.now() + 60000);
  
  return monitor;
}

// Helper function to update global status
function updateGlobalStatus(enquiryKey, monitor) {
  const currentStatus = globalBidStatus.get(enquiryKey) || {};
  const updatedStatus = {
    ...currentStatus,
    active: true,
    status: monitor.status,
    currentRank: monitor.currentRank,
    bidsSubmitted: monitor.bidsSubmitted,
    timeRemaining: monitor.timeRemaining,
    startedBy: monitor.startedBy || currentStatus.startedBy || 'unknown',
    userFullName: monitor.userFullName || currentStatus.userFullName || 'Unknown',
    bids: currentStatus.bids || {},
    lastUpdated: new Date().toISOString()
  };
  globalBidStatus.set(enquiryKey, updatedStatus);
  console.log(`[GLOBAL UPDATE] ${enquiryKey} - Status: ${updatedStatus.status}, Rank: ${updatedStatus.currentRank}`);
}

// Debug endpoint to check system state
app.get('/api/debug/status', requireAuth, (req, res) => {
  const debugInfo = {
    activeBidMonitors: Array.from(activeBidMonitors.entries()).map(([key, monitor]) => ({
      key,
      status: monitor.status,
      currentRank: monitor.currentRank,
      bidsSubmitted: monitor.bidsSubmitted,
      startedBy: monitor.startedBy,
      userFullName: monitor.userFullName
    })),
    globalBidStatus: Array.from(globalBidStatus.entries()).map(([key, status]) => ({
      key,
      ...status
    })),
    currentUser: req.session.user
  };
  
  console.log('[DEBUG] System state:', JSON.stringify(debugInfo, null, 2));
  res.json(debugInfo);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Access from this machine: http://localhost:${PORT}`);
  console.log(`Access from network: http://<your-ip>:${PORT}`);
  
  // Check config on startup
  const config = loadConfig();
  console.log('[STARTUP] Initial config check - has token:', !!config.globalAuthToken);
});