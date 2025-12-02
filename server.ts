import path from 'path';
import express, { Request, Response, NextFunction } from 'express';

import session from 'express-session';
import pgSession from 'connect-pg-simple';
import cors from 'cors';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { pool, initDb } from './db';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import './logger'; // Initialize logger

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = 'https://app.gocomet.com';

// Swagger setup
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Spot Bidding API',
            version: '1.0.0',
            description: 'API for managing spot bidding enquiries and automation',
        },
        servers: [
            {
                url: `http://localhost:${PORT}`,
            },
        ],
    },
    apis: ['./server.ts'], // Path to the API docs
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Global state
const activeBidMonitors = new Map<string, any>();
const globalBidStatus = new Map<string, any>();

app.use(cors({
    origin: ['http://localhost:5173', 'https://app.gocomet.com'],
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PgSessionStore = pgSession(session);

app.use(session({
    store: new PgSessionStore({
        pool: pool,
        tableName: 'session'
    }),
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
}));

// Initialize DB
initDb().catch(console.error);

const bidSessions = new Map<string, any>();
const otpSessions = new Map<string, any>();
let enquiryKey = ''; // Global enquiry key

// Helper functions for DB
async function getConfig(): Promise<any> {
    try {
        const res = await pool.query('SELECT * FROM system_config LIMIT 1');
        return res.rows[0] || {};
    } catch (e) {
        console.error('Error fetching config:', e);
        return {};
    }
}

async function saveConfigToDb(config: any): Promise<boolean> {
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

function getHeaders(authToken: string): any {
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
function requireAuth(req: Request, res: Response, next: NextFunction): void {
    // Allow for now to avoid breaking existing flow, but ideally check session
    next();
}

// Routes
app.get('/', async (req: Request, res: Response) => {
    console.log('[ROOT] Session user:', (req.session as any).user);

    const config = await getConfig();
    const authToken = config.globalAuthToken;

    let enquiryData = null;
    let meta = {};

    if (enquiryKey && authToken) {
        try {
            const directUrl = `${API_BASE_URL}/api/v1/vendor/enquiries/${enquiryKey}`;
            const directRes = await axios.get(directUrl, { headers: getHeaders(authToken) });
            enquiryData = directRes.data;
        } catch (e: any) {
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

app.post('/api/authenticate-chrome', requireAuth, async (req: Request, res: Response) => {
    const { email } = req.body;
    const sessionId = req.session.id;

    try {
        const otpSessionId = Math.random().toString(36).substring(7);

        const otpPromise = new Promise<string>((resolve) => {
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

app.post('/api/submit-otp', requireAuth, async (req: Request, res: Response) => {
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

app.post('/api/set-auth-token', requireAuth, async (req: Request, res: Response) => {
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

app.post('/api/save-bids', requireAuth, (req: Request, res: Response) => {
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

app.get('/api/quotes/:enquiryKey', requireAuth, async (req: Request, res: Response) => {
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
    } catch (error: any) {
        console.error('Error fetching quote details:', error.message);
        res.status(500).json({ error: 'Failed to fetch quote details' });
    }
});

app.post('/api/submit-bid', requireAuth, async (req: Request, res: Response) => {
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
    } catch (error: any) {
        console.error('Error submitting bid:', error.message);
        res.status(500).json({ error: 'Failed to submit bid', details: error.message });
    }
});

app.post('/api/save-market-rate', requireAuth, (req: Request, res: Response) => {
    const { enquiryKey, cargoIndex, marketRate } = req.body;
    const session = req.session as any;

    if (!session.bids) {
        session.bids = {};
    }
    if (!session.bids[enquiryKey]) {
        session.bids[enquiryKey] = {};
    }

    if (cargoIndex !== null && cargoIndex !== undefined) {
        if (!session.bids[enquiryKey].cargo) {
            session.bids[enquiryKey].cargo = [];
        }
        let cargoEntry = session.bids[enquiryKey].cargo.find((c: any) => Number(c.cargoIndex) === Number(cargoIndex));
        if (!cargoEntry) {
            cargoEntry = { cargoIndex: Number(cargoIndex) };
            session.bids[enquiryKey].cargo.push(cargoEntry);
        }
        cargoEntry.marketValue = marketRate;
    } else {
        session.bids[enquiryKey].marketValue = marketRate;
    }

    res.json({ success: true });
});

app.post('/api/start-bidding', requireAuth, async (req: Request, res: Response) => {
    const { enquiryKey: key } = req.body;
    if (!key) return res.status(400).json({ error: 'Enquiry key required' });

    enquiryKey = key;

    if (activeBidMonitors.has(key)) {
        return res.json({ success: true, message: 'Bidding already active' });
    }

    startSmartBiddingMonitor(key);
    res.json({ success: true, message: 'Bidding started' });
});

app.post('/api/stop-bidding', requireAuth, async (req: Request, res: Response) => {
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

app.get('/api/bidding-status/:enquiryKey', requireAuth, (req: Request, res: Response) => {
    const { enquiryKey } = req.params;
    const status = globalBidStatus.get(enquiryKey) || { active: false };
    res.json(status);
});

app.get('/api/bidding-status/all', requireAuth, (req: Request, res: Response) => {
    const statuses = Array.from(globalBidStatus.entries()).map(([key, val]) => ({ key, ...val }));
    res.json(statuses);
});

// Chrome automation for login with OTP
async function performChromeLogin(email: string, otpCallback: () => Promise<string>): Promise<string | null> {
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

        let capturedToken: string | null = null;

        client.on('Network.responseReceived', async (params: any) => {
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
            const btn = buttons.find(b => b.textContent?.includes('Login with OTP'));
            if (btn) (btn as HTMLElement).click();
        });

        await page.waitForTimeout(2000);
        const otp = await otpCallback();

        await page.waitForSelector('input#otp_value', { timeout: 10000 });
        await page.type('input#otp_value', otp);

        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const btn = buttons.find(b => b.textContent?.includes('Login'));
            if (btn) (btn as HTMLElement).click();
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

async function startSmartBiddingMonitor(enquiryKey: string) {
    console.log(`[MONITOR] Starting smart bidding monitor for ${enquiryKey}`);

    const monitor: any = {
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

        } catch (e: any) {
            console.error('[MONITOR] Error checking bid:', e.message);
            monitor.errors++;
        }
    };
    monitor.intervalId = setInterval(checkAndBid, 5000);
    checkAndBid();
}

async function saveEnquiry(enquiry: any) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if exists
        const res = await client.query('SELECT * FROM enquiries WHERE id = $1', [enquiry.id]);
        const existing = res.rows[0];

        // Helper to parse date safely
        const parseDate = (d: any): Date | null => {
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
        const bidOpenTime = parseDate(enquiry.bid_open_time);
        const minQuoteValidTill = parseDate(enquiry.min_quote_valid_till);
        const bidCloseTimestamp = parseDate(enquiry.bid_close_timestamp);
        const biddingClosedAt = parseDate(enquiry.bidding_closed_at);

        // Determine bid amounts and count
        let currentBidAmount = enquiry.current_bid_amount !== undefined ? enquiry.current_bid_amount : (existing?.current_bid_amount || null);
        let bidCount = enquiry.bid_count !== undefined ? enquiry.bid_count : (existing?.bid_count || 0);
        let bid1Amount = enquiry.bid_1_amount !== undefined ? enquiry.bid_1_amount : (existing?.bid_1_amount || null);
        let bid2Amount = enquiry.bid_2_amount !== undefined ? enquiry.bid_2_amount : (existing?.bid_2_amount || null);
        let bid3Amount = enquiry.bid_3_amount !== undefined ? enquiry.bid_3_amount : (existing?.bid_3_amount || null);

        if (existing) {
            const oldCloseTime = existing.bid_close_time ? new Date(existing.bid_close_time) : null;

            // Check for extension
            let isExtended = false;
            if (oldCloseTime && bidCloseTime && oldCloseTime.getTime() !== bidCloseTime.getTime()) {
                isExtended = true;
            } else if (!oldCloseTime && bidCloseTime) {
                isExtended = true;
            }

            if (isExtended) {
                // Log extension with the bid amounts at that time
                await client.query(
                    'INSERT INTO enquiry_extensions (enquiry_id, previous_bid_close_time, new_bid_close_time, last_bid_amount, bid_1_amount, bid_2_amount, bid_3_amount) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [enquiry.id, oldCloseTime, bidCloseTime, existing.current_bid_amount, existing.bid_1_amount, existing.bid_2_amount, existing.bid_3_amount]
                );

                // Reset logic on extension:
                // 1. Last bid becomes 1st bid of new period
                // 2. Bid count resets to 1
                // 3. 2nd and 3rd bids are cleared
                bidCount = 1;
                bid1Amount = existing.current_bid_amount;
                bid2Amount = null;
                bid3Amount = null;
                // currentBidAmount remains as is (it's the same value as bid1Amount now)
            }

            // Update
            await client.query(
                `UPDATE enquiries SET 
          enquiry_key = $2, name = $3, enquiry_type = $4, mode = $5, shipment_type = $6, status = $7,
          origin = $8, destination = $9, bid_close_time = $10,
          l1_quote_total_cost_display = $11, cargo_type = $12, quantity = $13,
          origin_zip_code = $14, destination_zip_code = $15,
          other_origins = $16, other_origin_zip_codes = $17, other_destinations = $18, other_destination_zip_codes = $19,
          bid_open_time = $20, min_quote_valid_till = $21, bid_close_timestamp = $22,
          enquiry_label = $23, bidding_closed = $24, bidding_closed_at = $25, archived = $26,
          bid_opening_in = $27, show_consignment_details = $28, auction_type = $29, client_company_name = $30,
          quotes_sent = $31, vendor_rank = $32, shipper = $33, consignee = $34,
          is_negotiating = $35, editing_enabled = $36, show_cost_of_l1_quote = $37,
          current_bid_amount = $38, bid_count = $39, bid_1_amount = $40, bid_2_amount = $41, bid_3_amount = $42,
          data = $43, updated_at = NOW()
         WHERE id = $1`,
                [
                    enquiry.id, enquiry.key, enquiry.name, enquiry.enquiry_type, enquiry.mode, enquiry.shipment_type, enquiry.status,
                    enquiry.origin, enquiry.destination, bidCloseTime,
                    enquiry.l1_quote_total_cost_display, enquiry.cargo_type, enquiry.quantity,
                    enquiry.origin_zip_code, enquiry.destination_zip_code,
                    enquiry.other_origins, enquiry.other_origin_zip_codes, enquiry.other_destinations, enquiry.other_destination_zip_codes,
                    bidOpenTime, minQuoteValidTill, bidCloseTimestamp,
                    enquiry.enquiry_label, enquiry.bidding_closed, biddingClosedAt, enquiry.archived,
                    enquiry.bid_opening_in, enquiry.show_consignment_details, enquiry.auction_type, enquiry.client_company_name,
                    enquiry.quotes_sent, enquiry.vendor_rank, enquiry.shipper, enquiry.consignee,
                    enquiry.is_negotiating, enquiry.editing_enabled, enquiry.show_cost_of_l1_quote,
                    currentBidAmount, bidCount, bid1Amount, bid2Amount, bid3Amount,
                    enquiry // Save full JSON
                ]
            );
        } else {
            // Insert
            await client.query(
                `INSERT INTO enquiries (
          id, enquiry_key, name, enquiry_type, mode, shipment_type, status, 
          origin, destination, bid_close_time, created_at,
          l1_quote_total_cost_display, cargo_type, quantity,
          origin_zip_code, destination_zip_code,
          other_origins, other_origin_zip_codes, other_destinations, other_destination_zip_codes,
          bid_open_time, min_quote_valid_till, bid_close_timestamp,
          enquiry_label, bidding_closed, bidding_closed_at, archived,
          bid_opening_in, show_consignment_details, auction_type, client_company_name,
          quotes_sent, vendor_rank, shipper, consignee,
          is_negotiating, editing_enabled, show_cost_of_l1_quote,
          current_bid_amount, bid_count, bid_1_amount, bid_2_amount, bid_3_amount,
          data
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
          $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43
        )`,
                [
                    enquiry.id, enquiry.key, enquiry.name, enquiry.enquiry_type, enquiry.mode, enquiry.shipment_type, enquiry.status,
                    enquiry.origin, enquiry.destination, bidCloseTime, createdAt,
                    enquiry.l1_quote_total_cost_display, enquiry.cargo_type, enquiry.quantity,
                    enquiry.origin_zip_code, enquiry.destination_zip_code,
                    enquiry.other_origins, enquiry.other_origin_zip_codes, enquiry.other_destinations, enquiry.other_destination_zip_codes,
                    bidOpenTime, minQuoteValidTill, bidCloseTimestamp,
                    enquiry.enquiry_label, enquiry.bidding_closed, biddingClosedAt, enquiry.archived,
                    enquiry.bid_opening_in, enquiry.show_consignment_details, enquiry.auction_type, enquiry.client_company_name,
                    enquiry.quotes_sent, enquiry.vendor_rank, enquiry.shipper, enquiry.consignee,
                    enquiry.is_negotiating, enquiry.editing_enabled, enquiry.show_cost_of_l1_quote,
                    currentBidAmount, bidCount, bid1Amount, bid2Amount, bid3Amount,
                    enquiry
                ]
            );
        }

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

app.post('/api/save-enquiries', requireAuth, async (req: Request, res: Response) => {
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
    } catch (error: any) {
        console.error('Error saving enquiries:', error);
        res.status(500).json({ error: 'Failed to save enquiries', details: error.message });
    }
});

// Initialize DB and start server
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);

        getConfig().then(config => {
            console.log('[STARTUP] Initial config check - has token:', !!config.globalAuthToken);
        }).catch(e => console.error('[STARTUP] DB Config check failed:', e.message));
    });
}).catch(e => {
    console.error('Failed to initialize database:', e);
    process.exit(1);
});
