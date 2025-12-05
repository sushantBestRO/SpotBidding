-- Migration: Add bidSubmitCount column to enquiries table
-- This column tracks the number of bids submitted in the current round
-- It resets to 0 on every extension

-- Add the bidSubmitCount column with default value 0
ALTER TABLE enquiries 
ADD COLUMN IF NOT EXISTS bid_submit_count INTEGER DEFAULT 0;

-- Update existing records to have bidSubmitCount = 0
UPDATE enquiries 
SET bid_submit_count = 0 
WHERE bid_submit_count IS NULL;

-- Add comment to the column
COMMENT ON COLUMN enquiries.bid_submit_count IS 'Number of bids submitted in current round (resets to 0 on extension)';
