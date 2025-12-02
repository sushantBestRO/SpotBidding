-- Complete Migration Script for Spot Bidding Server
-- Run this script to initialize the database or update an existing schema.

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Users (Passwords are hashed with bcrypt)
INSERT INTO users (username, password, name, is_admin)
VALUES 
    ('bestroadways', '$2b$10$W1tBP3NNdZoiYjhU5SsseuZZQaY.FTU8UN1ho0HS3CAiD2RA', 'Best Roadways', true),
    ('admin', '$2b$10$XgB5OhXsACkOXcL/LDrDDuH2wcjrUHyL0XB5Or4iPzjzM0dpAgAFN6', 'Administrator', true)
ON CONFLICT (username) DO NOTHING;

-- 2. System Config Table
CREATE TABLE IF NOT EXISTS system_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    config JSONB DEFAULT '{}',
    global_auth_token TEXT,
    global_email TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT single_row CHECK (id = 1)
);

-- Ensure columns exist if table was created differently before
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_config' AND column_name='global_auth_token') THEN
        ALTER TABLE system_config ADD COLUMN global_auth_token TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_config' AND column_name='global_email') THEN
        ALTER TABLE system_config ADD COLUMN global_email TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_config' AND column_name='config') THEN
        ALTER TABLE system_config ADD COLUMN config JSONB DEFAULT '{}';
    END IF;
END $$;

-- Seed Default Config
INSERT INTO system_config (id, config) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING;

-- 3. Bid Monitors Table
CREATE TABLE IF NOT EXISTS bid_monitors (
    enquiry_key VARCHAR(255) PRIMARY KEY,
    data JSONB,
    status VARCHAR(50) DEFAULT 'active',
    active BOOLEAN DEFAULT TRUE,
    start_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Enquiries Table
CREATE TABLE IF NOT EXISTS enquiries (
    id UUID PRIMARY KEY,
    enquiry_key VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    enquiry_type VARCHAR(50),
    mode VARCHAR(50),
    shipment_type VARCHAR(50),
    status VARCHAR(50),
    origin TEXT,
    destination TEXT,
    bid_close_time TIMESTAMP,
    created_at TIMESTAMP,
    data JSONB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add all specific columns to enquiries
DO $$
BEGIN
    -- List of columns to ensure exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='l1_quote_total_cost_display') THEN ALTER TABLE enquiries ADD COLUMN l1_quote_total_cost_display TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='cargo_type') THEN ALTER TABLE enquiries ADD COLUMN cargo_type JSONB; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='quantity') THEN ALTER TABLE enquiries ADD COLUMN quantity JSONB; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='origin_zip_code') THEN ALTER TABLE enquiries ADD COLUMN origin_zip_code VARCHAR(20); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='destination_zip_code') THEN ALTER TABLE enquiries ADD COLUMN destination_zip_code VARCHAR(20); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='other_origins') THEN ALTER TABLE enquiries ADD COLUMN other_origins JSONB; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='other_origin_zip_codes') THEN ALTER TABLE enquiries ADD COLUMN other_origin_zip_codes JSONB; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='other_destinations') THEN ALTER TABLE enquiries ADD COLUMN other_destinations JSONB; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='other_destination_zip_codes') THEN ALTER TABLE enquiries ADD COLUMN other_destination_zip_codes JSONB; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='bid_open_time') THEN ALTER TABLE enquiries ADD COLUMN bid_open_time TIMESTAMP; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='min_quote_valid_till') THEN ALTER TABLE enquiries ADD COLUMN min_quote_valid_till TIMESTAMP; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='bid_close_timestamp') THEN ALTER TABLE enquiries ADD COLUMN bid_close_timestamp TIMESTAMP; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='enquiry_label') THEN ALTER TABLE enquiries ADD COLUMN enquiry_label VARCHAR(50); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='bidding_closed') THEN ALTER TABLE enquiries ADD COLUMN bidding_closed BOOLEAN; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='bidding_closed_at') THEN ALTER TABLE enquiries ADD COLUMN bidding_closed_at TIMESTAMP; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='archived') THEN ALTER TABLE enquiries ADD COLUMN archived BOOLEAN; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='bid_opening_in') THEN ALTER TABLE enquiries ADD COLUMN bid_opening_in TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='show_consignment_details') THEN ALTER TABLE enquiries ADD COLUMN show_consignment_details BOOLEAN; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='auction_type') THEN ALTER TABLE enquiries ADD COLUMN auction_type VARCHAR(50); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='client_company_name') THEN ALTER TABLE enquiries ADD COLUMN client_company_name VARCHAR(255); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='quotes_sent') THEN ALTER TABLE enquiries ADD COLUMN quotes_sent INTEGER; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='vendor_rank') THEN ALTER TABLE enquiries ADD COLUMN vendor_rank INTEGER; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='shipper') THEN ALTER TABLE enquiries ADD COLUMN shipper JSONB; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='consignee') THEN ALTER TABLE enquiries ADD COLUMN consignee JSONB; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='is_negotiating') THEN ALTER TABLE enquiries ADD COLUMN is_negotiating BOOLEAN; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='editing_enabled') THEN ALTER TABLE enquiries ADD COLUMN editing_enabled BOOLEAN; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='show_cost_of_l1_quote') THEN ALTER TABLE enquiries ADD COLUMN show_cost_of_l1_quote BOOLEAN; END IF;
    
    -- Bidding specific columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='current_bid_amount') THEN ALTER TABLE enquiries ADD COLUMN current_bid_amount NUMERIC; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='bid_count') THEN ALTER TABLE enquiries ADD COLUMN bid_count INTEGER DEFAULT 0; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='bid_1_amount') THEN ALTER TABLE enquiries ADD COLUMN bid_1_amount NUMERIC; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='bid_2_amount') THEN ALTER TABLE enquiries ADD COLUMN bid_2_amount NUMERIC; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='bid_3_amount') THEN ALTER TABLE enquiries ADD COLUMN bid_3_amount NUMERIC; END IF;
END $$;

-- 5. Enquiry Extensions Table
CREATE TABLE IF NOT EXISTS enquiry_extensions (
    id SERIAL PRIMARY KEY,
    enquiry_id UUID REFERENCES enquiries(id),
    previous_bid_close_time TIMESTAMP,
    new_bid_close_time TIMESTAMP,
    last_bid_amount NUMERIC,
    bid_1_amount NUMERIC,
    bid_2_amount NUMERIC,
    bid_3_amount NUMERIC,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure columns exist in extensions table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiry_extensions' AND column_name='last_bid_amount') THEN ALTER TABLE enquiry_extensions ADD COLUMN last_bid_amount NUMERIC; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiry_extensions' AND column_name='bid_1_amount') THEN ALTER TABLE enquiry_extensions ADD COLUMN bid_1_amount NUMERIC; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiry_extensions' AND column_name='bid_2_amount') THEN ALTER TABLE enquiry_extensions ADD COLUMN bid_2_amount NUMERIC; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiry_extensions' AND column_name='bid_3_amount') THEN ALTER TABLE enquiry_extensions ADD COLUMN bid_3_amount NUMERIC; END IF;
END $$;

-- 6. Session Table (for connect-pg-simple)
CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

-- Add constraints and indexes for session table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN
        ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- End of Migration Script
