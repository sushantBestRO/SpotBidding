import { db } from '../config/db';
import { systemConfig } from '../models/schema';
import { eq } from 'drizzle-orm';

export const loadConfig = async () => {
    const result = await db.select().from(systemConfig).where(eq(systemConfig.id, 1)).limit(1);
    if (result.length > 0) {
        return result[0].config as any || {};
    }
    return {};
};

export const saveConfig = async (newConfig: any) => {
    try {
        // Merge with existing config to avoid overwriting other fields
        const current = await loadConfig();
        const updated = { ...current, ...newConfig };

        await db.insert(systemConfig).values({
            id: 1,
            config: updated
        }).onConflictDoUpdate({
            target: systemConfig.id,
            set: { config: updated, updatedAt: new Date() }
        });
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        return false;
    }
};
