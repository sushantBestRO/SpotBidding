# Statement of Work: Database Integration, Authentication & Persistence

## 1. Project Overview
This document outlines the scope of work for upgrading the Spot Bidding Application. The primary objectives are to transition from file-based storage to a robust PostgreSQL database, implement a secure authentication module, and ensure the persistence of critical bidding data and monitor states.

## 2. Scope of Work

### Phase 1: Database Architecture & Integration
**Objective:** Replace the existing ephemeral/file-based storage (JSON files) with a relational database system to ensure data integrity and concurrency.

*   **Database Selection:** PostgreSQL.
*   **Schema Design:**
    *   **`users`**: Store user credentials and roles (replacing `users.json`).
    *   **`system_config`**: Store global application settings, including GoComet auth tokens and email configurations (replacing `web_config.json`).
    *   **`session`**: Store user session data (replacing in-memory `MemoryStore`).
    *   **`bid_monitors`**: Store the state of active bidding monitors to allow recovery after server restarts.
*   **Implementation:**
    *   Setup connection pooling using `pg` library.
    *   Create initialization scripts (`db.js`) to automatically generate tables and seed default data.

### Phase 2: Authentication Module
**Objective:** Secure the application and automate the external authentication process with GoComet.

*   **Session Management:**
    *   Implement `express-session` backed by `connect-pg-simple` to store sessions in the PostgreSQL database.
    *   Configure secure cookie settings (`httpOnly`, `secure` in production).
*   **GoComet Integration:**
    *   Develop a Chrome automation module using `Puppeteer` to handle the OTP-based login flow for GoComet.
    *   **Endpoints:**
        *   `/api/authenticate-chrome`: Triggers the headless browser login and OTP generation.
        *   `/api/submit-otp`: Accepts the user-provided OTP to complete the automation and capture the auth token.
    *   **Token Persistence:** Automatically save the captured `globalAuthToken` to the `system_config` table.

### Phase 3: Bidding Persistence & Logic Refactoring
**Objective:** Ensure that bidding monitors continue to run or can be resumed after system interruptions, and refactor the codebase to support asynchronous database operations.

*   **State Persistence:**
    *   Modify `startSmartBiddingMonitor` to persist monitor status (`active`, `stopped`) and metadata to the `bid_monitors` table.
    *   Update stop/start logic to reflect changes in the database immediately.
*   **Code Refactoring:**
    *   Rewrite `server.js` to replace synchronous file I/O with asynchronous database queries (`pool.query`).
    *   Consolidate route logic to ensure proper error handling and database connection management.
    *   Remove legacy code related to `fs` (file system) storage.

## 3. Technical Implementation Details

### Files & Components
*   **`server.js`**: Main application entry point. Refactored to include:
    *   Database connection pool setup.
    *   Session middleware configuration.
    *   API routes for Auth, Bidding, and Configuration.
    *   Background monitor logic with DB persistence.
*   **`db.js`**: Database module containing:
    *   `initDb()` function for schema creation and seeding.
    *   Table definitions for `users`, `system_config`, `bid_monitors`, and `session`.

### Key Dependencies
*   **`pg`**: PostgreSQL client for Node.js.
*   **`connect-pg-simple`**: PostgreSQL session store for Express.
*   **`express-session`**: Session middleware.
*   **`puppeteer`**: Headless Chrome for automation.
*   **`dotenv`**: Environment variable management.

### Environment Variables
The following environment variables are required in `.env`:
*   `DATABASE_URL`: Connection string for PostgreSQL (e.g., `postgresql://user:password@localhost:5432/dbname`).
*   `SESSION_SECRET`: Secret key for signing session cookies.
*   `PORT`: Application port (default: 3000).

## 4. Deliverables
1.  **Refactored Codebase**: Updated `server.js` and `db.js` with full database integration.
2.  **Database Schema**: SQL definitions for all required tables (embedded in `db.js`).
3.  **Authentication System**: Working OTP login flow and session management.
4.  **Documentation**: This Statement of Work outlining the changes and architecture.

## 5. Assumptions
*   A PostgreSQL database instance is available and accessible via `DATABASE_URL`.
*   The Node.js runtime environment is version 14 or higher.
*   Network access to `app.gocomet.com` is available for the Puppeteer automation.
