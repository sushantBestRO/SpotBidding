import { db } from '../src/config/db';
import { sql } from 'drizzle-orm';

async function runMigration() {
    try {
        console.log('Creating bid_submission_logs table...');

        await db.execute(sql`
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
                
                current_rank INTEGER,
                time_remaining_seconds INTEGER,
                bids_submitted_before INTEGER,
                
                strategy_name TEXT DEFAULT 'GoComet',
                submitted_by TEXT,
                submitted_by_full_name TEXT,
                
                submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                response_time_ms INTEGER,
                
                metadata JSONB
            )
        `);

        console.log('Creating indexes...');

        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bid_logs_enquiry_key ON bid_submission_logs(enquiry_key)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bid_logs_enquiry_id ON bid_submission_logs(enquiry_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bid_logs_submitted_at ON bid_submission_logs(submitted_at)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bid_logs_success ON bid_submission_logs(success)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bid_logs_extension_bid ON bid_submission_logs(enquiry_key, extension_number, bid_number)`);

        console.log('✅ Migration completed successfully!');
        console.log('Table bid_submission_logs has been created with indexes.');

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runMigration();
