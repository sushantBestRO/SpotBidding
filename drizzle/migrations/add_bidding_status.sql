-- Add bidding_status column to enquiries table
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS bidding_status TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN enquiries.bidding_status IS 'Current bidding status: active, stopped, or null (not started)';

-- Update existing active monitors to set bidding_status
UPDATE enquiries 
SET bidding_status = 'active'
WHERE enquiry_key IN (
    SELECT enquiry_key 
    FROM bid_monitors 
    WHERE active = true
);
