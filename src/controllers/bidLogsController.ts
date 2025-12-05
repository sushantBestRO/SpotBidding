import { Request, Response } from 'express';
import { db } from '../config/db';
import { bidSubmissionLogs } from '../models/schema';
import { desc, eq, and, gte, sql } from 'drizzle-orm';

/**
 * Get bid submission logs with optional filters
 */
export const getBidSubmissionLogs = async (req: Request, res: Response) => {
    try {
        const { enquiryKey, success, limit = '50' } = req.query;

        let query = db.select().from(bidSubmissionLogs).$dynamic();

        // Apply filters
        const conditions = [];
        if (enquiryKey) {
            conditions.push(eq(bidSubmissionLogs.enquiryKey, enquiryKey as string));
        }
        if (success !== undefined) {
            conditions.push(eq(bidSubmissionLogs.success, success === 'true'));
        }

        if (conditions.length > 0) {
            query = query.where(and(...conditions));
        }

        // Order by most recent first
        query = query.orderBy(desc(bidSubmissionLogs.submittedAt));

        // Apply limit
        const limitNum = parseInt(limit as string) || 50;
        query = query.limit(limitNum);

        const logs = await query;

        res.json({
            success: true,
            count: logs.length,
            logs: logs
        });

    } catch (error: any) {
        console.error('[BidLogsController] Error fetching bid logs:', error.message);
        res.status(500).json({ error: 'Failed to fetch bid submission logs' });
    }
};

/**
 * Get bid submission statistics
 */
export const getBidSubmissionStats = async (req: Request, res: Response) => {
    try {
        const { enquiryKey } = req.query;

        const conditions = enquiryKey
            ? eq(bidSubmissionLogs.enquiryKey, enquiryKey as string)
            : undefined;

        const query = conditions
            ? db.select({
                totalSubmissions: sql<number>`count(*)`,
                successfulBids: sql<number>`sum(case when success = true then 1 else 0 end)`,
                failedBids: sql<number>`sum(case when success = false then 1 else 0 end)`,
                avgResponseTime: sql<number>`avg(response_time_ms)`,
                totalAmount: sql<number>`sum(bid_amount::numeric)`
            }).from(bidSubmissionLogs).where(conditions)
            : db.select({
                totalSubmissions: sql<number>`count(*)`,
                successfulBids: sql<number>`sum(case when success = true then 1 else 0 end)`,
                failedBids: sql<number>`sum(case when success = false then 1 else 0 end)`,
                avgResponseTime: sql<number>`avg(response_time_ms)`,
                totalAmount: sql<number>`sum(bid_amount::numeric)`
            }).from(bidSubmissionLogs);

        const stats = await query;

        res.json({
            success: true,
            stats: stats[0] || {
                totalSubmissions: 0,
                successfulBids: 0,
                failedBids: 0,
                avgResponseTime: 0,
                totalAmount: 0
            }
        });

    } catch (error: any) {
        console.error('[BidLogsController] Error fetching bid stats:', error.message);
        res.status(500).json({ error: 'Failed to fetch bid submission statistics' });
    }
};


/**
 * Get bid submission logs for a specific enquiry with extension breakdown
 */
export const getEnquiryBidHistory = async (req: Request, res: Response) => {
    try {
        const { enquiryKey } = req.params;

        const logs = await db.select()
            .from(bidSubmissionLogs)
            .where(eq(bidSubmissionLogs.enquiryKey, enquiryKey))
            .orderBy(
                bidSubmissionLogs.extensionNumber,
                bidSubmissionLogs.bidNumber,
                bidSubmissionLogs.submittedAt
            );

        // Group by extension
        const groupedByExtension: Record<number, any[]> = {};
        logs.forEach(log => {
            const ext = log.extensionNumber || 0;
            if (!groupedByExtension[ext]) {
                groupedByExtension[ext] = [];
            }
            groupedByExtension[ext].push(log);
        });

        res.json({
            success: true,
            enquiryKey: enquiryKey,
            totalSubmissions: logs.length,
            extensions: groupedByExtension,
            logs: logs
        });

    } catch (error: any) {
        console.error('[BidLogsController] Error fetching enquiry bid history:', error.message);
        res.status(500).json({ error: 'Failed to fetch enquiry bid history' });
    }
};
