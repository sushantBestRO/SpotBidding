import { db } from '../src/config/db';
import { sql } from 'drizzle-orm';

async function runMigration() {
    try {
        console.log('Adding bid_submit_count column to enquiries table...');

        await db.execute(sql`
            ALTER TABLE enquiries 
            ADD COLUMN IF NOT EXISTS bid_submit_count INTEGER DEFAULT 0
        `);

        console.log('Updating existing records...');

        await db.execute(sql`
            UPDATE enquiries 
            SET bid_submit_count = 0 
            WHERE bid_submit_count IS NULL
        `);

        console.log('Adding column comment...');

        await db.execute(sql`
            COMMENT ON COLUMN enquiries.bid_submit_count IS 'Number of bids submitted in current round (resets to 0 on extension)'
        `);

        console.log('✅ Migration completed successfully!');
        console.log('Column bid_submit_count has been added to enquiries table.');

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runMigration();
