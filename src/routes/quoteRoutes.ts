import { Router } from 'express';
import { getQuotes, getQuoteDetails, getClosedBids, getEnquiryExtensions } from '../controllers/quoteController';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Quotes
 *   description: Quote management API
 */

/**
 * @swagger
 * /api/quotes:
 *   get:
 *     summary: Get all quotes
 *     tags: [Quotes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Open, Closed]
 *           default: Open
 *         description: Filter quotes by status
 *     responses:
 *       200:
 *         description: List of quotes
 *       401:
 *         description: Unauthorized
 */
router.get('/quotes', requireAuth, getQuotes);

/**
 * @swagger
 * /api/quotes/{enquiryKey}:
 *   get:
 *     summary: Get quote details
 *     tags: [Quotes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: enquiryKey
 *         schema:
 *           type: string
 *         required: true
 *         description: The enquiry key
 *     responses:
 *       200:
 *         description: Quote details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Quote not found
 */
router.get('/quotes/:enquiryKey', requireAuth, getQuoteDetails);

/**
 * @swagger
 * /api/enquiry/{enquiryKey}/extensions:
 *   get:
 *     summary: Get all extensions for an enquiry
 *     tags: [Quotes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: enquiryKey
 *         schema:
 *           type: string
 *         required: true
 *         description: The enquiry key
 *     responses:
 *       200:
 *         description: List of extensions sorted by closing date
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Enquiry not found
 */
router.get('/enquiry/:enquiryKey/extensions', requireAuth, getEnquiryExtensions);

/**
 * @swagger
 * /api/closed-bids:
 *   get:
 *     summary: Get closed bids
 *     tags: [Quotes]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of closed bids
 *       401:
 *         description: Unauthorized
 */
router.get('/closed-bids', requireAuth, getClosedBids);

export default router;
