import { Router } from 'express';
import { startBidding, stopBidding, getBiddingStatus, getAllBiddingStatuses, submitBid, saveMarketRate, saveBids } from '../controllers/bidController';
import { requireAuth, requireManager } from '../middleware/auth';

const router = Router();

// ... existing swagger docs ...

router.post('/start-bidding', requireAuth, startBidding);
router.post('/stop-bidding', requireAuth, stopBidding);
router.get('/bidding-status/all', requireAuth, getAllBiddingStatuses);
router.get('/bidding-status/:enquiryKey', requireAuth, getBiddingStatus);

// New endpoints
router.post('/submit-bid', requireAuth, submitBid);
router.post('/save-market-rate', requireManager, saveMarketRate);
router.post('/save-bids', requireAuth, saveBids);

export default router;
