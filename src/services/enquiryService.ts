import { db } from '../config/db';
import { systemConfig, enquiries as enquiriesTable, enquiryExtensions } from '../models/schema';
import { getHeaders, goCometApi } from '../services/goCometService';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { biddingEngine } from './biddingEngine';
import { inArray } from 'drizzle-orm';
import { formatDateTime, parseDate, parseISTDate, parseTimestamp, formatDateWithAMPM } from '../utils/utils';

export const syncEnquiries = async () => {
    try {
        // Get global token
        const configResult = await db.select().from(systemConfig).limit(1);
        const config = configResult[0];
        const authToken = config?.globalAuthToken;

        if (!authToken) {
            console.log('[EnquirySync] No auth token found, skipping sync.');
            return [];
        }

        const url = `/api/v1/vendor/enquiries/spot?page=1&size=30&reset_filter=false&filter%5Benquiry_type%5D=spot`;
        const response = await goCometApi.get(url, { headers: getHeaders(authToken) });

        const apiEnquiries = response.data.enquiries || [];
        const processedEnquiries: any[] = [];

        console.log(`[EnquirySync] Fetched ${apiEnquiries.length} enquiries from GoComet API.`);

        for (const enquiry of apiEnquiries) {
            const enquiryKey = enquiry.key || 'N/A';

            // Check if enquiry exists in DB
            const existingEnquiry = await db.select().from(enquiriesTable).where(eq(enquiriesTable.enquiryKey, enquiryKey)).limit(1);

            let localData = existingEnquiry[0];
            const apiCloseTime = parseISTDate(enquiry.bid_close_time);

            if (!localData) {
                // Create new enquiry
                try {
                    const newEnquiryId = crypto.randomUUID();
                    await db.insert(enquiriesTable).values({
                        id: newEnquiryId,
                        enquiryKey: enquiryKey,
                        name: enquiry.name,
                        enquiryType: enquiry.enquiry_type,
                        mode: enquiry.mode,
                        shipmentType: enquiry.shipment_type,
                        status: enquiry.status,
                        origin: enquiry.origin,
                        destination: enquiry.destination,
                        bidCloseTime: apiCloseTime,
                        bidCreatedAt: parseISTDate(enquiry.created_at),
                        // Map other fields
                        l1QuoteTotalCostDisplay: enquiry.l1_quote_total_cost_display,
                        cargoType: enquiry.cargo_type,
                        quantity: enquiry.quantity,
                        originZipCode: enquiry.origin_zip_code,
                        destinationZipCode: enquiry.destination_zip_code,
                        otherOrigins: enquiry.other_origins,
                        otherOriginZipCodes: enquiry.other_origin_zip_codes,
                        otherDestinations: enquiry.other_destinations,
                        otherDestinationZipCodes: enquiry.other_destination_zip_codes,
                        bidOpenTime: parseDate(enquiry.bid_open_time),
                        minQuoteValidTill: parseDate(enquiry.min_quote_valid_till),
                        bidCloseTimestamp: parseDate(enquiry.bid_close_timestamp),
                        enquiryLabel: enquiry.enquiry_label,
                        biddingClosed: enquiry.bidding_closed,
                        biddingClosedAt: parseISTDate(enquiry.bidding_closed_at),
                        archived: enquiry.archived,
                        bidOpeningIn: enquiry.bid_opening_in,
                        showConsignmentDetails: enquiry.show_consignment_details,
                        auctionType: enquiry.auction_type,
                        clientCompanyName: enquiry.client_company_name,
                        quotesSent: enquiry.quotes_sent,
                        vendorRank: enquiry.vendor_rank,
                        shipper: enquiry.shipper,
                        consignee: enquiry.consignee,
                        isNegotiating: enquiry.is_negotiating,
                        editingEnabled: enquiry.editing_enabled,
                        showCostOfL1Quote: enquiry.show_cost_of_l1_quote,
                        currentBidAmount: enquiry.current_bid_amount ? enquiry.current_bid_amount.toString() : null,
                        bidCount: enquiry.bid_count,
                        extensionCount: 0,
                        data: enquiry, // Store full raw data as backup
                        createdAt: new Date()
                    });

                    // Fetch the newly created record
                    const newRecord = await db.select().from(enquiriesTable).where(eq(enquiriesTable.enquiryKey, enquiryKey)).limit(1);
                    localData = newRecord[0];
                } catch (err: any) {
                    console.error(`[EnquirySync] Error creating enquiry ${enquiryKey}:`, err.message);
                }
            } else {
                // Update existing enquiry and check for extension
                let extensionDetected = false;
                let extensionCount = localData.extensionCount || 0;

                if (localData.bidCloseTime && apiCloseTime) {
                    const timeDiff = apiCloseTime.getTime() - new Date(localData.bidCloseTime).getTime();
                    // If new time is significantly later (> 1 minute), consider it an extension
                    if (timeDiff > 60000) {
                        extensionDetected = true;
                        extensionCount++;
                        console.log(`[EnquirySync] Extension detected for ${enquiryKey}: ${localData.bidCloseTime} -> ${apiCloseTime}`);

                        // Record extension
                        await db.insert(enquiryExtensions).values({
                            enquiryId: localData.id,
                            extensionNumber: extensionCount,
                            previousBidCloseTime: localData.bidCloseTime,
                            newBidCloseTime: apiCloseTime,
                            lastBidAmount: localData.currentBidAmount ? localData.currentBidAmount.toString() : null,
                            bidHighAmount: localData.bidHighAmount,
                            bidMediumAmount: localData.bidMediumAmount,
                            bidLowAmount: localData.bidLowAmount,
                            data: localData.data
                        });
                    }
                }

                // Update the record
                await db.update(enquiriesTable)
                    .set({
                        status: enquiry.status,
                        vendorRank: enquiry.vendor_rank,
                        quotesSent: enquiry.quotes_sent,
                        bidCloseTime: apiCloseTime,
                        bidCloseTimestamp: parseDate(enquiry.bid_close_timestamp),
                        extensionCount: extensionCount,
                        currentBidAmount: enquiry.current_bid_amount ? enquiry.current_bid_amount.toString() : null,
                        data: enquiry,
                        updatedAt: new Date()
                    })
                    .where(eq(enquiriesTable.enquiryKey, enquiryKey));

                // Update localData object for response
                localData.extensionCount = extensionCount;
            }

            processedEnquiries.push({
                enquiry_number: enquiryKey,
                display_number: enquiry.name || 'N/A',
                rank: enquiry.vendor_rank || 'N/A',
                status: enquiry.status || 'Open',
                origin: enquiry.origin || 'N/A',
                destination: enquiry.destination || 'N/A',
                transport_type: `${enquiry.shipment_type || ''} ${enquiry.mode || ''}`.trim() || 'N/A',
                cargo_quantity: enquiry.quantity || [],
                closing_time: enquiry.bid_close_time || null,
                closing_timestamp: enquiry.bid_close_timestamp || null,
                company_name: enquiry.client_company_name || 'N/A',
                contact_person: enquiry.shipper || enquiry.consignee || 'N/A',
                quotes_sent: enquiry.quotes_sent || 0,
                enquiry_data: enquiry,
                // Merged Data
                extension_count: localData?.extensionCount || 0,
                // Bidding data placeholders
                bidding_data: null,
                bid_amounts: { low: '', medium: '', high: '' },
                bidding_active: false
            });
        }

        return processedEnquiries;

    } catch (error: any) {
        console.error('[EnquirySync] Error syncing enquiries:', error.message);
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            console.error('[EnquirySync] Auth token expired');
        }
        throw error;
    }
};

export const syncClosedBids = async () => {
    try {
        // Get global token
        const configResult = await db.select().from(systemConfig).limit(1);
        const config = configResult[0];
        const authToken = config?.globalAuthToken;

        if (!authToken) {
            console.log('[ClosedBidsSync] No auth token found, skipping sync.');
            return { enquiries: [] };
        }

        // Construct query for today
        const today = new Date();
        let day = String(today.getDate()).padStart(2, '0');
        let month = String(today.getMonth() + 1).padStart(2, '0');
        let year = today.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;


        today.setDate(today.getDate() - 2);
        day = String(today.getDate()).padStart(2, '0');
        month = String(today.getMonth() + 1).padStart(2, '0');
        year = today.getFullYear();
        const twoDaysBackFormattedDate = `${day}/${month}/${year}`;

        const queryString = `page=1&size=30&reset_filter=false&filter%5Bbid_close_time%5D%5Bstart_date%5D=${encodeURIComponent(twoDaysBackFormattedDate)}&filter%5Bbid_close_time%5D%5Bend_date%5D=${encodeURIComponent(formattedDate)}&filter%5Benquiry_type%5D=spot`;
        console.log('[Cron] Fetching closed bids for date:', queryString);

        const params = new URLSearchParams(queryString);
        let currentPage = parseInt(params.get('page') || '1');
        let totalPages = 1; // Will be updated after first call
        let allEnquiries: any[] = [];

        do {
            params.set('page', currentPage.toString());
            const currentQueryString = params.toString();
            const url = `/api/v1/vendor/enquiries/spot?${currentQueryString}`;

            console.log(`[ClosedBidsSync] Fetching page ${currentPage}...`);

            const response = await goCometApi.get(url, { headers: getHeaders(authToken) });
            const data = response.data;
            const apiEnquiries = data.enquiries || [];

            totalPages = data.total_page || 1;
            const apiCurrentPage = data.current_page || currentPage;

            console.log(`[ClosedBidsSync] Page ${apiCurrentPage}/${totalPages}: Fetched ${apiEnquiries.length} enquiries.`);

            for (const enquiry of apiEnquiries) {
                try {
                    await db.transaction(async (tx) => {
                        const enquiryKey = enquiry.key || 'N/A';
                        const apiCloseTime = parseISTDate(enquiry.bid_close_time);

                        // Check if enquiry exists in DB
                        const existingEnquiry = await tx.select().from(enquiriesTable).where(eq(enquiriesTable.enquiryKey, enquiryKey)).limit(1);
                        let localData = existingEnquiry[0];

                        if (!localData) {
                            // Create new enquiry
                            try {
                                const newEnquiryId = crypto.randomUUID();
                                await tx.insert(enquiriesTable).values({
                                    id: newEnquiryId,
                                    enquiryKey: enquiryKey,
                                    name: enquiry.name,
                                    enquiryType: enquiry.enquiry_type,
                                    mode: enquiry.mode,
                                    shipmentType: enquiry.shipment_type,
                                    status: enquiry.status,
                                    origin: enquiry.origin,
                                    destination: enquiry.destination,
                                    bidCloseTime: apiCloseTime,
                                    bidCreatedAt: parseISTDate(enquiry.created_at),
                                    l1QuoteTotalCostDisplay: enquiry.l1_quote_total_cost_display,
                                    cargoType: enquiry.cargo_type,
                                    quantity: enquiry.quantity,
                                    originZipCode: enquiry.origin_zip_code,
                                    destinationZipCode: enquiry.destination_zip_code,
                                    otherOrigins: enquiry.other_origins,
                                    otherOriginZipCodes: enquiry.other_origin_zip_codes,
                                    otherDestinations: enquiry.other_destinations,
                                    otherDestinationZipCodes: enquiry.other_destination_zip_codes,
                                    bidOpenTime: parseDate(enquiry.bid_open_time),
                                    minQuoteValidTill: parseDate(enquiry.min_quote_valid_till),
                                    bidCloseTimestamp: parseDate(enquiry.bid_close_timestamp),
                                    enquiryLabel: enquiry.enquiry_label,
                                    biddingClosed: enquiry.bidding_closed,
                                    biddingClosedAt: parseDate(enquiry.bidding_closed_at),
                                    archived: enquiry.archived,
                                    bidOpeningIn: enquiry.bid_opening_in,
                                    showConsignmentDetails: enquiry.show_consignment_details,
                                    auctionType: enquiry.auction_type,
                                    clientCompanyName: enquiry.client_company_name,
                                    quotesSent: enquiry.quotes_sent,
                                    vendorRank: enquiry.vendor_rank,
                                    shipper: enquiry.shipper,
                                    consignee: enquiry.consignee,
                                    isNegotiating: enquiry.is_negotiating,
                                    editingEnabled: enquiry.editing_enabled,
                                    showCostOfL1Quote: enquiry.show_cost_of_l1_quote,
                                    currentBidAmount: enquiry.current_bid_amount ? enquiry.current_bid_amount.toString() : null,
                                    bidCount: enquiry.bid_count,
                                    extensionCount: 0,
                                    data: enquiry
                                });
                            } catch (err: any) {
                                console.error(`[ClosedBidsSync] Error creating enquiry ${enquiryKey}:`, err.message);
                                throw err; // Re-throw to trigger transaction rollback
                            }
                        } else {
                            // Update existing enquiry
                            await tx.update(enquiriesTable)
                                .set({
                                    status: enquiry.status,
                                    vendorRank: enquiry.vendor_rank,
                                    quotesSent: enquiry.quotes_sent,
                                    bidCloseTime: apiCloseTime,
                                    bidCloseTimestamp: parseDate(enquiry.bid_close_timestamp),
                                    biddingClosed: enquiry.bidding_closed,
                                    biddingClosedAt: parseISTDate(enquiry.bidding_closed_at),
                                    currentBidAmount: enquiry.current_bid_amount ? enquiry.current_bid_amount.toString() : null,
                                    data: enquiry,
                                    updatedAt: new Date()
                                })
                                .where(eq(enquiriesTable.enquiryKey, enquiryKey));
                        }
                    });
                } catch (error: any) {
                    console.error(`[ClosedBidsSync] Transaction failed for enquiry ${enquiry.key || 'N/A'}, rolling back. Error:`, error.message);
                    // Continue to next enquiry
                }
            }

            allEnquiries = [...allEnquiries, ...apiEnquiries];

            if (apiCurrentPage >= totalPages) {
                break;
            }

            currentPage++;

            // Safety break
            if (currentPage > 100) {
                console.log('[ClosedBidsSync] Reached safety limit of 100 pages. Stopping.');
                break;
            }

        } while (currentPage <= totalPages);

        return { enquiries: allEnquiries, total_page: totalPages, current_page: currentPage };

    } catch (error: any) {
        console.error('[ClosedBidsSync] Error syncing closed bids:', error.message);
        throw error;
    }
};

export const processQuotes = async (enquiries: any[], userSession: any) => {
    const quotesWithBidding = [];
    // Process all passed enquiries, filtering is done at the controller/DB level
    const enquiriesToProcess = enquiries;

    // Fetch local enquiry data (including market rates) for all open enquiries
    const openEnquiryKeys = enquiriesToProcess.map((e: any) => e.enquiryKey);
    let localEnquiriesMap: Record<string, any> = {};
    let extensionsMap: Record<string, any[]> = {};

    if (openEnquiryKeys.length > 0) {
        const localEnquiries = await db.select()
            .from(enquiriesTable)
            .where(inArray(enquiriesTable.enquiryKey, openEnquiryKeys));

        const localEnquiryIds = localEnquiries.map(le => le.id);

        // Fetch extensions for these enquiries
        if (localEnquiryIds.length > 0) {
            const extensions = await db.select()
                .from(enquiryExtensions)
                .where(inArray(enquiryExtensions.enquiryId, localEnquiryIds))
                .orderBy(enquiryExtensions.extensionNumber);

            extensions.forEach(ext => {
                if (ext.enquiryId) {
                    if (!extensionsMap[ext.enquiryId]) {
                        extensionsMap[ext.enquiryId] = [];
                    }
                    extensionsMap[ext.enquiryId].push(ext);
                }
            });
        }

        localEnquiries.forEach(le => {
            localEnquiriesMap[le.enquiryKey] = le;
        });
    }

    for (const enquiry of enquiriesToProcess) {
        const enquiryNumber = enquiry.enquiryKey || 'N/A';
        const currentRank = enquiry.vendorRank || 'N/A';

        // Unit details logic - try to extract from enquiry data if available
        // Note: charges_list is not a top-level column in DB schema. 
        // If it's not present in the passed enquiry object (which is now a DB entity), this will be null.
        let unitDetails = null;
        try {
            // If the passed enquiry object has 'data' property populated (e.g. from a previous fetch that included it), we might find it there.
            // But user requested to use individual columns. 
            // We check if 'data' exists on the object just in case, or if we can map from other fields.
            const quoteData = enquiry.data || enquiry;

            if (quoteData && quoteData.charges_list?.['11_freight_charges']) {
                const freightCharges = quoteData.charges_list['11_freight_charges'];
                const chargeKeys = Object.keys(freightCharges).filter(key =>
                    key.startsWith('freight_charges_custom_charge') && key !== 'display_name'
                );

                if (chargeKeys.length > 0) {
                    const unitDetailsArray = [];
                    let totalUnits = 0;

                    for (const chargeKey of chargeKeys) {
                        const charge = freightCharges[chargeKey];
                        const units = Number(charge.units) || 0;
                        totalUnits += units;

                        unitDetailsArray.push({
                            type: charge.display_name || chargeKey,
                            units: units,
                            unitName: charge.unit_name || 'UNIT',
                            description: `${units} × ${charge.unit_name || 'UNIT'}`
                        });
                    }

                    unitDetails = {
                        totalUnits,
                        charges: unitDetailsArray,
                        description: unitDetailsArray.map((u: any) => u.description).join(' + ')
                    };
                }
            }
        } catch (e: any) {
            console.log(`[QuoteService] Could not parse unit details for ${enquiryNumber}:`, e.message);
        }

        // Get bidding status
        const monitor = biddingEngine.getStatus(enquiryNumber);

        quotesWithBidding.push({
            enquiry_number: enquiryNumber,
            display_number: enquiry.name || 'N/A',
            rank: currentRank,
            status: enquiry.status || 'Open',
            origin: enquiry.origin || 'N/A',
            destination: enquiry.destination || 'N/A',
            transport_type: `${enquiry.shipmentType || ''} ${enquiry.mode || ''}`.trim() || 'N/A',
            cargo_quantity: enquiry.quantity || [],
            closing_time: formatDateTime(enquiry.bidCloseTime) || null,
            closing_timestamp: enquiry.bidCloseTimestamp ? new Date(enquiry.bidCloseTimestamp).getTime() / 1000 : null, // Convert Date to unix timestamp if needed, or pass as is if frontend handles it
            company_name: enquiry.clientCompanyName || 'N/A',
            contact_person: (enquiry.shipper && (enquiry.shipper as any).name) || (enquiry.consignee && (enquiry.consignee as any).name) || 'N/A', // Assuming shipper/consignee are JSON objects with name
            quotes_sent: enquiry.quotesSent || 0,
            enquiry_data: enquiry, // This now contains DB columns
            bidding_data: null,
            unit_details: unitDetails,
            bid_amounts: (() => {
                const localData = localEnquiriesMap[enquiryNumber];
                const marketRates = localData?.marketRates as any || {};
                // Default market value (assuming single cargo or taking default)
                const dbMarketValue = marketRates.default?.amount || '';
                const dbUpdatedBy = marketRates.default?.updatedBy || '';
                const dbUpdatedAt = marketRates.default?.updatedAt || '';

                if (monitor && monitor.bids) {
                    return {
                        ...monitor.bids,
                        high: enquiry.bidHighAmount,
                        medium: enquiry.bidMediumAmount,
                        low: enquiry.bidLowAmount,
                        marketValue: dbMarketValue,
                        marketValueUpdatedBy: dbUpdatedBy,
                        marketValueUpdatedAt: formatDateWithAMPM(dbUpdatedAt)
                    };
                }
                const userBids = userSession.bids?.[enquiryNumber] || { low: '', medium: '', high: '' };

                return {
                    //...userBids,
                    high: enquiry.bidHighAmount,
                    medium: enquiry.bidMediumAmount,
                    low: enquiry.bidLowAmount,
                    marketValue: userBids.marketValue || dbMarketValue,
                    marketValueUpdatedBy: dbUpdatedBy,
                    marketValueUpdatedAt: formatDateWithAMPM(dbUpdatedAt)
                };
            })(),
            bidding_active: !!(monitor && monitor.status === 'active'),
            extensions: (() => {
                const localData = localEnquiriesMap[enquiryNumber];
                if (localData && localData.id && extensionsMap[localData.id]) {
                    return extensionsMap[localData.id];
                }
                return [];
            })()
        });
    }

    return quotesWithBidding;
};
