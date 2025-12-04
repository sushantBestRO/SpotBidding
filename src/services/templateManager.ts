import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface WhatsAppConfig {
    apiKey?: string;
    senderNumber?: string;
}

interface AppConfig {
    whatsappConfig: WhatsAppConfig;
    [key: string]: any;
}

interface TemplateComponent {
    text: string;
    [key: string]: any;
}

interface TemplateComponents {
    body: TemplateComponent;
    footer?: TemplateComponent;
    header?: TemplateComponent;
    [key: string]: any;
}

interface TemplateData {
    name: string;
    language: string;
    category: 'UTILITY' | 'MARKETING';
    components: TemplateComponents;
    description?: string;
    status?: string;
    createdAt?: string;
    lastUpdated?: string;
    notes?: string;
    apiResponse?: any;
}

interface TemplateMap {
    [key: string]: TemplateData;
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

class TemplateManager {
    private config: AppConfig | null = null;
    private templatesFile: string;
    private templates: TemplateMap = {};

    constructor() {
        this.loadConfig();
        // Using process.cwd() to locate files in the project root, consistent with web_config.json location
        this.templatesFile = path.join(process.cwd(), 'whatsapp_templates.json');
        this.loadTemplates();
    }

    private loadConfig() {
        try {
            const configPath = path.join(process.cwd(), 'web_config.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                this.config = JSON.parse(configData);
            } else {
                console.warn('[TEMPLATE MANAGER] web_config.json not found');
                this.config = { whatsappConfig: {} };
            }
        } catch (error) {
            console.error('[TEMPLATE MANAGER] Error loading config:', error);
            this.config = { whatsappConfig: {} };
        }
    }

    private loadTemplates() {
        try {
            if (fs.existsSync(this.templatesFile)) {
                const data = fs.readFileSync(this.templatesFile, 'utf8');
                this.templates = JSON.parse(data);
            } else {
                this.templates = {};
            }
        } catch (error) {
            console.error('[TEMPLATE MANAGER] Error loading templates:', error);
            this.templates = {};
        }
    }

    private saveTemplates(): boolean {
        try {
            fs.writeFileSync(this.templatesFile, JSON.stringify(this.templates, null, 2));
            return true;
        } catch (error) {
            console.error('[TEMPLATE MANAGER] Error saving templates:', error);
            return false;
        }
    }

    // Predefined templates for freight bidding
    getFreightBiddingTemplates(): TemplateMap {
        return {
            freight_bid_new: {
                name: 'freight_bid_new',
                language: 'en',
                category: 'UTILITY',
                components: {
                    body: {
                        text: '🚛 New freight bid available for {{1}}.\n\nRoute: {{2}} to {{3}}\nCargo: {{4}}\nDeadline: {{5}}\n\nSubmit your rate: {{6}}'
                    },
                    footer: {
                        text: 'GoComet Bidder System'
                    }
                },
                description: 'Notification for new freight bids'
            },
            freight_bid_won: {
                name: 'freight_bid_won',
                language: 'en',
                category: 'UTILITY',
                components: {
                    body: {
                        text: '🎉 Congratulations! You have WON the bid for {{1}}.\n\nRoute: {{2}} to {{3}}\nYour Rate: ₹{{4}}\nFinal Rank: {{5}}\nTotal Submissions: {{6}}'
                    },
                    footer: {
                        text: 'GoComet Bidder System'
                    }
                },
                description: 'Notification for winning bids'
            },
            freight_bid_lost: {
                name: 'freight_bid_lost',
                language: 'en',
                category: 'UTILITY',
                components: {
                    body: {
                        text: 'Bid closed for {{1}}.\n\nRoute: {{2}} to {{3}}\nYour Rate: ₹{{4}}\nFinal Rank: {{5}}\nTotal Submissions: {{6}}\n\nBetter luck next time!'
                    },
                    footer: {
                        text: 'GoComet Bidder System'
                    }
                },
                description: 'Notification for lost bids'
            },
            freight_urgent: {
                name: 'freight_urgent',
                language: 'en',
                category: 'UTILITY',
                components: {
                    body: {
                        text: '⚡ URGENT: Bid closing soon for {{1}}!\n\nRoute: {{2}} to {{3}}\nTime Remaining: {{4}}\n\nSubmit your rate NOW: {{5}}'
                    },
                    footer: {
                        text: 'GoComet Bidder System'
                    }
                },
                description: 'Urgent notification for closing bids'
            }
        };
    }

    // Create a single template via DoubleTick API
    async createTemplate(templateData: TemplateData) {
        const { apiKey, senderNumber } = this.config?.whatsappConfig || {};

        if (!apiKey || !senderNumber) {
            return {
                success: false,
                error: 'WhatsApp API key or sender number not configured'
            };
        }

        try {
            const payload = {
                language: templateData.language,
                name: templateData.name,
                category: templateData.category,
                wabaNumbers: [senderNumber],
                components: templateData.components,
                allowCategoryUpdate: true
            };

            console.log(`[TEMPLATE MANAGER] Creating template: ${templateData.name}`);
            console.log(`[TEMPLATE MANAGER] Payload:`, JSON.stringify(payload, null, 2));

            const response = await axios.post(
                'https://public.doubletick.io/template',
                payload,
                {
                    headers: {
                        'Authorization': apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }
            );

            // Store template info locally
            this.templates[templateData.name] = {
                ...templateData,
                status: 'pending_approval',
                createdAt: new Date().toISOString(),
                apiResponse: response.data
            };

            this.saveTemplates();

            console.log(`[TEMPLATE MANAGER] Template ${templateData.name} created successfully`);
            return {
                success: true,
                templateName: templateData.name,
                status: 'pending_approval',
                response: response.data
            };

        } catch (error: any) {
            console.error(`[TEMPLATE MANAGER] Error creating template ${templateData.name}:`, error.response?.data || error.message);

            return {
                success: false,
                error: error.response?.data || error.message,
                templateName: templateData.name
            };
        }
    }

    // Create all freight bidding templates
    async createAllFreightTemplates() {
        const templates = this.getFreightBiddingTemplates();
        const results = [];

        console.log('[TEMPLATE MANAGER] Creating all freight bidding templates...');

        const templateEntries = Object.entries(templates);
        for (let i = 0; i < templateEntries.length; i++) {
            const [templateName, templateData] = templateEntries[i];
            console.log(`[TEMPLATE MANAGER] Processing template: ${templateName}`);

            const result = await this.createTemplate(templateData);
            results.push({
                templateName,
                ...result
            });

            // Add delay between requests to avoid rate limiting
            if (i < templateEntries.length - 1) {
                console.log('[TEMPLATE MANAGER] Waiting 2 seconds before next template...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        return results;
    }

    // Get list of created templates
    getCreatedTemplates() {
        return this.templates;
    }

    // Get template by name
    getTemplate(templateName: string) {
        return this.templates[templateName] || null;
    }

    // Update template status (useful for tracking approval status)
    updateTemplateStatus(templateName: string, status: string, notes: string = '') {
        if (this.templates[templateName]) {
            this.templates[templateName].status = status;
            this.templates[templateName].lastUpdated = new Date().toISOString();
            if (notes) {
                this.templates[templateName].notes = notes;
            }
            this.saveTemplates();
            return true;
        }
        return false;
    }

    // Generate template creation report
    generateReport() {
        const templates = this.getCreatedTemplates();
        const report = {
            totalTemplates: Object.keys(templates).length,
            pendingApproval: 0,
            approved: 0,
            rejected: 0,
            templates: [] as any[]
        };

        for (const [name, template] of Object.entries(templates)) {
            const templateInfo = {
                name,
                status: template.status,
                createdAt: template.createdAt,
                description: template.description
            };

            report.templates.push(templateInfo);

            switch (template.status) {
                case 'pending_approval':
                    report.pendingApproval++;
                    break;
                case 'approved':
                    report.approved++;
                    break;
                case 'rejected':
                    report.rejected++;
                    break;
            }
        }

        return report;
    }

    // Validate template data before creation
    validateTemplate(templateData: TemplateData): ValidationResult {
        const errors: string[] = [];

        if (!templateData.name || templateData.name.length < 1 || templateData.name.length > 512) {
            errors.push('Template name must be 1-512 characters long');
        }

        if (!templateData.language) {
            errors.push('Language is required');
        }

        if (!templateData.category || !['UTILITY', 'MARKETING'].includes(templateData.category)) {
            errors.push('Category must be either UTILITY or MARKETING');
        }

        if (!templateData.components || !templateData.components.body || !templateData.components.body.text) {
            errors.push('Template body text is required');
        }

        if (templateData.components.body.text.length > 1024) {
            errors.push('Body text must not exceed 1024 characters');
        }

        if (templateData.components.header && templateData.components.header.text && templateData.components.header.text.length > 60) {
            errors.push('Header text must not exceed 60 characters');
        }

        if (templateData.components.footer && templateData.components.footer.text && templateData.components.footer.text.length > 60) {
            errors.push('Footer text must not exceed 60 characters');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

export const templateManager = new TemplateManager();
