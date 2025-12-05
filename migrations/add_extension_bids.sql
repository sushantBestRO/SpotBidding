-- Migration: Add extension_bids column to enquiries table
-- This column stores pre-calculated bid amounts for each extension (0-20)

-- Add the extension_bids column
ALTER TABLE enquiries 
ADD COLUMN IF NOT EXISTS extension_bids JSONB;

-- Add comment to the column
COMMENT ON COLUMN enquiries.extension_bids IS 'Pre-calculated bid amounts for each extension round (0-20): {0: {high, medium, low}, 1: {...}, ...}';
