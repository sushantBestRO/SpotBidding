import express from 'express';
import { config } from './config';
import cors from 'cors';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { pool } from '../db'; // We'll move db.ts later, for now import from root
import path from 'path';

const app = express();

// Disable ETags to prevent 304 responses
app.set('etag', false);

// Middleware
app.use(cors({
    origin: config.clientUrl,
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); // Adjust path as needed

// Session
const PgSessionStore = pgSession(session);
app.use(session({
    store: new PgSessionStore({
        pool: pool,
        tableName: 'session'
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: config.nodeEnv === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
}));

import authRoutes from './routes/authRoutes';
import quoteRoutes from './routes/quoteRoutes';
import bidRoutes from './routes/bidRoutes';
import configRoutes from './routes/configRoutes';
import swaggerUi from 'swagger-ui-express';
import { specs } from './config/swagger';
import viewRoutes from './routes/viewRoutes';

// Swagger
if (config.nodeEnv !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
}

// API Routes
app.use('/api', authRoutes);
app.use('/api', quoteRoutes);
app.use('/api', bidRoutes);
app.use('/api', configRoutes);

// View Routes
app.use('/', viewRoutes);

export default app;
