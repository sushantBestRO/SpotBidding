import express from 'express';
import { getBidSubmissionLogs, getBidSubmissionStats, getEnquiryBidHistory } from '../controllers/bidLogsController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Bid Logs
 *   description: Bid submission logging and analytics API
 */

/**
 * @swagger
 * /api/bid-logs:
 *   get:
 *     summary: Get bid submission logs with optional filters
 *     tags: [Bid Logs]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: enquiryKey
 *         schema:
 *           type: string
 *         description: Filter by enquiry key
 *       - in: query
 *         name: success
 *         schema:
 *           type: boolean
 *         description: Filter by success status (true/false)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of records to return
 *     responses:
 *       200:
 *         description: List of bid submission logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 */
router.get('/bid-logs', requireAuth, getBidSubmissionLogs);

/**
 * @swagger
 * /api/bid-logs/stats:
 *   get:
 *     summary: Get bid submission statistics
 *     tags: [Bid Logs]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: enquiryKey
 *         schema:
 *           type: string
 *         description: Optional - Get stats for specific enquiry
 *     responses:
 *       200:
 *         description: Bid submission statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalSubmissions:
 *                       type: integer
 *                     successfulBids:
 *                       type: integer
 *                     failedBids:
 *                       type: integer
 *                     avgResponseTime:
 *                       type: number
 *                     totalAmount:
 *                       type: number
 *       401:
 *         description: Unauthorized
 */
router.get('/bid-logs/stats', requireAuth, getBidSubmissionStats);

/**
 * @swagger
 * /api/bid-logs/enquiry/{enquiryKey}:
 *   get:
 *     summary: Get complete bid submission history for a specific enquiry
 *     tags: [Bid Logs]
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
 *         description: Bid submission history grouped by extension
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 enquiryKey:
 *                   type: string
 *                 totalSubmissions:
 *                   type: integer
 *                 extensions:
 *                   type: object
 *                   description: Logs grouped by extension number
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 */
router.get('/bid-logs/enquiry/:enquiryKey', requireAuth, getEnquiryBidHistory);

export default router;
