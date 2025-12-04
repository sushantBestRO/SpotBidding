import { syncEnquiries, syncClosedBids } from '../services/enquiryService';

let cronInterval: NodeJS.Timeout | null = null;
let closedBidsCronInterval: NodeJS.Timeout | null = null;

export const startEnquiryCron = () => {
    if (cronInterval) {
        console.log('[Cron] Enquiry sync cron already running.');
        return;
    }

    console.log('[Cron] Starting enquiry sync cron (every 30s)...');
    console.log('[Cron] Starting closed bids sync cron (every 5m)...');

    // Run immediately on start
    runSync();
    runClosedBidsSync();

    // Then run every 30 seconds
    cronInterval = setInterval(runSync, 30000);

    // Run closed bids sync every 30 seconds
    closedBidsCronInterval = setInterval(runClosedBidsSync, 30000);
};

export const stopEnquiryCron = () => {
    if (cronInterval) {
        clearInterval(cronInterval);
        cronInterval = null;
    }
    if (closedBidsCronInterval) {
        clearInterval(closedBidsCronInterval);
        closedBidsCronInterval = null;
    }
    console.log('[Cron] Enquiry sync crons stopped.');
};

const runSync = async () => {
    try {
        console.log('[Cron] Running scheduled enquiry sync...');
        await syncEnquiries();
        console.log('[Cron] Enquiry sync completed successfully.');
    } catch (error: any) {
        console.error('[Cron] Enquiry sync failed:', error.message);
    }
};

const runClosedBidsSync = async () => {
    try {
        console.log('[Cron] Running scheduled closed bids sync...');
        await syncClosedBids();
        console.log('[Cron] Closed bids sync completed successfully.');
    } catch (error: any) {
        console.error('[Cron] Closed bids sync failed:', error.message);
    }
};
