import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './configService';

interface WhatsAppConfig {
    apiKey: string;
    senderNumber: string;
    templateName: string;
    enableWhatsApp: boolean;
}

interface Location {
    plantName: string;
    sourceLocation: string;
    concernedPerson: string;
    mobile: string;
    firstMessage: string;
    winMessage: string;
    loseMessage: string;
}

interface Config {
    whatsappConfig: WhatsAppConfig;
    locations: Location[];
}

interface SentBidData {
    enquiryNumber: string;
    messageType: string;
    sentAt: string;
}

interface Enquiry {
    enquiry_number: string;
    origin?: string;
    destination?: string;
    created_at?: string;
    closing_time?: string;
    cargo_quantity?: string[];
    unit_details?: {
        totalUnits?: number;
    };
}

interface BidResult {
    won: boolean;
    marketRate?: string | number;
    margin?: string | number;
    finalRate?: string | number;
    rank?: number;
    totalSubmissions?: number;
}

interface MessageResult {
    success: boolean;
    reason?: string;
    messageId?: string;
    recipient?: string;
    error?: any;
}

class WhatsAppService {
    private config: Config;
    private sentBidsMemory: Map<string, SentBidData>;
    private sentBidsFile: string;

    constructor() {
        this.config = {
            whatsappConfig: {
                apiKey: '',
                senderNumber: '',
                templateName: 'hello_world',
                enableWhatsApp: false
            },
            locations: []
        };
        this.sentBidsMemory = new Map();
        this.sentBidsFile = path.join(__dirname, 'sent_bids.json');
        this.loadConfigSync();
        this.loadSentBids();
    }

    private loadConfigSync(): void {
        try {
            const configPath = path.join(__dirname, '..', '..', 'web_config.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                this.config = JSON.parse(configData);
            }
        } catch (error) {
            console.error('[WHATSAPP SERVICE] Error loading config:', error);
        }
    }

    async loadConfig(): Promise<any> {
        try {
            const config = await loadConfig();
            if (config.whatsappConfig) {
                this.config.whatsappConfig = config.whatsappConfig;
            }
            if (config.locations) {
                this.config.locations = config.locations;
            }
            return this.config.whatsappConfig || {};
        } catch (error) {
            console.error('[WHATSAPP SERVICE] Error loading config from service:', error);
            return {};
        }
    }

    private loadSentBids(): void {
        try {
            if (fs.existsSync(this.sentBidsFile)) {
                const data = fs.readFileSync(this.sentBidsFile, 'utf8');
                const sentBids = JSON.parse(data);

                // Load into memory map, keep only last 250
                const entries = Object.entries(sentBids).slice(-250);
                this.sentBidsMemory = new Map(entries as [string, SentBidData][]);
            }
        } catch (error) {
            console.error('[WHATSAPP SERVICE] Error loading sent bids:', error);
            this.sentBidsMemory = new Map();
        }
    }

    private saveSentBids(): void {
        try {
            // Convert map to object and save to file
            const sentBidsObj = Object.fromEntries(this.sentBidsMemory);
            fs.writeFileSync(this.sentBidsFile, JSON.stringify(sentBidsObj, null, 2));
        } catch (error) {
            console.error('[WHATSAPP SERVICE] Error saving sent bids:', error);
        }
    }

    private markBidAsSent(enquiryNumber: string, messageType: string): void {
        const key = `${enquiryNumber}_${messageType}`;
        const timestamp = new Date().toISOString();

        this.sentBidsMemory.set(key, {
            enquiryNumber,
            messageType,
            sentAt: timestamp
        });

        // Keep only last 250 entries
        if (this.sentBidsMemory.size > 250) {
            const firstKey = this.sentBidsMemory.keys().next().value;
            if (firstKey !== undefined) {
                this.sentBidsMemory.delete(firstKey);
            }
        }

        this.saveSentBids();
        console.log(`[WHATSAPP SERVICE] Marked as sent: ${key}`);
    }

    private isBidAlreadySent(enquiryNumber: string, messageType: string): boolean {
        const key = `${enquiryNumber}_${messageType}`;
        return this.sentBidsMemory.has(key);
    }

    private findMatchingLocation(enquiry: Enquiry): Location | null {
        if (!this.config.locations || !enquiry.origin) return null;

        const origin = enquiry.origin.toLowerCase();

        return this.config.locations.find(location => {
            const plantName = location.plantName?.toLowerCase() || '';
            const sourceLocation = location.sourceLocation?.toLowerCase() || '';

            // Check if origin contains plant name or vice versa
            return origin.includes(plantName) ||
                plantName.includes(origin) ||
                origin.includes(sourceLocation) ||
                sourceLocation.includes(origin);
        }) || null;
    }

    private populateMessageTemplate(
        template: string,
        enquiry: Enquiry,
        location: Location,
        additionalData: Partial<BidResult> = {}
    ): string {
        if (!template) return '';

        const publicUrl = `https://spotbids.com/enquiry/${enquiry.enquiry_number}`;

        // Format dates
        const now = new Date();
        const enquiryDateTime = enquiry.created_at ?
            new Date(enquiry.created_at).toLocaleString('en-IN') :
            now.toLocaleString('en-IN');

        const closingDateTime = enquiry.closing_time ?
            new Date(enquiry.closing_time).toLocaleString('en-IN') :
            'Not specified';

        // Replace template variables
        let populatedMessage = template
            .replace(/<>/g, enquiry.enquiry_number || 'N/A')
            .replace(/Enquiry Date and Time-/g, `Enquiry Date and Time- ${enquiryDateTime}`)
            .replace(/Bid Closing Date and Time -/g, `Bid Closing Date and Time - ${closingDateTime}`)
            .replace(/<Delivery Address>/g, enquiry.destination || 'N/A')
            .replace(/<Loading Address>/g, enquiry.origin || 'N/A')
            .replace(/<Unloading Address>/g, enquiry.destination || 'N/A')
            .replace(/<Rs>/g, String(additionalData.finalRate || 'N/A'))
            .replace(/<%>/g, String(additionalData.margin || 'N/A'))
            .replace(/Market Rate given by you- <>/g, `Market Rate given by you- ${additionalData.marketRate || 'N/A'}`)
            .replace(/No of Vehicles - <>/g, `No of Vehicles - ${enquiry.unit_details?.totalUnits || enquiry.cargo_quantity?.length || 'N/A'}`)
            .replace(/Our Final Ranking -/g, `Our Final Ranking - ${additionalData.rank || 'N/A'}`)
            .replace(/No of Submissions-/g, `No of Submissions- ${additionalData.totalSubmissions || 'N/A'}`);

        // Handle vehicle type and quantity
        if (enquiry.cargo_quantity && enquiry.cargo_quantity.length > 0) {
            populatedMessage = populatedMessage
                .replace(/Type of Vehicle - <>/g, `Type of Vehicle - ${enquiry.cargo_quantity.join(', ')}`)
                .replace(/Quantity of Vehicle - <>/g, `Quantity of Vehicle - ${enquiry.cargo_quantity.length}`);
        } else {
            populatedMessage = populatedMessage
                .replace(/Type of Vehicle - <>/g, 'Type of Vehicle - N/A')
                .replace(/Quantity of Vehicle - <>/g, 'Quantity of Vehicle - N/A');
        }

        // Add public bidding link for first message
        if (template.includes('Enter your best and lowest market rate')) {
            populatedMessage += `\n\n🔗 Click here to submit your rate: ${publicUrl}`;
        }

        return populatedMessage;
    }

    private async sendWhatsAppMessage(
        phoneNumber: string,
        message: string,
        enquiryNumber: string
    ): Promise<MessageResult> {
        if (!this.config.whatsappConfig?.enableWhatsApp) {
            console.log('[WHATSAPP SERVICE] WhatsApp is disabled');
            return { success: false, reason: 'WhatsApp disabled' };
        }

        if (!this.config.whatsappConfig?.apiKey || !this.config.whatsappConfig?.senderNumber) {
            console.log('[WHATSAPP SERVICE] Missing API key or sender number');
            return { success: false, reason: 'Missing configuration' };
        }

        try {
            // Generate proper UUID for messageId
            const messageId = this.generateUUID();

            const payload = {
                messages: [{
                    to: phoneNumber,
                    from: this.config.whatsappConfig.senderNumber,
                    messageId: messageId,
                    content: {
                        templateName: this.config.whatsappConfig.templateName || "hello_world",
                        language: "en",
                        templateData: {
                            body: {
                                placeholders: [message]
                            }
                        }
                    }
                }]
            };

            const response = await axios.post(
                'https://public.doubletick.io/whatsapp/message/template',
                payload,
                {
                    headers: {
                        'Authorization': this.config.whatsappConfig.apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            console.log('[WHATSAPP SERVICE] Message sent successfully:', response.data);
            return {
                success: true,
                messageId: response.data.messageId,
                recipient: phoneNumber
            };

        } catch (error: any) {
            console.error('[WHATSAPP SERVICE] Error sending message:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    async sendNewBidNotification(enquiry: Enquiry): Promise<MessageResult> {
        const location = this.findMatchingLocation(enquiry);
        if (!location) {
            console.log('[WHATSAPP SERVICE] No matching location found for:', enquiry.origin);
            return { success: false, reason: 'No matching location' };
        }

        // Check if already sent
        if (this.isBidAlreadySent(enquiry.enquiry_number, 'first')) {
            console.log('[WHATSAPP SERVICE] First message already sent for:', enquiry.enquiry_number);
            return { success: false, reason: 'Already sent' };
        }

        const message = this.populateMessageTemplate(location.firstMessage, enquiry, location);

        const result = await this.sendWhatsAppMessage(location.mobile, message, enquiry.enquiry_number);

        if (result.success) {
            this.markBidAsSent(enquiry.enquiry_number, 'first');
            console.log(`[WHATSAPP SERVICE] New bid notification sent to ${location.concernedPerson} (${location.mobile})`);
        }

        return result;
    }

    async sendBidResultNotification(enquiry: Enquiry, bidResult: BidResult): Promise<MessageResult> {
        const location = this.findMatchingLocation(enquiry);
        if (!location) {
            console.log('[WHATSAPP SERVICE] No matching location found for:', enquiry.origin);
            return { success: false, reason: 'No matching location' };
        }

        const messageType = bidResult.won ? 'win' : 'lose';

        // Check if already sent
        if (this.isBidAlreadySent(enquiry.enquiry_number, messageType)) {
            console.log('[WHATSAPP SERVICE] Result message already sent for:', enquiry.enquiry_number);
            return { success: false, reason: 'Already sent' };
        }

        const template = bidResult.won ? location.winMessage : location.loseMessage;
        const message = this.populateMessageTemplate(template, enquiry, location, {
            marketRate: bidResult.marketRate,
            margin: bidResult.margin,
            finalRate: bidResult.finalRate,
            rank: bidResult.rank,
            totalSubmissions: bidResult.totalSubmissions
        });

        const result = await this.sendWhatsAppMessage(location.mobile, message, enquiry.enquiry_number);

        if (result.success) {
            this.markBidAsSent(enquiry.enquiry_number, messageType);
            console.log(`[WHATSAPP SERVICE] ${messageType} notification sent to ${location.concernedPerson} (${location.mobile})`);
        }

        return result;
    }

    async sendTestMessage(testPhone: string, testMessage: string): Promise<MessageResult> {
        if (!testPhone || !testMessage) {
            return { success: false, reason: 'Missing phone number or message' };
        }

        const result = await this.sendWhatsAppMessage(testPhone, testMessage, 'TEST');
        return result;
    }

    // Update configuration
    updateConfig(newConfig: Partial<Config>): void {
        this.config = { ...this.config, ...newConfig };
    }

    // Generate UUID v4
    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Get service status
    getStatus(): {
        enabled: boolean;
        configured: boolean;
        locationsCount: number;
        sentBidsCount: number;
    } {
        return {
            enabled: this.config.whatsappConfig?.enableWhatsApp || false,
            configured: !!(this.config.whatsappConfig?.apiKey && this.config.whatsappConfig?.senderNumber),
            locationsCount: this.config.locations?.length || 0,
            sentBidsCount: this.sentBidsMemory.size
        };
    }

    // Clean old sent bids (optional maintenance)
    cleanOldSentBids(daysOld: number = 30): number {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        let cleanedCount = 0;
        for (const [key, data] of this.sentBidsMemory.entries()) {
            if (new Date(data.sentAt) < cutoffDate) {
                this.sentBidsMemory.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            this.saveSentBids();
            console.log(`[WHATSAPP SERVICE] Cleaned ${cleanedCount} old sent bid records`);
        }

        return cleanedCount;
    }
}

// Export singleton instance
export const whatsappService = new WhatsAppService();
