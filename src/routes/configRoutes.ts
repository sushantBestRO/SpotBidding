import { Router } from 'express';
import { setAuthToken, getConfig } from '../controllers/configController';
import * as settingsController from '../controllers/settingsController';
import { requireAuth, requireAdmin } from '../middleware/auth';
import logger from '../../logger';


const router = Router();

/**
 * @swagger
 * tags:
 *   name: Config
 *   description: Configuration API
 */

/**
 * @swagger
 * /api/set-auth-token:
 *   post:
 *     summary: Set global auth token
 *     tags: [Config]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - authToken
 *             properties:
 *               authToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token updated
 */
router.post('/set-auth-token', requireAuth, setAuthToken);

/**
 * @swagger
 * /api/config:
 *   get:
 *     summary: Get system configuration
 *     tags: [Config]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: System configuration
 */
router.get('/config', requireAuth, getConfig);

// Email Configuration
router.get('/email-config', requireAuth, settingsController.getEmailConfig);
router.post('/email-config', requireAdmin, settingsController.updateEmailConfig);
router.post('/email-test', requireAdmin, settingsController.sendTestEmail);

// Location Management
router.get('/locations', requireAuth, settingsController.getLocations);
router.post('/locations', requireAdmin, settingsController.addLocation);
router.put('/locations/:id', requireAdmin, settingsController.updateLocation);
router.delete('/locations/:id', requireAdmin, settingsController.deleteLocation);

// WhatsApp Configuration
router.get('/whatsapp-config', requireAuth, settingsController.getWhatsappConfig);
router.post('/whatsapp-config', requireAdmin, settingsController.updateWhatsappConfig);
router.post('/whatsapp-test', requireAdmin, settingsController.sendWhatsappTest);

// Template Management
router.get('/templates', requireAuth, settingsController.getTemplates);
router.get('/templates/report', requireAuth, settingsController.getTemplateReport);
router.post('/templates/create-all', requireAdmin, settingsController.createAllTemplates);
router.post('/templates/:templateName/status', requireAdmin, settingsController.updateTemplateStatus);
router.get('/templates/predefined', requireAuth, settingsController.getPredefinedTemplates);

// Pricing Settings
router.get('/settings/pricing', requireAuth, settingsController.getPricingSettings);
router.put('/settings/pricing', requireAdmin, settingsController.updatePricingSettings);

/**
 * @swagger
 * /api/public/percentages:
 *   get:
 *     summary: Get pricing percentages (Public)
 *     tags: [Config]
 *     responses:
 *       200:
 *         description: Pricing percentages
 */
router.get('/public/percentages', settingsController.getPricingSettings);

// Logs
router.get('/logs/bids', requireAuth, (req, res) => {
    try {
        const bids = logger.getTodaysBids();
        res.json({ success: true, bids });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bid logs' });
    }
});

router.get('/logs/errors', requireAuth, (req, res) => {
    try {
        const errors = logger.getTodaysErrors();
        res.json({ success: true, errors });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch error logs' });
    }
});

export default router;

