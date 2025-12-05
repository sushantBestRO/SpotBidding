import { db } from '../config/db';
import { bidMonitors, systemConfig, enquiries, enquiryExtensions, bidSubmissionLogs } from '../models/schema';
import { eq } from 'drizzle-orm';
import { IBiddingStrategy } from './strategies/IBiddingStrategy';
import { GoCometStrategy } from './strategies/GoCometStrategy';

// Simple logger
const logBid = (enquiryKey: string, message: string) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [BIDDING ${enquiryKey}] ${message}`);
};

interface BidMonitorState {
    enquiryKey: string;
    status: 'active' | 'stopped' | 'completed' | 'error';
    currentRank: number | null;
    bidsSubmitted: number;
    intervalId: NodeJS.Timeout | null;
    currentPollingInterval: number; // Track the current interval duration in ms
    bids: any;
    strategyName: string;
    lastKnownCloseTime?: Date;
    startedBy: string;
    userFullName: string;
    timeRemaining: number | null;
}

class BiddingEngine {
    private monitors: Map<string, BidMonitorState> = new Map();
    private strategies: Map<string, IBiddingStrategy> = new Map();

    constructor() {
        // Register default strategies
        this.registerStrategy(new GoCometStrategy());
    }

    public registerStrategy(strategy: IBiddingStrategy) {
        this.strategies.set(strategy.name, strategy);
    }

    public async startBidding(enquiryKey: string, bidConfig: any, user: any, options: any = {}, strategyName: string = 'GoComet') {
        if (this.monitors.has(enquiryKey)) {
            throw new Error('Bidding already active for this enquiry');
        }

        const strategy = this.strategies.get(strategyName);
        if (!strategy) throw new Error(`Strategy ${strategyName} not found`);

        // Get Auth Token
        const sysConf = await db.select().from(systemConfig).limit(1);
        const authToken = sysConf[0]?.globalAuthToken;
        if (!authToken) throw new Error('System not configured with Auth Token');

        // Fetch initial data to get close time
        let initialCloseTime: Date | undefined;
        let initialTimeRemaining: number | null = null;
        try {
            const data = await strategy.fetchBiddingData(enquiryKey, authToken);
            if (data.bidCloseTime) {
                initialCloseTime = new Date(data.bidCloseTime);
            }
            initialTimeRemaining = data.bidClosingIn || null;
        } catch (e) {
            console.warn(`[BIDDING ${enquiryKey}] Could not fetch initial data:`, e);
        }

        const monitor: BidMonitorState = {
            enquiryKey,
            status: 'active',
            currentRank: null,
            bidsSubmitted: 0,
            intervalId: null,
            currentPollingInterval: 5000, // Start with 5 second interval
            bids: bidConfig,
            strategyName,
            lastKnownCloseTime: initialCloseTime,
            startedBy: user.username || 'unknown',
            userFullName: user.name || user.username || 'Unknown User',
            timeRemaining: initialTimeRemaining,
            ...options
        };

        this.monitors.set(enquiryKey, monitor);
        logBid(enquiryKey, `Started by ${user.username} using ${strategyName}`);

        // Persist start state
        await db.insert(bidMonitors).values({
            enquiryKey,
            data: {
                ...bidConfig,
                strategy: strategyName,
                userFullName: monitor.userFullName,
                bidsSubmitted: 0,
                ...options
            },
            status: 'active',
            active: true,
            startTime: new Date(),
            createdBy: user.username,
            updatedBy: user.username
        }).onConflictDoUpdate({
            target: bidMonitors.enquiryKey,
            set: {
                status: 'active',
                active: true,
                data: {
                    ...bidConfig,
                    strategy: strategyName,
                    userFullName: monitor.userFullName,
                    bidsSubmitted: 0,
                    ...options
                },
                startTime: new Date(),
                updatedBy: user.username
            }
        });

        // Start Loop
        monitor.intervalId = setInterval(() => this.checkAndBid(enquiryKey, authToken), 5000);

        // Initial check
        this.checkAndBid(enquiryKey, authToken);

        // Update enquiry table with bidding status
        await db.update(enquiries)
            .set({
                biddingStatus: 'active',
                updatedBy: user.username,
                updatedAt: new Date()
            })
            .where(eq(enquiries.enquiryKey, enquiryKey));

        return monitor;
    }

    public async stopBidding(enquiryKey: string, user: any) {
        const monitor = this.monitors.get(enquiryKey);
        if (!monitor) return false;

        if (monitor.intervalId) clearInterval(monitor.intervalId);
        monitor.status = 'stopped';
        this.monitors.delete(enquiryKey);

        logBid(enquiryKey, `Stopped by ${user.username}`);

        await db.update(bidMonitors)
            .set({
                status: 'stopped',
                active: false,
                updatedBy: user.username,
                updatedAt: new Date()
            })
            .where(eq(bidMonitors.enquiryKey, enquiryKey));

        // Update enquiry table with bidding status
        await db.update(enquiries)
            .set({
                biddingStatus: 'stopped',
                updatedBy: user.username,
                updatedAt: new Date()
            })
            .where(eq(enquiries.enquiryKey, enquiryKey));

        return true;
    }

    public getStatus(enquiryKey: string) {
        return this.monitors.get(enquiryKey);
    }

    public getAllStatuses() {
        return Array.from(this.monitors.values());
    }

    /**
     * Restore active monitors from database on server startup
     * Only restores monitors for bids that are still open
     */
    public async restoreActiveMonitors() {
        try {
            console.log('[BIDDING ENGINE] Restoring active monitors from database...');

            // Get system config for auth token
            const sysConf = await db.select().from(systemConfig).limit(1);
            const authToken = sysConf[0]?.globalAuthToken;
            if (!authToken) {
                console.warn('[BIDDING ENGINE] No auth token found, cannot restore monitors');
                return;
            }

            // Get all active bid monitors
            const activeMonitors = await db.select()
                .from(bidMonitors)
                .where(eq(bidMonitors.active, true));

            console.log(`[BIDDING ENGINE] Found ${activeMonitors.length} active monitors to restore`);

            for (const monitorRecord of activeMonitors) {
                const enquiryKey = monitorRecord.enquiryKey;
                const data = monitorRecord.data as any;

                // Check if this enquiry still exists and is not closed
                const enquiryRecords = await db.select()
                    .from(enquiries)
                    .where(eq(enquiries.enquiryKey, enquiryKey))
                    .limit(1);

                if (enquiryRecords.length === 0) {
                    console.log(`[BIDDING ENGINE] Enquiry ${enquiryKey} not found, skipping`);
                    continue;
                }

                const enquiry = enquiryRecords[0];

                // Check if bidding is closed
                if (enquiry.biddingClosed) {
                    console.log(`[BIDDING ENGINE] Enquiry ${enquiryKey} is closed, marking monitor as stopped`);
                    await db.update(bidMonitors)
                        .set({ active: false, status: 'completed' })
                        .where(eq(bidMonitors.enquiryKey, enquiryKey));
                    await db.update(enquiries)
                        .set({ biddingStatus: 'stopped' })
                        .where(eq(enquiries.enquiryKey, enquiryKey));
                    continue;
                }

                // Check if bid close time has passed
                if (enquiry.bidCloseTime && new Date(enquiry.bidCloseTime) < new Date()) {
                    console.log(`[BIDDING ENGINE] Enquiry ${enquiryKey} bid time has passed, marking as stopped`);
                    await db.update(bidMonitors)
                        .set({ active: false, status: 'completed' })
                        .where(eq(bidMonitors.enquiryKey, enquiryKey));
                    await db.update(enquiries)
                        .set({ biddingStatus: 'stopped' })
                        .where(eq(enquiries.enquiryKey, enquiryKey));
                    continue;
                }

                // Restore the monitor
                try {
                    const strategyName = data.strategy || 'GoComet';
                    const strategy = this.strategies.get(strategyName);
                    if (!strategy) {
                        console.warn(`[BIDDING ENGINE] Strategy ${strategyName} not found for ${enquiryKey}`);
                        continue;
                    }

                    // Fetch current bidding data
                    let initialCloseTime: Date | undefined;
                    let initialTimeRemaining: number | null = null;
                    try {
                        const biddingData = await strategy.fetchBiddingData(enquiryKey, authToken);
                        if (biddingData.bidCloseTime) {
                            initialCloseTime = new Date(biddingData.bidCloseTime);
                        }
                        initialTimeRemaining = biddingData.bidClosingIn || null;
                    } catch (e) {
                        console.warn(`[BIDDING ENGINE] Could not fetch data for ${enquiryKey}:`, e);
                    }

                    const monitor: BidMonitorState = {
                        enquiryKey,
                        status: 'active',
                        currentRank: data.currentRank || null,
                        bidsSubmitted: data.bidsSubmitted || 0,
                        intervalId: null,
                        currentPollingInterval: 5000,
                        bids: data,
                        strategyName,
                        lastKnownCloseTime: initialCloseTime || enquiry.bidCloseTime || undefined,
                        startedBy: monitorRecord.createdBy || 'system',
                        userFullName: data.userFullName || 'System Restore',
                        timeRemaining: initialTimeRemaining
                    };

                    this.monitors.set(enquiryKey, monitor);

                    // Start monitoring loop
                    monitor.intervalId = setInterval(() => this.checkAndBid(enquiryKey, authToken), 5000);

                    // Initial check
                    this.checkAndBid(enquiryKey, authToken);

                    console.log(`[BIDDING ENGINE] ✅ Restored monitor for ${enquiryKey} (${data.bidsSubmitted || 0} bids submitted)`);

                } catch (error: any) {
                    console.error(`[BIDDING ENGINE] Error restoring monitor for ${enquiryKey}:`, error.message);
                }
            }

            console.log(`[BIDDING ENGINE] Restoration complete. ${this.monitors.size} monitors active.`);

        } catch (error: any) {
            console.error('[BIDDING ENGINE] Error restoring active monitors:', error.message);
        }
    }

    private async checkAndBid(enquiryKey: string, authToken: string) {
        const monitor = this.monitors.get(enquiryKey);
        if (!monitor || monitor.status !== 'active') return;

        const strategy = this.strategies.get(monitor.strategyName);
        if (!strategy) return;

        try {
            const data = await strategy.fetchBiddingData(enquiryKey, authToken);

            monitor.currentRank = data.vendorRank;
            monitor.timeRemaining = data.bidClosingIn;

            logBid(enquiryKey, `Rank: ${monitor.currentRank}, Time Left: ${data.bidClosingIn}s, Bids: ${monitor.bidsSubmitted}/3`);

            // Check if bidding is closed
            if (data.biddingClosed || (data.bidClosingIn !== null && data.bidClosingIn <= 0)) {
                logBid(enquiryKey, '🏁 Bidding closed, stopping monitor');

                // Stop the monitor
                if (monitor.intervalId) clearInterval(monitor.intervalId);
                monitor.status = 'completed';
                this.monitors.delete(enquiryKey);

                // Update database
                await db.update(bidMonitors)
                    .set({
                        status: 'completed',
                        active: false,
                        updatedAt: new Date()
                    })
                    .where(eq(bidMonitors.enquiryKey, enquiryKey));

                await db.update(enquiries)
                    .set({
                        biddingStatus: 'stopped',
                        updatedAt: new Date()
                    })
                    .where(eq(enquiries.enquiryKey, enquiryKey));

                return;
            }

            // Check for extension and handle reset
            const extensionDetected = await this.detectAndHandleExtension(enquiryKey, monitor, data);

            // Adjust polling interval based on time remaining
            this.adjustPollingInterval(enquiryKey, monitor, data.bidClosingIn);

            // Update DB with latest stats
            await this.updateMonitorStatus(enquiryKey, monitor);

            // Execute bidding logic if conditions are met
            await this.executeBiddingLogic(enquiryKey, monitor, data, authToken, strategy);

        } catch (error: any) {
            console.error(`[BIDDING ${enquiryKey}] Error:`, error.message);
        }
    }

    /**
     * Detect bid extension and reset bid counter if extension is found
     */
    private async detectAndHandleExtension(enquiryKey: string, monitor: BidMonitorState, data: any): Promise<boolean> {
        if (!data.bidCloseTime) return false;

        const newCloseTime = new Date(data.bidCloseTime);

        // Check if this is an extension (> 1 min difference)
        if (monitor.lastKnownCloseTime && newCloseTime.getTime() > monitor.lastKnownCloseTime.getTime() + 60000) {
            logBid(enquiryKey, `🔄 EXTENSION DETECTED! ${monitor.lastKnownCloseTime.toISOString()} -> ${newCloseTime.toISOString()}`);

            // Reset bid counter for new extension round
            const previousBidsSubmitted = monitor.bidsSubmitted;
            monitor.bidsSubmitted = 0;

            logBid(enquiryKey, `Reset bid counter from ${previousBidsSubmitted} to 0. Ready for 3 new bids.`);

            // Record extension in database
            await this.recordExtension(enquiryKey, monitor.lastKnownCloseTime, newCloseTime);

            monitor.lastKnownCloseTime = newCloseTime;
            return true;
        } else if (!monitor.lastKnownCloseTime) {
            monitor.lastKnownCloseTime = newCloseTime;
        }

        return false;
    }

    /**
     * Record bid extension in database
     */
    private async recordExtension(enquiryKey: string, previousCloseTime: Date, newCloseTime: Date): Promise<void> {
        try {
            const storedEnquiry = await db.select().from(enquiries).where(eq(enquiries.enquiryKey, enquiryKey)).limit(1);

            if (storedEnquiry.length > 0) {
                const newCount = (storedEnquiry[0].extensionCount || 0) + 1;

                await db.insert(enquiryExtensions).values({
                    enquiryId: storedEnquiry[0].id,
                    extensionNumber: newCount,
                    previousBidCloseTime: previousCloseTime,
                    newBidCloseTime: newCloseTime
                });

                await db.update(enquiries)
                    .set({
                        bidCloseTime: newCloseTime,
                        extensionCount: newCount
                    })
                    .where(eq(enquiries.enquiryKey, enquiryKey));
            }
        } catch (dbError: any) {
            console.error(`[BIDDING ${enquiryKey}] DB Error recording extension:`, dbError.message);
        }
    }

    /**
     * Adjust polling interval based on time remaining
     * - > 60s: Check every 30 seconds
     * - 10-60s: Check every 5 seconds
     * - <= 10s: Check every 1 second
     */
    private adjustPollingInterval(enquiryKey: string, monitor: BidMonitorState, timeRemaining: number): void {
        let newInterval: number;

        if (timeRemaining <= 10) {
            newInterval = 1000; // 1 second
        } else if (timeRemaining <= 60) {
            newInterval = 5000; // 5 seconds
        } else {
            newInterval = 30000; // 30 seconds
        }

        // Only restart interval if it changed
        if (monitor.currentPollingInterval !== newInterval && monitor.intervalId) {
            clearInterval(monitor.intervalId);
            monitor.intervalId = setInterval(() => this.checkAndBid(enquiryKey, monitor.bids.authToken || ''), newInterval);
            monitor.currentPollingInterval = newInterval; // Update tracked interval
            logBid(enquiryKey, `Adjusted polling interval to ${newInterval}ms`);
        }
    }

    /**
     * Update monitor status in database
     */
    private async updateMonitorStatus(enquiryKey: string, monitor: BidMonitorState): Promise<void> {
        await db.update(bidMonitors)
            .set({
                data: {
                    ...monitor.bids,
                    strategy: monitor.strategyName,
                    userFullName: monitor.userFullName,
                    bidsSubmitted: monitor.bidsSubmitted,
                    currentRank: monitor.currentRank,
                    timeRemaining: monitor.timeRemaining
                },
                updatedAt: new Date()
            })
            .where(eq(bidMonitors.enquiryKey, enquiryKey));
    }

    /**
     * Execute bidding logic based on current state
     * Rules:
     * 1. Only bid when time remaining <= 10 seconds
     * 2. Only bid if not rank #1
     * 3. Maximum 3 bids per round (resets on extension)
     * 4. Submit bids in order: bid1, bid2, bid3
     */
    private async executeBiddingLogic(
        enquiryKey: string,
        monitor: BidMonitorState,
        data: any,
        authToken: string,
        strategy: IBiddingStrategy
    ): Promise<void> {
        // Rule 1: Only bid in the last 10 seconds
        if (data.bidClosingIn > 10) {
            return;
        }

        // Rule 2: Don't bid if already rank #1
        if (monitor.currentRank === 1) {
            logBid(enquiryKey, '✅ Already rank #1, no bid needed');
            return;
        }

        // Rule 3: Check if we have bids remaining
        if (monitor.bidsSubmitted >= 3) {
            logBid(enquiryKey, '⚠️ All 3 bids exhausted for this round');
            return;
        }

        // Determine which bid to submit
        const bidNumber = monitor.bidsSubmitted + 1;
        const bidAmount = this.getBidAmount(monitor.bids, bidNumber);

        if (!bidAmount) {
            logBid(enquiryKey, `⚠️ No bid${bidNumber} configured`);
            return;
        }

        // Submit the bid
        const success = await this.submitBid(enquiryKey, monitor, bidAmount, bidNumber, authToken, strategy);

        if (success) {
            monitor.bidsSubmitted++;
            logBid(enquiryKey, `✅ Bid ${bidNumber} submitted successfully: ₹${bidAmount}`);
        }
    }

    /**
     * Get bid amount based on bid number
     */
    private getBidAmount(bids: any, bidNumber: number): number | null {
        switch (bidNumber) {
            case 1:
                return bids.bid1 || null;
            case 2:
                return bids.bid2 || null;
            case 3:
                return bids.bid3 || null;
            default:
                return null;
        }
    }

    /**
     * Submit a bid using the strategy
     */
    private async submitBid(
        enquiryKey: string,
        monitor: BidMonitorState,
        amount: number,
        bidNumber: number,
        authToken: string,
        strategy: IBiddingStrategy
    ): Promise<boolean> {
        const startTime = Date.now();
        let success = false;
        let errorMessage: string | null = null;
        let quoteId: string | null = null;

        try {
            logBid(enquiryKey, `📤 Submitting bid ${bidNumber}: ₹${amount}...`);

            // Get quote details needed for submission
            const quoteDetails = await strategy.getQuoteDetails(enquiryKey, authToken);

            if (!quoteDetails || !quoteDetails.id) {
                errorMessage = 'Failed to get quote details';
                logBid(enquiryKey, `❌ ${errorMessage}`);
                return false;
            }

            quoteId = quoteDetails.id;

            // Submit the bid
            success = await strategy.submitBid(quoteDetails.id, amount, authToken);
            const responseTime = Date.now() - startTime;

            if (success) {
                logBid(enquiryKey, `✅ Bid ${bidNumber} submitted: ₹${amount} (${responseTime}ms)`);

                // Update monitor state
                await this.updateMonitorStatus(enquiryKey, monitor);
            } else {
                errorMessage = 'Bid submission failed (API returned false)';
                logBid(enquiryKey, `❌ Bid ${bidNumber} submission failed`);
            }

            // Log to database
            await this.logBidSubmission(
                enquiryKey,
                monitor,
                bidNumber,
                amount,
                quoteId,
                success,
                errorMessage,
                responseTime
            );

            return success;

        } catch (error: any) {
            const responseTime = Date.now() - startTime;
            errorMessage = error.message || 'Unknown error';
            logBid(enquiryKey, `❌ Error submitting bid ${bidNumber}: ${errorMessage}`);

            // Log failed submission to database
            await this.logBidSubmission(
                enquiryKey,
                monitor,
                bidNumber,
                amount,
                quoteId,
                false,
                errorMessage,
                responseTime
            );

            return false;
        }
    }

    /**
     * Log bid submission to database
     */
    private async logBidSubmission(
        enquiryKey: string,
        monitor: BidMonitorState,
        bidNumber: number,
        amount: number,
        quoteId: string | null,
        success: boolean,
        errorMessage: string | null,
        responseTimeMs: number
    ): Promise<void> {
        try {
            // Get enquiry details from database
            const enquiryRecords = await db.select()
                .from(enquiries)
                .where(eq(enquiries.enquiryKey, enquiryKey))
                .limit(1);

            const enquiry = enquiryRecords[0];
            const extensionNumber = enquiry?.extensionCount || 0;

            await db.insert(bidSubmissionLogs).values({
                enquiryId: enquiry?.id || null,
                enquiryKey: enquiryKey,
                enquiryName: enquiry?.name || null,
                extensionNumber: extensionNumber,
                bidNumber: bidNumber,
                bidAmount: amount.toString(),
                quoteId: quoteId,
                success: success,
                errorMessage: errorMessage,
                currentRank: monitor.currentRank,
                timeRemainingSeconds: monitor.timeRemaining,
                bidsSubmittedBefore: monitor.bidsSubmitted,
                strategyName: monitor.strategyName,
                submittedBy: monitor.startedBy,
                submittedByFullName: monitor.userFullName,
                responseTimeMs: responseTimeMs,
                metadata: {
                    bidCloseTime: monitor.lastKnownCloseTime?.toISOString(),
                    pollingInterval: monitor.currentPollingInterval
                }
            });

            logBid(enquiryKey, `📝 Bid submission logged to database`);
        } catch (dbError: any) {
            console.error(`[BIDDING ${enquiryKey}] Failed to log bid submission to database:`, dbError.message);
        }
    }
}

export const biddingEngine = new BiddingEngine();
