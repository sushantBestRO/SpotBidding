import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    sessionSecret: process.env.SESSION_SECRET || 'secret',
    databaseUrl: process.env.DATABASE_URL,
    apiBaseUrl: 'https://enquiry.gocomet.com',
    clientUrl: [
        'http://localhost:5173',
        'https://app.gocomet.com',
        'https://bidsspots.auto-pilot.best'  // Dev server
    ]
};
