import app from './src/app';
import { config } from './src/config';
import { pool } from './src/config/db';

import { startEnquiryCron } from './src/cron/enquiryCron';

// Start Server
const server = app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
    console.log(`Swagger docs available at http://localhost:${config.port}/api-docs`);

    // Start Cron Jobs
    startEnquiryCron();
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        pool.end();
    });
});
