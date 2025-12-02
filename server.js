
// Helper functions for DB
async function getConfig() {
  try {
    const res = await pool.query('SELECT * FROM system_config LIMIT 1');
    return res.rows[0] || {};
  } catch (e) {
    console.error('Error fetching config:', e);
    return {};
  }
}

async function saveConfigToDb(config) {
  try {
    const { globalAuthToken, globalEmail } = config;
    await pool.query(
      'INSERT INTO system_config (id, global_auth_token, global_email) VALUES (1, $1, $2) ON CONFLICT (id) DO UPDATE SET global_auth_token = $1, global_email = $2',
      [globalAuthToken, globalEmail]
    );
    return true;
  } catch (e) {
    console.error('Error saving config:', e);
    return false;
  }
}

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
  // Allow for now to avoid breaking existing flow, but ideally check session
  next();
}

// Routes
app.get('/', async (req, res) => {
  console.log('[ROOT] Session user:', req.session.user);

  const config = await getConfig();
  const authToken = config.globalAuthToken;

  let enquiryData = null;
  let meta = {};

  if (enquiryKey && authToken) {
    try {
      const directUrl = `${API_BASE_URL}/api/v1/vendor/enquiries/${enquiryKey}`;
      const directRes = await axios.get(directUrl, { headers: getHeaders(authToken) });
      enquiryData = directRes.data;
    } catch (e) {
      console.log('Error fetching enquiry:', e.message);
    }
  }

  if (enquiryData) {
    meta = {
      enquiry_number: enquiryData.key || enquiryKey,
      status: enquiryData.status,
      origin: enquiryData.origin,
      destination: enquiryData.destination,
    };
  }

  const globalStatus = globalBidStatus.get(enquiryKey);
  const hasActiveBidding = activeBidMonitors.has(enquiryKey) || (globalStatus && globalStatus.active);

  res.json({
    message: 'Spot Bidding Server Running',
    enquiryKey,
    hasActiveBidding,
    meta,
    activeBiddingInfo: hasActiveBidding ? {
      status: globalStatus?.status || 'active'
    } : null
  });
});

app.post('/api/authenticate-chrome', requireAuth, async (req, res) => {
  const { email } = req.body;
  const sessionId = req.session.id;

  try {
    const otpSessionId = Math.random().toString(36).substring(7);

    const otpPromise = new Promise((resolve) => {
      otpSessions.set(otpSessionId, { resolve, email });
    });

    performChromeLogin(email, () => otpPromise).then(async token => {
      if (token) {
        if (!bidSessions.has(sessionId)) {
          bidSessions.set(sessionId, {});
        }

        bidSessions.get(sessionId).authToken = token;
        bidSessions.get(sessionId).email = email;

        const config = await getConfig();
        config.globalAuthToken = token;
        config.globalEmail = email;
        await saveConfigToDb(config);

        otpSessions.delete(otpSessionId);
      }
    }).catch(error => {
      console.error('Chrome automation error:', error);
      otpSessions.delete(otpSessionId);
    });

    res.json({ success: true, otpSessionId, message: 'OTP sent. Please check your email.' });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.post('/api/submit-otp', requireAuth, async (req, res) => {
  const { otpSessionId, otp } = req.body;

  const otpSession = otpSessions.get(otpSessionId);
  if (!otpSession) {
    return res.status(400).json({ error: 'Invalid OTP session' });
  }

  otpSession.resolve(otp);

  setTimeout(async () => {
    const config = await getConfig();
    if (config.globalAuthToken) {
      res.json({ success: true, message: 'Authentication successful' });
    } else {
      res.status(400).json({ error: 'Authentication failed. Please try again.' });
    }
  }, 5000);
});

app.post('/api/set-auth-token', requireAuth, async (req, res) => {
  let { authToken } = req.body;
  const sessionId = req.session.id;

  if (authToken && authToken.startsWith('Bearer ')) {
    authToken = authToken.substring(7);
  }

  if (!bidSessions.has(sessionId)) {
    bidSessions.set(sessionId, {});
  }

  bidSessions.get(sessionId).authToken = authToken;

  const config = await getConfig();
  config.globalAuthToken = authToken;
  await saveConfigToDb(config);

  res.json({ success: true });
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
  res.json({ success: true });
});

app.get('/api/quotes/:enquiryKey', requireAuth, async (req, res) => {
  const { enquiryKey } = req.params;
  const config = await getConfig();
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
    res.status(500).json({ error: 'Failed to fetch quote details' });
  }
});

app.post('/api/submit-bid', requireAuth, async (req, res) => {
  const { quoteId, payload } = req.body;
  const config = await getConfig();
  const authToken = config.globalAuthToken;

  if (!authToken) {
    return res.status(401).json({ error: 'GoComet authentication required', needsAuth: true });
  }

  try {
    const url = `${API_BASE_URL}/api/v1/vendor/quotes/${quoteId}/submit`;
    const response = await axios.put(url, payload, { headers: getHeaders(authToken) });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Error submitting bid:', error.message);
    res.status(500).json({ error: 'Failed to submit bid', details: error.message });
  }
});

app.post('/api/save-market-rate', requireAuth, (req, res) => {
  const { enquiryKey, cargoIndex, marketRate } = req.body;

  if (!req.session.bids) {
    req.session.bids = {};
  }
  if (!req.session.bids[enquiryKey]) {
    req.session.bids[enquiryKey] = {};
  }

  if (cargoIndex !== null && cargoIndex !== undefined) {
    if (!req.session.bids[enquiryKey].cargo) {
      req.session.bids[enquiryKey].cargo = [];
    }
    let cargoEntry = req.session.bids[enquiryKey].cargo.find(c => Number(c.cargoIndex) === Number(cargoIndex));
    if (!cargoEntry) {
      cargoEntry = { cargoIndex: Number(cargoIndex) };
      req.session.bids[enquiryKey].cargo.push(cargoEntry);
    }
    cargoEntry.marketValue = marketRate;
  } else {
    req.session.bids[enquiryKey].marketValue = marketRate;
  }

  res.json({ success: true });
});

app.post('/api/start-bidding', requireAuth, async (req, res) => {
  const { enquiryKey: key } = req.body;
  if (!key) return res.status(400).json({ error: 'Enquiry key required' });

  enquiryKey = key;

  if (activeBidMonitors.has(key)) {
    return res.json({ success: true, message: 'Bidding already active' });
  }

  startSmartBiddingMonitor(key);
  res.json({ success: true, message: 'Bidding started' });
});

app.post('/api/stop-bidding', requireAuth, async (req, res) => {
  const { enquiryKey: key } = req.body;

  if (activeBidMonitors.has(key)) {
    const monitor = activeBidMonitors.get(key);
    monitor.status = 'stopped';
    if (monitor.intervalId) clearInterval(monitor.intervalId);
    if (monitor.timeoutId) clearTimeout(monitor.timeoutId);
    activeBidMonitors.delete(key);

    try {
      await pool.query('UPDATE bid_monitors SET status = $1 WHERE enquiry_key = $2', ['stopped', key]);
    } catch (e) {
      console.error('Failed to update monitor status in DB:', e);
    }

    res.json({ success: true, message: 'Bidding stopped' });
  } else {
    res.status(400).json({ error: 'No active bidding for this enquiry' });
  }
});

app.get('/api/bidding-status/:enquiryKey', requireAuth, (req, res) => {
  const { enquiryKey } = req.params;
  const status = globalBidStatus.get(enquiryKey) || { active: false };
  res.json(status);
});

app.get('/api/bidding-status/all', requireAuth, (req, res) => {
  const statuses = Array.from(globalBidStatus.entries()).map(([key, val]) => ({ key, ...val }));
  res.json(statuses);
});

// Chrome automation for login with OTP
async function performChromeLogin(email, otpCallback) {
  console.log('Starting Chrome OTP login process...');
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
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
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');
    await client.send('Page.enable');

    let capturedToken = null;

    client.on('Network.responseReceived', async (params) => {
      const url = params.response.url;
      const status = params.response.status;

      if (url.includes('login.gocomet.com/api/v1/login/otp-login') && status === 200) {
        try {
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

    await page.goto('https://www.gocomet.com/login', { waitUntil: 'networkidle2' });

    await page.waitForSelector('input[type="email"]#email', { timeout: 10000 });
    await page.type('input[type="email"]#email', email);

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('Login with OTP'));
      if (btn) btn.click();
    });

    await page.waitForTimeout(2000);
    const otp = await otpCallback();

    await page.waitForSelector('input#otp_value', { timeout: 10000 });
    await page.type('input#otp_value', otp);

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('Login'));
      if (btn) btn.click();
    });

    await page.waitForFunction(
      () => window.location.href.includes('app.gocomet.com'),
      { timeout: 30000 }
    );

    await page.waitForTimeout(2000);
    await browser.close();
    return capturedToken;

  } catch (error) {
    console.error('Chrome login error:', error);
    if (browser) await browser.close();
    return null;
  }
}

async function startSmartBiddingMonitor(enquiryKey) {
  console.log(`[MONITOR] Starting smart bidding monitor for ${enquiryKey}`);

  const monitor = {
    enquiryKey,
    status: 'active',
    startTime: Date.now(),
    bidsSubmitted: 0,
    errors: 0
  };

  activeBidMonitors.set(enquiryKey, monitor);
  globalBidStatus.set(enquiryKey, { active: true, status: 'active' });

  try {
    await pool.query(
      'INSERT INTO bid_monitors (enquiry_key, status, start_time) VALUES ($1, $2, NOW()) ON CONFLICT (enquiry_key) DO UPDATE SET status = $2, start_time = NOW()',
      [enquiryKey, 'active']
    );
  } catch (e) {
    console.error('Failed to persist monitor to DB:', e);
  }

  const checkAndBid = async () => {
    if (monitor.status !== 'active') return;

    try {
      const config = await getConfig();
      const authToken = config.globalAuthToken;
      if (!authToken) {
        console.log('[MONITOR] No auth token available');
        return;
      }

      const url = `${API_BASE_URL}/api/v1/vendor/enquiries/${enquiryKey}/bidding-data`;
      const response = await axios.get(url, { headers: getHeaders(authToken) });
      const biddingData = response.data;

      console.log(`[MONITOR] Checked bidding data for ${enquiryKey}. Rank: ${biddingData.vendor_rank}`);

      globalBidStatus.set(enquiryKey, {
        active: true,
        status: 'active',
        rank: biddingData.vendor_rank,
        lastCheck: Date.now()
      });

    } catch (e) {
      console.error('[MONITOR] Error checking bid:', e.message);
      monitor.errors++;
    }
  };
  monitor.intervalId = setInterval(checkAndBid, 5000);
  checkAndBid();
}

async function saveEnquiry(enquiry) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if exists
    const res = await client.query('SELECT * FROM enquiries WHERE id = $1', [enquiry.id]);
    const existing = res.rows[0];

    // Helper to parse date safely
    const parseDate = (d) => {
      if (!d) return null;
      if (typeof d === 'string' && d.includes('T')) return new Date(d);
      // If DD/MM/YYYY HH:mm
      const parts = typeof d === 'string' ? d.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/) : null;
      if (parts) {
        return new Date(`${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}:${parts[5]}:00`);
      }
      return new Date(d);
    };

    const bidCloseTime = parseDate(enquiry.bid_close_time);
    const createdAt = parseDate(enquiry.created_at);
  } finally {
    client.release();
  }
}

app.post('/api/save-enquiries', requireAuth, async (req, res) => {
  const { enquiries } = req.body;

  if (!Array.isArray(enquiries)) {
    return res.status(400).json({ error: 'enquiries must be an array' });
  }

  try {
    let savedCount = 0;
    for (const enquiry of enquiries) {
      await saveEnquiry(enquiry);
      savedCount++;
    }
    res.json({ success: true, count: savedCount, message: 'Enquiries saved successfully' });
  } catch (error) {
    console.error('Error saving enquiries:', error);
    res.status(500).json({ error: 'Failed to save enquiries', details: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);

  getConfig().then(config => {
    console.log('[STARTUP] Initial config check - has token:', !!config.globalAuthToken);
  }).catch(e => console.error('[STARTUP] DB Config check failed:', e.message));
});