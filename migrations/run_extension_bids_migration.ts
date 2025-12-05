import { db } from '../src/config/db';
import { sql } from 'drizzle-orm';

async function runMigration() {
    try {
        console.log('Adding extension_bids column to enquiries table...');

        await db.execute(sql`
            ALTER TABLE enquiries 
            ADD COLUMN IF NOT EXISTS extension_bids JSONB
        `);

        console.log('Adding column comment...');

        await db.execute(sql`
            COMMENT ON COLUMN enquiries.extension_bids IS 'Pre-calculated bid amounts for each extension round (0-20): {0: {high, medium, low}, 1: {...}, ...}'
        `);

        console.log('✅ Migration completed successfully!');
        console.log('Column extension_bids has been added to enquiries table.');

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runMigration();
