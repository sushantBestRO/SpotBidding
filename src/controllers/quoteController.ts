import { Request, Response } from 'express';
import { db } from '../config/db';
import { enquiries as enquiriesTable, enquiryExtensions } from '../models/schema';
import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { processQuotes } from '../services/enquiryService';

export const getQuotes = async (req: Request, res: Response) => {
    console.log('[QuoteController] Request received from user:', (req.session as any).user?.username);

    try {
        const { status } = req.query;
        const statusFilter = (status as string) || 'Open'; // Default to 'Open'

        console.log(`[QuoteController] Fetching quotes with status: ${statusFilter}`);

        // Fetch enquiries from DB with status filter
        // We use ilike for case-insensitive matching if needed, or just eq if normalized.
        // Assuming 'Open' and 'Closed' are the main statuses.
        // If statusFilter is 'Closed', we might want to include 'Cancelled' etc?
        // For now, simple equality check.

        let query = db.select().from(enquiriesTable).$dynamic();

        if (statusFilter === 'Closed') {
            // If closed, we might want everything NOT Open? Or specifically 'Closed'?
            // Let's assume strict filtering for now as requested.
            // But usually 'Closed' implies history.
            query = query.where(eq(enquiriesTable.status, 'Closed'));
        } else {
            query = query.where(eq(enquiriesTable.status, 'Open'));
        }

        // Actually, let's just use the passed status directly to be flexible
        // But we need to handle the default 'Open' case if param is missing.
        // And maybe case insensitivity.

        // Let's refine:
        // If status is provided, use it. If not, 'Open'.
        // But we need to handle case sensitivity. DB usually has 'Open', 'Closed'.

        // Re-implementing with simple logic:
        const targetStatus = statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1).toLowerCase(); // Normalize to Title Case e.g. 'Open', 'Closed'

        const allEnquiries = await db.select()
            .from(enquiriesTable)
            .where(eq(enquiriesTable.status, targetStatus))
            .orderBy(asc(enquiriesTable.bidCloseTimestamp));

        console.log(`[QuoteController] Total ${targetStatus} enquiries from DB:`, allEnquiries.length);

        // processQuotes now expects DB entity structure (camelCase)
        const quotesWithBidding = await processQuotes(allEnquiries, req.session as any);

        console.log(`[QuoteController] Returning ${quotesWithBidding.length} quotes.`);
        res.json({ quotes: quotesWithBidding });

    } catch (error: any) {
        console.error('[QuoteController] Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch quotes', details: error.message });
    }
};

export const getQuoteDetails = async (req: Request, res: Response) => {
    const { enquiryKey } = req.params;

    try {
        // Fetch enquiry from DB
        const localEnquiry = await db.select().from(enquiriesTable).where(eq(enquiriesTable.enquiryKey, enquiryKey)).limit(1);

        if (localEnquiry.length === 0) {
            return res.status(404).json({ error: 'Enquiry not found' });
        }

        const enquiry = localEnquiry[0];

        // Fetch extensions history
        const extensions = await db.select()
            .from(enquiryExtensions)
            .where(eq(enquiryExtensions.enquiryId, enquiry.id))
            .orderBy(enquiryExtensions.extensionNumber);

        // Format according to old logic: return quotes array and extensions.
        // Since we don't have separate quote objects in DB, we use the enquiry data.
        // We return the full enquiry object (DB entity) now.
        res.json({
            quotes: [enquiry],
            extensions: extensions
        });

    } catch (error: any) {
        console.error('Error fetching quote details:', error.message);
        res.status(500).json({ error: 'Failed to fetch quote details' });
    }
};


export const getClosedBids = async (req: Request, res: Response) => {
    try {
        console.log('[QuoteController] Fetching closed bids from DB');

        const { filter } = req.query as any;
        console.log('[QuoteController] Received filter:', JSON.stringify(filter));
        // filter might be an object like { bid_close_time: { start_date: '...', end_date: '...' } }

        let query = db.select().from(enquiriesTable).$dynamic();
        const conditions = [];

        // Filter where status is not 'Open'
        conditions.push(ne(enquiriesTable.status, 'Open'));

        if (filter && filter.bid_close_time) {
            const { start_date, end_date } = filter.bid_close_time;

            if (start_date) {
                const startDateStr = parseFilterDateToString(start_date, false);
                if (startDateStr) {
                    // Use SQL raw string comparison to avoid timezone conversion issues
                    conditions.push(sql`${enquiriesTable.bidCloseTime} >= ${startDateStr}::timestamp`);
                }
            }

            if (end_date) {
                const endDateStr = parseFilterDateToString(end_date, true);
                if (endDateStr) {
                    conditions.push(sql`${enquiriesTable.bidCloseTime} <= ${endDateStr}::timestamp`);
                }
            }
        }

        if (conditions.length > 0) {
            query = query.where(and(...conditions));
        }

        // Sort by bidCloseTime desc
        query = query.orderBy(desc(enquiriesTable.bidCloseTime));

        const results = await query;

        // Map to API format expected by frontend
        const enquiries = results.map(e => ({
            key: e.enquiryKey,
            name: e.name,
            enquiry_type: e.enquiryType,
            mode: e.mode,
            shipment_type: e.shipmentType,
            status: e.status,
            origin: e.origin,
            destination: e.destination,
            bid_close_time: e.bidCloseTime ? e.bidCloseTime.toISOString() : null,
            created_at: e.createdAt ? e.createdAt.toISOString() : null,
            l1_quote_total_cost_display: e.l1QuoteTotalCostDisplay,
            cargo_type: e.cargoType,
            quantity: e.quantity,
            origin_zip_code: e.originZipCode,
            destination_zip_code: e.destinationZipCode,
            other_origins: e.otherOrigins,
            other_origin_zip_codes: e.otherOriginZipCodes,
            other_destinations: e.otherDestinations,
            other_destination_zip_codes: e.otherDestinationZipCodes,
            bid_open_time: e.bidOpenTime ? e.bidOpenTime.toISOString() : null,
            min_quote_valid_till: e.minQuoteValidTill ? e.minQuoteValidTill.toISOString() : null,
            bid_close_timestamp: e.bidCloseTimestamp ? Math.floor(e.bidCloseTimestamp.getTime() / 1000) : null,
            enquiry_label: e.enquiryLabel,
            bidding_closed: e.biddingClosed,
            bidding_closed_at: e.biddingClosedAt ? e.biddingClosedAt.toISOString() : null,
            archived: e.archived,
            bid_opening_in: e.bidOpeningIn,
            show_consignment_details: e.showConsignmentDetails,
            auction_type: e.auctionType,
            client_company_name: e.clientCompanyName,
            quotes_sent: e.quotesSent,
            vendor_rank: e.vendorRank,
            shipper: e.shipper,
            consignee: e.consignee,
            is_negotiating: e.isNegotiating,
            editing_enabled: e.editingEnabled,
            show_cost_of_l1_quote: e.showCostOfL1Quote,
            current_bid_amount: e.currentBidAmount,
            bid_count: e.bidCount
        }));

        res.json({ enquiries });

    } catch (error: any) {
        console.error('[QuoteController] Error fetching closed bids:', error.message);
        res.status(500).json({ error: 'Failed to fetch closed bids' });
    }
};

/**
 * Get all extensions for a specific enquiry, sorted by closing date
 */
export const getEnquiryExtensions = async (req: Request, res: Response) => {
    try {
        const { enquiryKey } = req.params;

        console.log(`[QuoteController] Fetching extensions for enquiry: ${enquiryKey}`);

        // First, get the enquiry to get its ID
        const enquiryRecords = await db.select()
            .from(enquiriesTable)
            .where(eq(enquiriesTable.enquiryKey, enquiryKey))
            .limit(1);

        if (enquiryRecords.length === 0) {
            return res.status(404).json({ error: 'Enquiry not found' });
        }

        const enquiry = enquiryRecords[0];

        // Fetch all extensions for this enquiry, sorted by new bid close time
        const extensions = await db.select()
            .from(enquiryExtensions)
            .where(eq(enquiryExtensions.enquiryId, enquiry.id))
            .orderBy(enquiryExtensions.newBidCloseTime);

        console.log(`[QuoteController] Found ${extensions.length} extensions for ${enquiryKey}`);

        // Format the response with IST timezone
        const formattedExtensions = extensions.map(ext => ({
            id: ext.id,
            extensionNumber: ext.extensionNumber,
            previousBidCloseTime: ext.previousBidCloseTime ? ext.previousBidCloseTime.toISOString() : null,
            newBidCloseTime: ext.newBidCloseTime ? ext.newBidCloseTime.toISOString() : null,
            lastBidAmount: ext.lastBidAmount,
            bidHighAmount: ext.bidHighAmount,
            bidMediumAmount: ext.bidMediumAmount,
            bidLowAmount: ext.bidLowAmount,
            data: ext.data,
            createdAt: ext.createdAt ? ext.createdAt.toISOString() : null,
            updatedAt: ext.updatedAt ? ext.updatedAt.toISOString() : null,
            createdBy: ext.createdBy,
            updatedBy: ext.updatedBy
        }));

        res.json({
            success: true,
            enquiryKey: enquiryKey,
            enquiryName: enquiry.name,
            totalExtensions: extensions.length,
            extensions: formattedExtensions
        });

    } catch (error: any) {
        console.error('[QuoteController] Error fetching enquiry extensions:', error.message);
        res.status(500).json({ error: 'Failed to fetch enquiry extensions' });
    }
};

function parseFilterDateToString(dateStr: string, isEnd: boolean = false): string | null {
    if (!dateStr) return null;
    // Expecting DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        const datePart = `${year}-${month}-${day}`;
        return isEnd ? `${datePart} 23:59:59` : `${datePart} 00:00:00`;
    }
    return null;
}
