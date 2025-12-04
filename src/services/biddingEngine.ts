import { db } from '../config/db';
import { bidMonitors, systemConfig, enquiries, enquiryExtensions } from '../models/schema';
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
    config: any;
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

    public async startBidding(enquiryKey: string, bidConfig: any, user: any, strategyName: string = 'GoComet') {
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
            config: bidConfig,
            strategyName,
            lastKnownCloseTime: initialCloseTime,
            startedBy: user.username || 'unknown',
            userFullName: user.name || user.username || 'Unknown User',
            timeRemaining: initialTimeRemaining
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
                bidsSubmitted: 0
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
                    bidsSubmitted: 0
                },
                startTime: new Date(),
                updatedBy: user.username
            }
        });

        // Start Loop
        monitor.intervalId = setInterval(() => this.checkAndBid(enquiryKey, authToken), 5000);

        // Initial check
        this.checkAndBid(enquiryKey, authToken);

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

        return true;
    }

    public getStatus(enquiryKey: string) {
        return this.monitors.get(enquiryKey);
    }

    public getAllStatuses() {
        return Array.from(this.monitors.values());
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

            logBid(enquiryKey, `Rank: ${monitor.currentRank}, Time Left: ${data.bidClosingIn}s`);

            // Update DB with latest stats periodically (or every check if critical)
            // For now, we update on every check to keep DB in sync for status polling
            await db.update(bidMonitors)
                .set({
                    data: {
                        ...monitor.config,
                        strategy: monitor.strategyName,
                        userFullName: monitor.userFullName,
                        bidsSubmitted: monitor.bidsSubmitted,
                        currentRank: monitor.currentRank,
                        timeRemaining: monitor.timeRemaining
                    },
                    updatedAt: new Date()
                })
                .where(eq(bidMonitors.enquiryKey, enquiryKey));

            // Check for extension
            if (data.bidCloseTime) {
                const newCloseTime = new Date(data.bidCloseTime);

                if (monitor.lastKnownCloseTime && newCloseTime.getTime() > monitor.lastKnownCloseTime.getTime() + 60000) {
                    // Extension detected (> 1 min difference)
                    logBid(enquiryKey, `Extension detected! ${monitor.lastKnownCloseTime.toISOString()} -> ${newCloseTime.toISOString()}`);

                    // Update DB
                    try {
                        // Get current enquiry to get ID and count
                        const storedEnquiry = await db.select().from(enquiries).where(eq(enquiries.enquiryKey, enquiryKey)).limit(1);

                        if (storedEnquiry.length > 0) {
                            const newCount = (storedEnquiry[0].extensionCount || 0) + 1;

                            await db.insert(enquiryExtensions).values({
                                enquiryId: storedEnquiry[0].id,
                                extensionNumber: newCount,
                                previousBidCloseTime: monitor.lastKnownCloseTime,
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

                    monitor.lastKnownCloseTime = newCloseTime;
                } else if (!monitor.lastKnownCloseTime) {
                    monitor.lastKnownCloseTime = newCloseTime;
                }
            }

            // Logic to decide if we need to bid would go here, using strategy.submitBid()
            // For now, just logging

        } catch (error: any) {
            console.error(`[BIDDING ${enquiryKey}] Error:`, error.message);
        }
    }
}

export const biddingEngine = new BiddingEngine();
