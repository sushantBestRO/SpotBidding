import { loadConfig } from './configService';

export const whatsappService = {
    loadConfig: async () => {
        const config = await loadConfig();
        return config.whatsappConfig || {};
    },

    sendTestMessage: async (phone: string, message: string) => {
        console.log(`[WHATSAPP] Sending test message to ${phone}: ${message}`);
        return { success: true, messageId: 'mock-whatsapp-id-' + Date.now() };
    }
};
