import { db } from '../config/db';
import { sql } from 'drizzle-orm';

const migrate = async () => {
    try {
        console.log('Starting timestamp migration...');

        // Enquiries table
        await db.execute(sql`ALTER TABLE enquiries ALTER COLUMN bid_close_time TYPE timestamp with time zone USING bid_close_time AT TIME ZONE 'UTC'`);
        await db.execute(sql`ALTER TABLE enquiries ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC'`);
        await db.execute(sql`ALTER TABLE enquiries ALTER COLUMN bid_open_time TYPE timestamp with time zone USING bid_open_time AT TIME ZONE 'UTC'`);
        await db.execute(sql`ALTER TABLE enquiries ALTER COLUMN min_quote_valid_till TYPE timestamp with time zone USING min_quote_valid_till AT TIME ZONE 'UTC'`);
        await db.execute(sql`ALTER TABLE enquiries ALTER COLUMN bid_close_timestamp TYPE timestamp with time zone USING bid_close_timestamp AT TIME ZONE 'UTC'`);
        await db.execute(sql`ALTER TABLE enquiries ALTER COLUMN bidding_closed_at TYPE timestamp with time zone USING bidding_closed_at AT TIME ZONE 'UTC'`);
        await db.execute(sql`ALTER TABLE enquiries ALTER COLUMN updated_at TYPE timestamp with time zone USING updated_at AT TIME ZONE 'UTC'`);

        // Enquiry Extensions table
        await db.execute(sql`ALTER TABLE enquiry_extensions ALTER COLUMN previous_bid_close_time TYPE timestamp with time zone USING previous_bid_close_time AT TIME ZONE 'UTC'`);
        await db.execute(sql`ALTER TABLE enquiry_extensions ALTER COLUMN new_bid_close_time TYPE timestamp with time zone USING new_bid_close_time AT TIME ZONE 'UTC'`);
        await db.execute(sql`ALTER TABLE enquiry_extensions ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC'`);
        await db.execute(sql`ALTER TABLE enquiry_extensions ALTER COLUMN updated_at TYPE timestamp with time zone USING updated_at AT TIME ZONE 'UTC'`);

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error: any) {
        console.error('Migration failed:', error.message);
        process.exit(1);
    }
};

migrate();
