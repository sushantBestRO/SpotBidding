-- Migration: Add bid_submission_logs table
-- This table tracks all bid submissions made by the automated bidding system

CREATE TABLE IF NOT EXISTS bid_submission_logs (
    id SERIAL PRIMARY KEY,
    enquiry_id UUID REFERENCES enquiries(id),
    enquiry_key TEXT NOT NULL,
    enquiry_name TEXT,
    extension_number INTEGER DEFAULT 0,
    bid_number INTEGER NOT NULL,
    bid_amount NUMERIC NOT NULL,
    quote_id TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    
    -- Context at time of submission
    current_rank INTEGER,
    time_remaining_seconds INTEGER,
    bids_submitted_before INTEGER,
    
    -- Metadata
    strategy_name TEXT DEFAULT 'GoComet',
    submitted_by TEXT,
    submitted_by_full_name TEXT,
    
    -- Timing
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    response_time_ms INTEGER,
    
    -- Additional data
    metadata JSONB
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bid_logs_enquiry_key ON bid_submission_logs(enquiry_key);
CREATE INDEX IF NOT EXISTS idx_bid_logs_enquiry_id ON bid_submission_logs(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_bid_logs_submitted_at ON bid_submission_logs(submitted_at);
CREATE INDEX IF NOT EXISTS idx_bid_logs_success ON bid_submission_logs(success);
CREATE INDEX IF NOT EXISTS idx_bid_logs_extension_bid ON bid_submission_logs(enquiry_key, extension_number, bid_number);

-- Add comment to table
COMMENT ON TABLE bid_submission_logs IS 'Logs all bid submissions made by the automated bidding engine';
COMMENT ON COLUMN bid_submission_logs.extension_number IS '0 for original bidding round, 1+ for each extension';
COMMENT ON COLUMN bid_submission_logs.bid_number IS 'Bid sequence number: 1 (high), 2 (medium), or 3 (low)';
COMMENT ON COLUMN bid_submission_logs.bids_submitted_before IS 'Number of bids already submitted in this extension round before this one';
