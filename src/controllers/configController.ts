import { Request, Response } from 'express';
import { db } from '../config/db';
import { systemConfig } from '../models/schema';
import { eq } from 'drizzle-orm';

export const setAuthToken = async (req: Request, res: Response) => {
    let { authToken } = req.body;

    // Strip "Bearer " prefix if present
    if (authToken && authToken.startsWith('Bearer ')) {
        authToken = authToken.substring(7);
    }

    try {
        // Update or insert config (ID is always 1)
        await db.insert(systemConfig).values({
            id: 1,
            globalAuthToken: authToken,
            config: {}
        }).onConflictDoUpdate({
            target: systemConfig.id,
            set: { globalAuthToken: authToken }
        });

        console.log('[SET TOKEN] Token saved to config');
        res.json({ success: true });

    } catch (error: any) {
        console.error('Error saving auth token:', error);
        res.status(500).json({ error: 'Failed to save auth token' });
    }
};

export const getConfig = async (req: Request, res: Response) => {
    try {
        const result = await db.select().from(systemConfig).limit(1);
        const config = result[0] || {};
        // Don't return the full token for security, just existence
        res.json({
            hasToken: !!config.globalAuthToken,
            globalEmail: config.globalEmail
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch config' });
    }
};
