import { Request, Response } from 'express';
import { biddingEngine } from '../services/biddingEngine';
import { whatsappService } from '../services/whatsappService';
import { db } from '../config/db';
import { bidMonitors, enquiries, systemConfig } from '../models/schema';
import { eq } from 'drizzle-orm';
import { goCometApi, getHeaders } from '../services/goCometService';
import logger from '../../logger';

export const startBidding = async (req: Request, res: Response) => {
    const { enquiryKey, enquiryNumber, closingTimestamp, bids } = req.body;
    const sessionId = req.sessionID;
    const user = (req.session as any).user;

    console.log(`[START-BIDDING] Request to start bidding for ${enquiryKey} by ${user?.username}`);

    try {
        // Get global auth token from config
        const configResult = await db.select().from(systemConfig).limit(1);
        const authToken = configResult[0]?.globalAuthToken;

        if (!authToken) {
            return res.status(401).json({ error: 'GoComet authentication required', needsAuth: true });
        }

        // Validate bid structure based on type
        if (bids.cargo && Array.isArray(bids.cargo)) {
            // Multi-cargo validation
            for (const cargo of bids.cargo) {
                if (!cargo.high || !cargo.medium || !cargo.low) {
                    return res.status(400).json({
                        error: 'All three bid values (high, medium, low) are required for each cargo type'
                    });
                }
            }
        } else {
            // Single cargo validation
            if (!bids.high || !bids.medium || !bids.low) {
                return res.status(400).json({
                    error: 'All three bid values (high, medium, low) are required'
                });
            }
        }

        // CRITICAL: Check if monitor already exists FIRST
        const existingMonitor = biddingEngine.getStatus(enquiryKey);
        if (existingMonitor && existingMonitor.status === 'active') {
            console.log(`[START-BIDDING] Monitor already exists for ${enquiryKey}, rejecting new request`);
            return res.status(409).json({
                error: 'Smart bidding already active for this enquiry',
                startedBy: existingMonitor.userFullName || existingMonitor.startedBy
            });
        }

        console.log(`[START-BIDDING] No existing monitor for ${enquiryKey}, proceeding to create new one`);

        // Start the bidding monitor
        await biddingEngine.startBidding(enquiryKey, bids, user, {
            enquiryNumber,
            closingTimestamp,
            sessionId
        });

        console.log(`[START-BIDDING] Started new monitor for ${enquiryKey} by ${user?.username}`);

        // Send WhatsApp new bid notification asynchronously (don't block API response)
        setImmediate(async () => {
            try {
                // Create a simplified enquiry object for WhatsApp notification
                const enquiryForWhatsApp = {
                    enquiry_number: enquiryKey,
                    origin: enquiryNumber?.split(' to ')[0] || 'Unknown origin',
                    destination: enquiryNumber?.split(' to ')[1] || 'Unknown destination',
                    created_at: new Date().toISOString(),
                    closing_time: closingTimestamp,
                    cargo_quantity: ['Container'], // Default for now
                    unit_details: { totalUnits: 1 }
                };

                const whatsappResult = await whatsappService.sendNewBidNotification(enquiryForWhatsApp);
                if (whatsappResult.success) {
                    console.log(`[WHATSAPP] New bid notification sent for ${enquiryKey}`);
                } else {
                    console.log(`[WHATSAPP] Failed to send new bid notification for ${enquiryKey}: ${whatsappResult.reason}`);
                }
            } catch (error) {
                console.error(`[WHATSAPP] Error sending new bid notification for ${enquiryKey}:`, error);
            }
        });

        res.json({ success: true, message: 'Smart bidding monitor started' });

    } catch (error: any) {
        console.error(`[START-BIDDING] Failed to start bidding for ${enquiryKey}:`, error.message);
        res.status(400).json({ error: error.message });
    }
};

export const stopBidding = async (req: Request, res: Response) => {
    const { enquiryKey } = req.body;
    const user = (req.session as any).user;

    console.log(`[BidController] Request to stop bidding for ${enquiryKey} by ${user?.username}`);

    const success = await biddingEngine.stopBidding(enquiryKey, user);
    if (success) {
        console.log(`[BidController] Bidding stopped for ${enquiryKey}`);
        res.json({ success: true, message: 'Bidding stopped' });
    } else {
        console.warn(`[BidController] Stop request failed - monitor not found for ${enquiryKey}`);
        res.status(404).json({ error: 'Monitor not found' });
    }
};

export const getBiddingStatus = async (req: Request, res: Response) => {
    const { enquiryKey } = req.params;

    // 1. Check in-memory engine first (most up-to-date for active bidding)
    const memoryStatus = biddingEngine.getStatus(enquiryKey);
    if (memoryStatus) {
        // Calculate real-time remaining seconds
        let realTimeRemaining = memoryStatus.timeRemaining;

        if (memoryStatus.lastKnownCloseTime) {
            console.log(`[getBiddingStatus] ${enquiryKey} - Raw lastKnownCloseTime:`, memoryStatus.lastKnownCloseTime);
            console.log(`[getBiddingStatus] ${enquiryKey} - Type:`, typeof memoryStatus.lastKnownCloseTime);

            const now = new Date();
            const closeTime = new Date(memoryStatus.lastKnownCloseTime);

            console.log(`[getBiddingStatus] ${enquiryKey} - Parsed closeTime:`, closeTime.toISOString());
            console.log(`[getBiddingStatus] ${enquiryKey} - Now:`, now.toISOString());

            realTimeRemaining = Math.max(0, Math.floor((closeTime.getTime() - now.getTime()) / 1000));
        }

        console.log(`[getBiddingStatus] ${enquiryKey}:`, {
            timeRemaining: memoryStatus.timeRemaining,
            lastKnownCloseTime: memoryStatus.lastKnownCloseTime,
            bidsSubmitted: memoryStatus.bidsSubmitted,
            realTimeRemaining: realTimeRemaining
        });

        return res.json({
            active: true,
            status: memoryStatus.status,
            currentRank: memoryStatus.currentRank,
            bidsSubmitted: memoryStatus.bidsSubmitted,
            timeRemaining: realTimeRemaining, // Real-time calculated value
            startedBy: memoryStatus.startedBy || 'unknown',
            userFullName: memoryStatus.userFullName || 'Unknown',
            bids: memoryStatus?.bids || {}
        });
    }

    // 2. Fallback to DB
    try {
        const monitorResult = await db.select().from(bidMonitors).where(eq(bidMonitors.enquiryKey, enquiryKey)).limit(1);

        if (monitorResult.length > 0) {
            const monitor = monitorResult[0];
            const monitorData = monitor.data as any || {};

            // Fetch latest rank from enquiries table if not in monitor data
            let currentRank = monitorData.currentRank;
            if (currentRank === undefined || currentRank === null) {
                const enquiryResult = await db.select().from(enquiries).where(eq(enquiries.enquiryKey, enquiryKey)).limit(1);
                currentRank = enquiryResult[0]?.vendorRank || null;
            }

            return res.json({
                enquiryKey: monitor.enquiryKey,
                status: monitor.status,
                currentRank: currentRank,
                bidsSubmitted: monitorData.bidsSubmitted || 0,
                timeRemaining: monitorData.timeRemaining || null,
                startedBy: monitor.createdBy || 'unknown',
                userFullName: monitorData.userFullName || 'Unknown',
                bids: monitorData.bids || {},
                config: monitorData,
                strategyName: monitorData.strategy || 'GoComet',
                active: monitor.status === 'active',
                source: 'database'
            });
        }
    } catch (error) {
        console.error(`[BidController] Error fetching status from DB for ${enquiryKey}:`, error);
    }

    res.json({ active: false });
};

export const getAllBiddingStatuses = (req: Request, res: Response) => {
    const statuses = biddingEngine.getAllStatuses();

    // Serialize the statuses to avoid circular reference issues with Timeout objects
    const serializedStatuses = statuses.map(monitor => ({
        enquiryKey: monitor.enquiryKey,
        status: monitor.status,
        currentRank: monitor.currentRank,
        bidsSubmitted: monitor.bidsSubmitted,
        timeRemaining: monitor.timeRemaining,
        startedBy: monitor.startedBy,
        userFullName: monitor.userFullName,
        bids: monitor.bids,
        strategyName: monitor.strategyName,
        currentPollingInterval: monitor.currentPollingInterval,
        lastKnownCloseTime: monitor.lastKnownCloseTime?.toISOString() || null
        // Note: intervalId is excluded as it contains circular references
    }));

    res.json({ statuses: serializedStatuses });
};

export const submitBid = async (req: Request, res: Response) => {
    const { quoteId, payload } = req.body;

    // Mimic API call for development testing
    console.log(`[BidController] Mocking bid submission for quote ${quoteId}`);
    console.log(`[BidController] Payload:`, JSON.stringify(payload, null, 2));

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    res.json({ success: true, data: { message: 'Bid submitted successfully (mock)' } });
};

export const saveMarketRate = async (req: Request, res: Response) => {
    const { enquiryKey, cargoIndex, marketRate } = req.body;
    const user = (req.session as any).user;

    if (!enquiryKey || !marketRate) {
        return res.status(400).json({ error: 'Enquiry key and market rate are required' });
    }

    try {
        // Fetch existing enquiry data to update it
        const existingEnquiry = await db.select().from(enquiries).where(eq(enquiries.enquiryKey, enquiryKey)).limit(1);

        if (existingEnquiry.length === 0) {
            return res.status(404).json({ error: 'Enquiry not found' });
        }

        const currentMarketRates = (existingEnquiry[0].marketRates as any) || {};

        const rateEntry = {
            amount: marketRate,
            updatedBy: user?.username || 'unknown',
            updatedAt: new Date().toISOString()
        };

        if (cargoIndex !== undefined && cargoIndex !== null) {
            currentMarketRates[`cargo_${cargoIndex}`] = rateEntry;
        } else {
            currentMarketRates.default = rateEntry;
        }

        await db.update(enquiries)
            .set({ marketRates: currentMarketRates })
            .where(eq(enquiries.enquiryKey, enquiryKey));

        console.log(`[BidController] Saved market rate for ${enquiryKey}: ${marketRate} by ${user?.username}`);
        res.json({ success: true });

    } catch (error: any) {
        console.error(`[BidController] Failed to save market rate for ${enquiryKey}:`, error.message);
        res.status(500).json({ error: 'Failed to save market rate' });
    }
};
export const saveBids = async (req: Request, res: Response) => {
    const { enquiryNumber, bids } = req.body;
    const userSession = (req.session as any);

    if (!userSession.bids) {
        userSession.bids = {};
    }

    userSession.bids[enquiryNumber] = bids;

    // Persist to database if simple bid structure (High/Medium/Low)
    if (bids.high && bids.medium && bids.low) {
        try {
            await db.update(enquiries)
                .set({
                    bidHighAmount: bids.high.toString(),
                    bidMediumAmount: bids.medium.toString(),
                    bidLowAmount: bids.low.toString()
                })
                .where(eq(enquiries.enquiryKey, enquiryNumber));
            console.log(`[BidController] Persisted bids for ${enquiryNumber} to DB`);
        } catch (error) {
            console.error(`[BidController] Failed to persist bids for ${enquiryNumber}:`, error);
        }
    }

    // Only log when all three price ranges are filled and no monitor is active
    const monitor = biddingEngine.getStatus(enquiryNumber);
    if (bids.low && bids.medium && bids.high && !monitor) {
        console.log(`All bid prices filled for ${enquiryNumber}. Ready for smart bidding.`);
    }

    res.json({ success: true });
};

// Public market price submission (NO AUTH) - starts smart bidding
export const publicSubmitMarketPrice = async (req: Request, res: Response) => {
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

    try {
        const configResult = await db.select().from(systemConfig).limit(1);
        const cfg = configResult[0];
        const authToken = cfg?.globalAuthToken;
        const pricePercents = (cfg?.config as any)?.pricePercents || { high: 9, medium: 7, low: 5 };

        if (!authToken) {
            return res.status(503).json({ error: 'System not configured for bidding' });
        }

        let bids: any;

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
        const monitor = biddingEngine.getStatus(enquiryKey);
        if (monitor && monitor.status === 'active') {
            return res.status(409).json({ error: 'Smart bidding already active for this enquiry' });
        }

        // Get enquiry details for closing timestamp
        let closingTimestamp = null;
        try {
            const biddingUrl = `/api/v1/vendor/enquiries/${enquiryKey}/bidding-data`;
            const biddingRes = await goCometApi.get(biddingUrl, { headers: getHeaders(authToken) });
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
        const user = { username: 'Public Submission', role: 'public' };

        // We need to inject the public submission flag into the bidding engine start
        // Since startBidding takes user object, we can pass special user
        await biddingEngine.startBidding(enquiryKey, bids, user, {
            isPublicSubmission: true,
            marketValue: isMultiCargo ? cargoValues : marketValue,
            isMultiCargo: isMultiCargo,
            closingTimestamp: closingTimestamp
        });

        logger.logBid(enquiryKey, 'PUBLIC_SUBMISSION', marketValue, 0, 0, true, 0, {
            calculatedBids: bids,
            percentages: pricePercents
        });

        res.json({
            success: true,
            message: 'Smart bidding started with your market price',
            bids: bids // Show calculated bids to admin only
        });

    } catch (error: any) {
        console.error('Error starting public bidding:', error);
        res.status(500).json({ error: 'Failed to start smart bidding' });
    }
};
