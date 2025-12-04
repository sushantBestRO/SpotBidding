import { Request, Response } from 'express';
import { biddingEngine } from '../services/biddingEngine';

export const startBidding = async (req: Request, res: Response) => {
    const { enquiryKey, bids } = req.body;
    const user = (req.session as any).user;

    console.log(`[BidController] Request to start bidding for ${enquiryKey} by ${user?.username}`);

    try {
        await biddingEngine.startBidding(enquiryKey, bids, user);
        console.log(`[BidController] Bidding started successfully for ${enquiryKey}`);
        res.json({ success: true, message: 'Bidding started' });
    } catch (error: any) {
        console.error(`[BidController] Failed to start bidding for ${enquiryKey}:`, error.message);
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

import { db } from '../config/db';
import { bidMonitors, enquiries } from '../models/schema';
import { eq } from 'drizzle-orm';

export const getBiddingStatus = async (req: Request, res: Response) => {
    const { enquiryKey } = req.params;

    // 1. Check in-memory engine first (most up-to-date for active bidding)
    const memoryStatus = biddingEngine.getStatus(enquiryKey);
    if (memoryStatus) {
        return res.json({
            active: true,
            status: memoryStatus.status,
            currentRank: memoryStatus.currentRank,
            bidsSubmitted: memoryStatus.bidsSubmitted,
            timeRemaining: memoryStatus.timeRemaining,
            startedBy: memoryStatus.startedBy || 'unknown',
            userFullName: memoryStatus.userFullName || 'Unknown',
            bids: memoryStatus.config?.bids || {}
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
    res.json({ statuses });
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
