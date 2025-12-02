import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('ERROR: DATABASE_URL is not defined in .env file.');
  console.error('Please create a .env file with DATABASE_URL=postgresql://user:password@localhost:5432/dbname');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
});

// Test connection
pool.on('error', (err: Error, client: PoolClient) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

async function initDb(): Promise<void> {
  const client: PoolClient = await pool.connect();
  try {
    console.log('[DB] Initializing database schema...');

    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Config table (single row singleton)
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        config JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT single_row CHECK (id = 1)
      );
    `);

    // Bid Monitors / Global Status
    await client.query(`
      CREATE TABLE IF NOT EXISTS bid_monitors (
        enquiry_key VARCHAR(255) PRIMARY KEY,
        data JSONB NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Enquiries table
    await client.query(`
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
        
        -- New fields
        l1_quote_total_cost_display TEXT,
        cargo_type JSONB,
        quantity JSONB,
        origin_zip_code VARCHAR(20),
        destination_zip_code VARCHAR(20),
        other_origins JSONB,
        other_origin_zip_codes JSONB,
        other_destinations JSONB,
        other_destination_zip_codes JSONB,
        bid_open_time TIMESTAMP,
        min_quote_valid_till TIMESTAMP,
        bid_close_timestamp TIMESTAMP,
        enquiry_label VARCHAR(50),
        bidding_closed BOOLEAN,
        bidding_closed_at TIMESTAMP,
        archived BOOLEAN,
        bid_opening_in TEXT,
        show_consignment_details BOOLEAN,
        auction_type VARCHAR(50),
        client_company_name VARCHAR(255),
        quotes_sent INTEGER,
        vendor_rank INTEGER,
        shipper JSONB,
        consignee JSONB,
        is_negotiating BOOLEAN,
        editing_enabled BOOLEAN,
        show_cost_of_l1_quote BOOLEAN,
        current_bid_amount NUMERIC,
        bid_count INTEGER DEFAULT 0,
        bid_1_amount NUMERIC,
        bid_2_amount NUMERIC,
        bid_3_amount NUMERIC,

        data JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration: Add columns if they don't exist (for existing tables)
    const columnsToAdd: string[] = [
      'l1_quote_total_cost_display TEXT',
      'cargo_type JSONB',
      'quantity JSONB',
      'origin_zip_code VARCHAR(20)',
      'destination_zip_code VARCHAR(20)',
      'other_origins JSONB',
      'other_origin_zip_codes JSONB',
      'other_destinations JSONB',
      'other_destination_zip_codes JSONB',
      'bid_open_time TIMESTAMP',
      'min_quote_valid_till TIMESTAMP',
      'bid_close_timestamp TIMESTAMP',
      'enquiry_label VARCHAR(50)',
      'bidding_closed BOOLEAN',
      'bidding_closed_at TIMESTAMP',
      'archived BOOLEAN',
      'bid_opening_in TEXT',
      'show_consignment_details BOOLEAN',
      'auction_type VARCHAR(50)',
      'client_company_name VARCHAR(255)',
      'quotes_sent INTEGER',
      'vendor_rank INTEGER',
      'shipper JSONB',
      'consignee JSONB',
      'is_negotiating BOOLEAN',
      'editing_enabled BOOLEAN',
      'show_cost_of_l1_quote BOOLEAN',
      'current_bid_amount NUMERIC',
      'bid_count INTEGER DEFAULT 0',
      'bid_1_amount NUMERIC',
      'bid_2_amount NUMERIC',
      'bid_3_amount NUMERIC'
    ];

    for (const col of columnsToAdd) {
      const colName = col.split(' ')[0];
      try {
        await client.query('SAVEPOINT add_col');
        await client.query(`ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS ${col}`);
        await client.query('RELEASE SAVEPOINT add_col');
      } catch (e: any) {
        await client.query('ROLLBACK TO SAVEPOINT add_col');
        console.log(`[DB] Column ${colName} might already exist or error adding:`, e.message);
      }
    }

    // Enquiry Extensions History
    await client.query(`
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
    `);

    try {
      await client.query('SAVEPOINT ext_cols');
      await client.query(`ALTER TABLE enquiry_extensions ADD COLUMN IF NOT EXISTS last_bid_amount NUMERIC`);
      await client.query(`ALTER TABLE enquiry_extensions ADD COLUMN IF NOT EXISTS bid_1_amount NUMERIC`);
      await client.query(`ALTER TABLE enquiry_extensions ADD COLUMN IF NOT EXISTS bid_2_amount NUMERIC`);
      await client.query(`ALTER TABLE enquiry_extensions ADD COLUMN IF NOT EXISTS bid_3_amount NUMERIC`);
      await client.query('RELEASE SAVEPOINT ext_cols');
    } catch (e: any) {
      await client.query('ROLLBACK TO SAVEPOINT ext_cols');
      console.log('[DB] Error adding columns to enquiry_extensions:', e.message);
    }

    // Session table for connect-pg-simple
    await client.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      )
      WITH (OIDS=FALSE);
    `);

    // Check if session primary key exists
    try {
      await client.query('SAVEPOINT session_pk');
      await client.query('ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;');
      await client.query('RELEASE SAVEPOINT session_pk');
    } catch (e: any) {
      await client.query('ROLLBACK TO SAVEPOINT session_pk');
      if (e.code !== '42P16' && e.code !== '23505') {
        // console.log('Session PK might already exist:', e.message);
      }
    }

    try {
      await client.query('SAVEPOINT session_idx');
      await client.query('CREATE INDEX "IDX_session_expire" ON "session" ("expire");');
      await client.query('RELEASE SAVEPOINT session_idx');
    } catch (e: any) {
      await client.query('ROLLBACK TO SAVEPOINT session_idx');
      if (e.code !== '42P07') {
        // console.log('Session index might already exist:', e.message);
      }
    }

    // Seed default users if table is empty
    const userCountRes = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCountRes.rows[0].count) === 0) {
      console.log('[DB] Seeding default users...');
      const p1 = await bcrypt.hash('sg@1234', 10);
      const p2 = await bcrypt.hash('admin123', 10);
      await client.query(`
        INSERT INTO users (username, password, name, is_admin) VALUES 
        ('bestroadways', $1, 'Best Roadways', true),
        ('admin', $2, 'Administrator', true)
      `, [p1, p2]);
    }

    // Seed default config if empty
    const configCountRes = await client.query('SELECT COUNT(*) FROM system_config');
    if (parseInt(configCountRes.rows[0].count) === 0) {
      console.log('[DB] Seeding default config...');
      await client.query(`
        INSERT INTO system_config (id, config) VALUES 
        (1, '{}')
      `);
    }

    await client.query('COMMIT');
    console.log('[DB] Database initialization complete.');
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('[DB] Error initializing database:', e);
    throw e;
  } finally {
    client.release();
  }
}

export { pool, initDb };
