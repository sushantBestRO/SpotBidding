import { pgTable, serial, text, boolean, timestamp, jsonb, integer, numeric, uuid, pgEnum } from 'drizzle-orm/pg-core';

export const userRoles = pgEnum('user_role', ['admin', 'manager', 'analyst']);

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    username: text('username').unique().notNull(),
    password: text('password').notNull(),
    name: text('name'),
    role: userRoles('role').default('analyst').notNull(),
    isAdmin: boolean('is_admin').default(false), // Deprecated: use role instead
    isActive: boolean('is_active').default(true),
    failedLoginAttempts: integer('failed_login_attempts').default(0),
    lockedUntil: timestamp('locked_until'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by')
});

export const systemConfig = pgTable('system_config', {
    id: integer('id').primaryKey().default(1),
    config: jsonb('config').notNull().default({}),
    globalAuthToken: text('global_auth_token'),
    globalEmail: text('global_email'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by')
});

export const bidMonitors = pgTable('bid_monitors', {
    enquiryKey: text('enquiry_key').primaryKey(),
    data: jsonb('data'),
    status: text('status').default('active'),
    active: boolean('active').default(true),
    startTime: timestamp('start_time'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by')
});

export const enquiries = pgTable('enquiries', {
    id: uuid('id').primaryKey(),
    enquiryKey: text('enquiry_key').unique().notNull(),
    name: text('name'),
    enquiryType: text('enquiry_type'),
    mode: text('mode'),
    shipmentType: text('shipment_type'),
    status: text('status'),
    origin: text('origin'),
    destination: text('destination'),
    bidCloseTime: timestamp('bid_close_time', { withTimezone: true }),

    // New fields
    l1QuoteTotalCostDisplay: text('l1_quote_total_cost_display'),
    cargoType: jsonb('cargo_type'),
    quantity: jsonb('quantity'),
    originZipCode: text('origin_zip_code'),
    destinationZipCode: text('destination_zip_code'),
    otherOrigins: jsonb('other_origins'),
    otherOriginZipCodes: jsonb('other_origin_zip_codes'),
    otherDestinations: jsonb('other_destinations'),
    otherDestinationZipCodes: jsonb('other_destination_zip_codes'),
    bidCreatedAt: timestamp('bid_created_at', { withTimezone: true }),
    bidOpenTime: timestamp('bid_open_time', { withTimezone: true }),
    minQuoteValidTill: timestamp('min_quote_valid_till', { withTimezone: true }),
    bidCloseTimestamp: timestamp('bid_close_timestamp', { withTimezone: true }),
    enquiryLabel: text('enquiry_label'),
    biddingClosed: boolean('bidding_closed'),
    biddingClosedAt: timestamp('bidding_closed_at', { withTimezone: true }),
    archived: boolean('archived'),
    bidOpeningIn: text('bid_opening_in'),
    showConsignmentDetails: boolean('show_consignment_details'),
    auctionType: text('auction_type'),
    clientCompanyName: text('client_company_name'),
    quotesSent: integer('quotes_sent'),
    vendorRank: integer('vendor_rank'),
    shipper: jsonb('shipper'),
    consignee: jsonb('consignee'),
    isNegotiating: boolean('is_negotiating'),
    editingEnabled: boolean('editing_enabled'),
    showCostOfL1Quote: boolean('show_cost_of_l1_quote'),
    currentBidAmount: numeric('current_bid_amount'),
    bidCount: integer('bid_count').default(0),
    bidHighAmount: numeric('bid_high_amount'),
    bidMediumAmount: numeric('bid_medium_amount'),
    bidLowAmount: numeric('bid_low_amount'),
    extensionCount: integer('extension_count').default(0),
    bidSubmitCount: integer('bid_submit_count').default(0),
    biddingStatus: text('bidding_status'), // 'active', 'stopped', or null
    data: jsonb('data'),
    marketRates: jsonb('market_rates'),
    currentBid: jsonb('current_bid'),
    extensionBids: jsonb('extension_bids'), // Stores bids for each extension: { 0: {high, medium, low}, 1: {...}, ... }
    createdAt: timestamp('created_at', { withTimezone: true }),
    createdBy: text('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    updatedBy: text('updated_by')
});

export const enquiryExtensions = pgTable('enquiry_extensions', {
    id: serial('id').primaryKey(),
    enquiryId: uuid('enquiry_id').references(() => enquiries.id),
    extensionNumber: integer('extension_number'),
    previousBidCloseTime: timestamp('previous_bid_close_time', { withTimezone: true }),
    newBidCloseTime: timestamp('new_bid_close_time', { withTimezone: true }),
    lastBidAmount: numeric('last_bid_amount'),
    bidHighAmount: numeric('bid_high_amount'),
    bidMediumAmount: numeric('bid_medium_amount'),
    bidLowAmount: numeric('bid_low_amount'),
    data: jsonb('data'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by')
});

export const bidSubmissionLogs = pgTable('bid_submission_logs', {
    id: serial('id').primaryKey(),
    enquiryId: uuid('enquiry_id').references(() => enquiries.id),
    enquiryKey: text('enquiry_key').notNull(),
    enquiryName: text('enquiry_name'), // Display name of enquiry
    extensionNumber: integer('extension_number').default(0), // 0 for original, 1+ for extensions
    bidNumber: integer('bid_number').notNull(), // 1, 2, or 3
    bidAmount: numeric('bid_amount').notNull(),
    quoteId: text('quote_id'), // GoComet quote ID
    success: boolean('success').notNull(),
    errorMessage: text('error_message'),

    // Context at time of submission
    currentRank: integer('current_rank'),
    timeRemainingSeconds: integer('time_remaining_seconds'),
    bidsSubmittedBefore: integer('bids_submitted_before'), // How many bids were already submitted in this round

    // Metadata
    strategyName: text('strategy_name').default('GoComet'),
    submittedBy: text('submitted_by'), // Username who started the bidding
    submittedByFullName: text('submitted_by_full_name'),

    // Timing
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow(),
    responseTimeMs: integer('response_time_ms'), // How long the API call took

    // Additional data
    metadata: jsonb('metadata') // Any additional context
});

export const session = pgTable('session', {
    sid: text('sid').primaryKey(),
    sess: jsonb('sess').notNull(),
    expire: timestamp('expire').notNull()
});

