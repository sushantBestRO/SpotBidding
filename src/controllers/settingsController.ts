import { Request, Response } from 'express';
import { loadConfig, saveConfig } from '../services/configService';
import { emailService } from '../services/emailService';
import { whatsappService } from '../services/whatsappService';
import { templateManager } from '../services/templateManager';
import { biddingEngine } from '../services/biddingEngine';

// Email Config
export const getEmailConfig = async (req: Request, res: Response) => {
    try {
        const config = await emailService.getConfig();
        const safeConfig = { ...config };
        delete safeConfig.senderPassword;
        res.json(safeConfig);
    } catch (error) {
        console.error('[EMAIL CONFIG] Error getting config:', error);
        res.status(500).json({ error: 'Failed to get email configuration' });
    }
};

export const updateEmailConfig = async (req: Request, res: Response) => {
    try {
        const { recipientEmail, enableDailyReports, dailyReportTime } = req.body;

        if (!recipientEmail || !recipientEmail.includes('@')) {
            return res.status(400).json({ error: 'Valid recipient email is required' });
        }

        const updateConfig = {
            recipientEmail,
            enableDailyReports: enableDailyReports !== undefined ? enableDailyReports : true,
            dailyReportTime: dailyReportTime || '21:00'
        };

        const result = await emailService.updateConfig(updateConfig);

        if (result.success) {
            console.log(`[EMAIL CONFIG] Updated by ${(req.session as any).user?.username}: ${JSON.stringify(updateConfig)}`);
            res.json({ message: result.message });
        } else {
            res.status(500).json({ error: result.message });
        }
    } catch (error) {
        console.error('[EMAIL CONFIG] Error updating config:', error);
        res.status(500).json({ error: 'Failed to update email configuration' });
    }
};

export const sendTestEmail = async (req: Request, res: Response) => {
    try {
        console.log(`[EMAIL TEST] Test email requested by ${(req.session as any).user?.username}`);

        const reportData = await emailService.getDailyReportData();
        const excelBuffer = await emailService.generateExcelReport(reportData.bids);

        const result = await emailService.sendDailyReport(reportData, excelBuffer);

        if (result.success) {
            console.log(`[EMAIL TEST] Test email sent successfully: ${result.messageId}`);
            res.json({ message: 'Test email sent successfully!', messageId: result.messageId });
        } else {
            res.status(500).json({ error: 'Failed to send test email' });
        }
    } catch (error: any) {
        console.error('[EMAIL TEST] Error sending test email:', error);
        res.status(500).json({ error: `Failed to send test email: ${error.message}` });
    }
};

// Location Management
export const getLocations = async (req: Request, res: Response) => {
    try {
        const config = await loadConfig();
        res.json({ locations: config.locations || [] });
    } catch (error) {
        console.error('[LOCATIONS] Error getting locations:', error);
        res.status(500).json({ error: 'Failed to get locations' });
    }
};

export const addLocation = async (req: Request, res: Response) => {
    try {
        const { id, sourceLocation, plantName, concernedPerson, mobile, email, firstMessage, winMessage, loseMessage } = req.body;

        if (!id || !plantName || !concernedPerson || !mobile) {
            return res.status(400).json({ error: 'Required fields: id, plantName, concernedPerson, mobile' });
        }

        const config = await loadConfig();
        if (!config.locations) config.locations = [];

        if (config.locations.find((loc: any) => loc.id === id)) {
            return res.status(400).json({ error: 'Location ID already exists' });
        }

        const newLocation = {
            id,
            sourceLocation: sourceLocation || '',
            plantName,
            concernedPerson,
            mobile,
            email: email || '',
            firstMessage: firstMessage || '',
            winMessage: winMessage || '',
            loseMessage: loseMessage || ''
        };

        config.locations.push(newLocation);

        const success = await saveConfig(config);
        if (success) {
            console.log(`[LOCATIONS] Added new location: ${plantName} (${id})`);
            res.json({ message: 'Location added successfully', location: newLocation });
        } else {
            res.status(500).json({ error: 'Failed to save location' });
        }
    } catch (error) {
        console.error('[LOCATIONS] Error adding location:', error);
        res.status(500).json({ error: 'Failed to add location' });
    }
};

export const updateLocation = async (req: Request, res: Response) => {
    try {
        const locationId = req.params.id;
        const { sourceLocation, plantName, concernedPerson, mobile, email, firstMessage, winMessage, loseMessage } = req.body;

        const config = await loadConfig();
        if (!config.locations) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const locationIndex = config.locations.findIndex((loc: any) => loc.id === locationId);
        if (locationIndex === -1) {
            return res.status(404).json({ error: 'Location not found' });
        }

        config.locations[locationIndex] = {
            ...config.locations[locationIndex],
            sourceLocation: sourceLocation || config.locations[locationIndex].sourceLocation,
            plantName: plantName || config.locations[locationIndex].plantName,
            concernedPerson: concernedPerson || config.locations[locationIndex].concernedPerson,
            mobile: mobile || config.locations[locationIndex].mobile,
            email: email || config.locations[locationIndex].email,
            firstMessage: firstMessage || config.locations[locationIndex].firstMessage,
            winMessage: winMessage || config.locations[locationIndex].winMessage,
            loseMessage: loseMessage || config.locations[locationIndex].loseMessage
        };

        const success = await saveConfig(config);
        if (success) {
            console.log(`[LOCATIONS] Updated location: ${plantName} (${locationId})`);
            res.json({ message: 'Location updated successfully', location: config.locations[locationIndex] });
        } else {
            res.status(500).json({ error: 'Failed to save location' });
        }
    } catch (error) {
        console.error('[LOCATIONS] Error updating location:', error);
        res.status(500).json({ error: 'Failed to update location' });
    }
};

export const deleteLocation = async (req: Request, res: Response) => {
    try {
        const locationId = req.params.id;
        const config = await loadConfig();

        if (!config.locations) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const locationIndex = config.locations.findIndex((loc: any) => loc.id === locationId);
        if (locationIndex === -1) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const removedLocation = config.locations.splice(locationIndex, 1)[0];

        const success = await saveConfig(config);
        if (success) {
            console.log(`[LOCATIONS] Removed location: ${removedLocation.plantName} (${locationId})`);
            res.json({ message: 'Location removed successfully' });
        } else {
            res.status(500).json({ error: 'Failed to save configuration' });
        }
    } catch (error) {
        console.error('[LOCATIONS] Error removing location:', error);
        res.status(500).json({ error: 'Failed to remove location' });
    }
};

// WhatsApp Config
export const getWhatsappConfig = async (req: Request, res: Response) => {
    try {
        const config = await loadConfig();
        const whatsappConfig = config.whatsappConfig || {};
        const safeConfig = { ...whatsappConfig };
        delete safeConfig.apiKey;
        res.json(safeConfig);
    } catch (error) {
        console.error('[WHATSAPP CONFIG] Error getting config:', error);
        res.status(500).json({ error: 'Failed to get WhatsApp configuration' });
    }
};

export const updateWhatsappConfig = async (req: Request, res: Response) => {
    try {
        const { apiKey, senderNumber, templateName, enableWhatsApp } = req.body;

        const config = await loadConfig();
        if (!config.whatsappConfig) config.whatsappConfig = {};

        if (apiKey !== undefined) config.whatsappConfig.apiKey = apiKey;
        if (senderNumber !== undefined) config.whatsappConfig.senderNumber = senderNumber;
        if (templateName !== undefined) config.whatsappConfig.templateName = templateName;
        if (enableWhatsApp !== undefined) config.whatsappConfig.enableWhatsApp = enableWhatsApp;

        const success = await saveConfig(config);
        if (success) {
            console.log(`[WHATSAPP CONFIG] Updated by ${(req.session as any).user?.username}`);
            res.json({ message: 'WhatsApp configuration updated successfully' });
        } else {
            res.status(500).json({ error: 'Failed to save WhatsApp configuration' });
        }
    } catch (error) {
        console.error('[WHATSAPP CONFIG] Error updating config:', error);
        res.status(500).json({ error: 'Failed to update WhatsApp configuration' });
    }
};

export const sendWhatsappTest = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, message } = req.body;

        if (!phoneNumber || !message) {
            return res.status(400).json({ error: 'Phone number and message are required' });
        }

        console.log(`[WHATSAPP TEST] Test message requested by ${(req.session as any).user?.username} to ${phoneNumber}`);

        const result = await whatsappService.sendTestMessage(phoneNumber, message);

        if (result.success) {
            console.log(`[WHATSAPP TEST] Test message sent successfully to ${phoneNumber}`);
            res.json({ message: 'Test message sent successfully!', messageId: result.messageId });
        } else {
            res.status(500).json({ error: 'Failed to send test message' });
        }
    } catch (error: any) {
        console.error('[WHATSAPP TEST] Error sending test message:', error);
        res.status(500).json({ error: `Failed to send test message: ${error.message}` });
    }
};

// Templates
export const getTemplates = (req: Request, res: Response) => {
    try {
        const templates = templateManager.getCreatedTemplates();
        res.json({ templates });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get templates' });
    }
};

export const getTemplateReport = (req: Request, res: Response) => {
    try {
        const report = templateManager.generateReport();
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate template report' });
    }
};

export const createAllTemplates = async (req: Request, res: Response) => {
    try {
        const results = await templateManager.createAllFreightTemplates();
        res.json({
            message: 'Template creation completed',
            results
        });
    } catch (error: any) {
        res.status(500).json({ error: `Failed to create templates: ${error.message}` });
    }
};

export const updateTemplateStatus = (req: Request, res: Response) => {
    try {
        const { templateName } = req.params;
        const { status, notes } = req.body;

        const updated = templateManager.updateTemplateStatus(templateName, status, notes);

        if (updated) {
            res.json({ message: 'Template status updated successfully' });
        } else {
            res.status(404).json({ error: 'Template not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to update template status' });
    }
};

export const getPredefinedTemplates = (req: Request, res: Response) => {
    try {
        const templates = templateManager.getFreightBiddingTemplates();
        res.json({ templates });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get predefined templates' });
    }
};

// Pricing Settings
export const getPricingSettings = async (req: Request, res: Response) => {
    try {
        const config = await loadConfig();
        const enquiryNumber = req.query.enquiryNumber as string;

        // If enquiryNumber is provided, fetch extension-specific percentages
        if (enquiryNumber) {
            const bidPercentages = await biddingEngine.getBidPercentagesForEnquiry(enquiryNumber);
            res.json({
                pricePercents: {
                    high: bidPercentages.high,
                    medium: bidPercentages.medium,
                    low: bidPercentages.low
                },
                bidKey: bidPercentages.bidKey,
                extensionCount: bidPercentages.extensionCount
            });
        } else {
            // Return all pricing configurations
            const pricePercents = config.pricePercents || { high: 9, medium: 7, low: 5 };
            res.json({ pricePercents });
        }
    } catch (error) {
        console.error('[PRICING] Error getting pricing settings:', error);
        res.status(500).json({ error: 'Failed to get pricing settings' });
    }
};

export const updatePricingSettings = async (req: Request, res: Response) => {
    try {
        const pricingData = req.body; // This is the nested object with bid_1, bid_2, etc.

        // Validate the structure
        if (!pricingData || typeof pricingData !== 'object') {
            return res.status(400).json({ error: 'Invalid pricing data format' });
        }

        // Validate each bid object
        for (const [bidKey, bidValue] of Object.entries(pricingData)) {
            if (!bidKey.startsWith('bid_')) {
                return res.status(400).json({ error: `Invalid bid key: ${bidKey}` });
            }

            const bid = bidValue as any;
            if (typeof bid !== 'object' || !bid.high || !bid.medium || !bid.low) {
                return res.status(400).json({ error: `Bid ${bidKey} must have high, medium, and low values` });
            }

            // Validate numeric values
            const { high, medium, low } = bid;
            if (!Number.isFinite(high) || !Number.isFinite(medium) || !Number.isFinite(low)) {
                return res.status(400).json({ error: `Bid ${bidKey}: All values must be numbers` });
            }

            // Validate range
            if (high < 0 || high > 100 || medium < 0 || medium > 100 || low < 0 || low > 100) {
                return res.status(400).json({ error: `Bid ${bidKey}: All values must be between 0 and 100` });
            }
        }

        // Save to config
        const config = await loadConfig();
        config.pricePercents = pricingData;

        const success = await saveConfig(config);
        if (success) {
            console.log(`[PRICING] Updated by ${(req.session as any).user?.username}: ${JSON.stringify(pricingData, null, 2)}`);
            res.json({ success: true, pricePercents: config.pricePercents });
        } else {
            res.status(500).json({ error: 'Failed to save settings' });
        }
    } catch (error) {
        console.error('[PRICING] Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
};
