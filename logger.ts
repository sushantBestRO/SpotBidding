import fs from 'fs';
import path from 'path';

class BidLogger {
    private logsDir: string;
    private bidsDir: string;
    private errorsDir: string;

    constructor() {
        this.logsDir = path.join(__dirname, 'logs');
        this.bidsDir = path.join(this.logsDir, 'bids');
        this.errorsDir = path.join(this.logsDir, 'errors');

        // Create directories if they don't exist
        this.ensureDirectories();
    }

    private ensureDirectories(): void {
        [this.logsDir, this.bidsDir, this.errorsDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    private getTimestamp(): string {
        return new Date().toISOString();
    }

    private getDateString(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    public logBid(enquiryKey: string, bidType: string, bidPrice: number, timeToClosing: number, rank: number, success: boolean, responseTime: number, details: Record<string, any> = {}): any {
        const logEntry = {
            timestamp: this.getTimestamp(),
            enquiryKey,
            bidType,
            bidPrice,
            timeToClosingMs: timeToClosing,
            timeToClosingSec: Math.floor(timeToClosing / 1000),
            currentRank: rank,
            success,
            responseTimeMs: responseTime,
            ...details
        };

        // Log to daily file
        const filename = path.join(this.bidsDir, `bids_${this.getDateString()}.json`);
        this.appendToJsonFile(filename, logEntry);

        // Also log to console with formatted message
        const timeStr = timeToClosing > 0 ? `${(timeToClosing / 1000).toFixed(1)}s before closing` : 'after closing';
        console.log(`[BID LOG] ${enquiryKey}: ${bidType} bid ${success ? 'SUCCESS' : 'FAILED'} at ₹${bidPrice} (${timeStr}, rank ${rank}, ${responseTime}ms)`);

        return logEntry;
    }

    public logError(context: string, error: any, details: Record<string, any> = {}): any {
        const errorEntry = {
            timestamp: this.getTimestamp(),
            context,
            error: {
                message: error.message,
                stack: error.stack,
                code: error.code,
                response: error.response?.data
            },
            ...details
        };

        // Log to daily error file
        const filename = path.join(this.errorsDir, `errors_${this.getDateString()}.json`);
        this.appendToJsonFile(filename, errorEntry);

        // Also log to console
        console.error(`[ERROR] ${context}: ${error.message}`);

        return errorEntry;
    }

    public logBidAttempt(enquiryKey: string, action: string, details: Record<string, any> = {}): any {
        const logEntry = {
            timestamp: this.getTimestamp(),
            enquiryKey,
            action,
            ...details
        };

        // Log to daily file
        const filename = path.join(this.bidsDir, `bid_attempts_${this.getDateString()}.json`);
        this.appendToJsonFile(filename, logEntry);

        return logEntry;
    }

    private appendToJsonFile(filename: string, data: any): void {
        try {
            let entries: any[] = [];

            // Read existing entries if file exists
            if (fs.existsSync(filename)) {
                const content = fs.readFileSync(filename, 'utf8');
                if (content) {
                    try {
                        entries = JSON.parse(content);
                    } catch (e) {
                        // If JSON is corrupted, start fresh
                        entries = [];
                    }
                }
            }

            // Add new entry
            entries.push(data);

            // Write back to file
            fs.writeFileSync(filename, JSON.stringify(entries, null, 2), 'utf8');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    // Get today's bid logs
    public getTodaysBids(): any[] {
        const filename = path.join(this.bidsDir, `bids_${this.getDateString()}.json`);
        return this.readJsonFile(filename);
    }

    // Get today's errors
    public getTodaysErrors(): any[] {
        const filename = path.join(this.errorsDir, `errors_${this.getDateString()}.json`);
        return this.readJsonFile(filename);
    }

    private readJsonFile(filename: string): any[] {
        try {
            if (fs.existsSync(filename)) {
                const content = fs.readFileSync(filename, 'utf8');
                return JSON.parse(content);
            }
        } catch (error) {
            console.error('Failed to read log file:', error);
        }
        return [];
    }
}

export default new BidLogger();
