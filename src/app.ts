import express from 'express';
import { config } from './config';
import cors from 'cors';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { pool } from '../db'; // We'll move db.ts later, for now import from root
import path from 'path';
import authRoutes from './routes/authRoutes';
import quoteRoutes from './routes/quoteRoutes';
import bidRoutes from './routes/bidRoutes';
import configRoutes from './routes/configRoutes';
import bidLogsRoutes from './routes/bidLogsRoutes';
import swaggerUi from 'swagger-ui-express';
import { specs } from './config/swagger';
import viewRoutes from './routes/viewRoutes';

const app = express();

// Disable ETags to prevent 304 responses
app.set('etag', false);

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, postman)
        if (!origin) return callback(null, true);

        // Allow configured origins
        const allowedOrigins = Array.isArray(config.clientUrl) ? config.clientUrl : [config.clientUrl];

        // Also allow localhost with any port for development
        if (config.nodeEnv !== 'production') {
            const localhostRegex = /^https?:\/\/localhost(:\d+)?$/;
            if (localhostRegex.test(origin)) {
                return callback(null, true);
            }
        }

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`CORS: Blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    exposedHeaders: ['Set-Cookie']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); // Adjust path as needed

// Session
const PgSessionStore = pgSession(session);

// Determine if we're using HTTPS
const isHttps = config.nodeEnv === 'production' || process.env.USE_HTTPS === 'true';

app.use(session({
    store: new PgSessionStore({
        pool: pool,
        tableName: 'session'
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isHttps, // true for HTTPS, false for HTTP
        httpOnly: true, // Prevent client-side JS from accessing the cookie
        sameSite: isHttps ? 'none' : 'lax', // 'none' for HTTPS cross-origin, 'lax' for HTTP
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        domain: config.nodeEnv === 'production' ? undefined : undefined // Let browser handle domain
    },
    proxy: isHttps // Trust proxy if using HTTPS
}));

// Swagger
if (config.nodeEnv !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
}

// API Routes
app.use('/api', authRoutes);
app.use('/api', quoteRoutes);
app.use('/api', bidRoutes);
app.use('/api', configRoutes);
app.use('/api', bidLogsRoutes);


// View Routes
app.use('/', viewRoutes);

export default app;
