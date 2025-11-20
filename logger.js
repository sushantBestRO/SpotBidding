const fs = require('fs');
const path = require('path');

class BidLogger {
  constructor() {
    this.logsDir = path.join(__dirname, 'logs');
    this.bidsDir = path.join(this.logsDir, 'bids');
    this.errorsDir = path.join(this.logsDir, 'errors');
    
    // Create directories if they don't exist
    this.ensureDirectories();
  }
  
  ensureDirectories() {
    [this.logsDir, this.bidsDir, this.errorsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  getTimestamp() {
    return new Date().toISOString();
  }
  
  getDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  
  logBid(enquiryKey, bidType, bidPrice, timeToClosing, rank, success, responseTime, details = {}) {
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
  
  logError(context, error, details = {}) {
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
  
  logBidAttempt(enquiryKey, action, details = {}) {
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
  
  appendToJsonFile(filename, data) {
    try {
      let entries = [];
      
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
  getTodaysBids() {
    const filename = path.join(this.bidsDir, `bids_${this.getDateString()}.json`);
    return this.readJsonFile(filename);
  }
  
  // Get today's errors
  getTodaysErrors() {
    const filename = path.join(this.errorsDir, `errors_${this.getDateString()}.json`);
    return this.readJsonFile(filename);
  }
  
  readJsonFile(filename) {
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

module.exports = new BidLogger();