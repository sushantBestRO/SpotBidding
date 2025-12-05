import { Router } from 'express';
import { startBidding, stopBidding, getBiddingStatus, getAllBiddingStatuses, submitBid, saveMarketRate, saveBids, publicSubmitMarketPrice } from '../controllers/bidController';
import { requireAuth, requireManager } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Bidding
 *   description: Automated bidding management API
 */

/**
 * @swagger
 * /api/start-bidding:
 *   post:
 *     summary: Start automated bidding for an enquiry
 *     tags: [Bidding]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enquiryKey
 *               - bids
 *             properties:
 *               enquiryKey:
 *                 type: string
 *                 description: The enquiry key
 *               enquiryNumber:
 *                 type: string
 *                 description: Display number of enquiry
 *               closingTimestamp:
 *                 type: string
 *                 description: Bid closing timestamp
 *               bids:
 *                 type: object
 *                 properties:
 *                   low:
 *                     type: number
 *                   medium:
 *                     type: number
 *                   high:
 *                     type: number
 *     responses:
 *       200:
 *         description: Bidding started successfully
 *       400:
 *         description: Invalid request or bidding already active
 *       401:
 *         description: Unauthorized
 */
router.post('/start-bidding', requireAuth, startBidding);

/**
 * @swagger
 * /api/stop-bidding:
 *   post:
 *     summary: Stop automated bidding for an enquiry
 *     tags: [Bidding]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enquiryKey
 *             properties:
 *               enquiryKey:
 *                 type: string
 *                 description: The enquiry key
 *     responses:
 *       200:
 *         description: Bidding stopped successfully
 *       404:
 *         description: No active bidding found
 *       401:
 *         description: Unauthorized
 */
router.post('/stop-bidding', requireAuth, stopBidding);

/**
 * @swagger
 * /api/bidding-status/all:
 *   get:
 *     summary: Get all active bidding statuses
 *     tags: [Bidding]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of all active bidding monitors
 *       401:
 *         description: Unauthorized
 */
router.get('/bidding-status/all', requireAuth, getAllBiddingStatuses);

/**
 * @swagger
 * /api/bidding-status/{enquiryKey}:
 *   get:
 *     summary: Get bidding status for a specific enquiry
 *     tags: [Bidding]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: enquiryKey
 *         required: true
 *         schema:
 *           type: string
 *         description: The enquiry key
 *     responses:
 *       200:
 *         description: Bidding status details
 *       404:
 *         description: No bidding monitor found
 *       401:
 *         description: Unauthorized
 */
router.get('/bidding-status/:enquiryKey', requireAuth, getBiddingStatus);

/**
 * @swagger
 * /api/submit-bid:
 *   post:
 *     summary: Manually submit a bid
 *     tags: [Bidding]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enquiryKey
 *               - amount
 *             properties:
 *               enquiryKey:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Bid submitted successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/submit-bid', requireAuth, submitBid);

/**
 * @swagger
 * /api/save-market-rate:
 *   post:
 *     summary: Save market rate for an enquiry (Manager only)
 *     tags: [Bidding]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enquiryKey
 *               - marketRate
 *             properties:
 *               enquiryKey:
 *                 type: string
 *               marketRate:
 *                 type: number
 *     responses:
 *       200:
 *         description: Market rate saved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Manager role required
 */
router.post('/save-market-rate', requireManager, saveMarketRate);

/**
 * @swagger
 * /api/save-bids:
 *   post:
 *     summary: Save bid amounts for an enquiry
 *     tags: [Bidding]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enquiryNumber
 *               - bids
 *             properties:
 *               enquiryNumber:
 *                 type: string
 *               bids:
 *                 type: object
 *                 properties:
 *                   low:
 *                     type: number
 *                   medium:
 *                     type: number
 *                   high:
 *                     type: number
 *     responses:
 *       200:
 *         description: Bids saved successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/save-bids', requireAuth, saveBids);

/**
 * @swagger
 * /api/public/submit-market-price:
 *   post:
 *     summary: Public endpoint to submit market price (No authentication required)
 *     tags: [Bidding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enquiryKey
 *               - marketPrice
 *             properties:
 *               enquiryKey:
 *                 type: string
 *               marketPrice:
 *                 type: number
 *               submitterName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Market price submitted successfully
 *       400:
 *         description: Invalid request
 */
router.post('/public/submit-market-price', publicSubmitMarketPrice);

export default router;
