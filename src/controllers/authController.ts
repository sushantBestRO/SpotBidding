import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../config/db';
import { users } from '../models/schema';
import { eq } from 'drizzle-orm';

export const login = async (req: Request, res: Response) => {
    const { username, password } = req.body;

    try {
        const result = await db.select().from(users).where(eq(users.username, username));
        const user = result[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(403).json({ error: 'Account is disabled' });
        }

        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
            return res.status(403).json({ error: 'Account is locked. Try again later.' });
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            // Increment failed attempts
            const attempts = (user.failedLoginAttempts || 0) + 1;
            let lockedUntil = null;

            if (attempts >= 5) {
                lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 mins
            }

            await db.update(users)
                .set({
                    failedLoginAttempts: attempts,
                    lockedUntil: lockedUntil
                })
                .where(eq(users.id, user.id));

            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Reset failed attempts and update last login
        await db.update(users)
            .set({
                failedLoginAttempts: 0,
                lockedUntil: null,
                lastLoginAt: new Date()
            })
            .where(eq(users.id, user.id));

        (req.session as any).user = {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            isAdmin: user.role === 'admin' || user.isAdmin // Backwards compatibility
        };

        res.json({ success: true, user: (req.session as any).user });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
};

export const logout = (req: Request, res: Response) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true });
    });
};

import { systemConfig } from '../models/schema';

export const getCurrentUser = (req: Request, res: Response) => {
    res.json({ user: (req.session as any).user });
};

export const getEmail = async (req: Request, res: Response) => {
    try {
        const configResult = await db.select().from(systemConfig).limit(1);
        const globalEmail = configResult[0]?.globalEmail;
        const sessionEmail = (req.session as any).email;

        res.json({ email: globalEmail || sessionEmail || '' });
    } catch (error) {
        console.error('Error getting email:', error);
        res.status(500).json({ error: 'Failed to get email' });
    }
};

export const setEmail = async (req: Request, res: Response) => {
    const { email } = req.body;

    try {
        // Save to session
        (req.session as any).email = email;

        // Also save to global config for persistence across sessions if needed
        // For now, we'll just update the session as per the immediate requirement, 
        // but let's also update the system config to match the "globalEmail" logic 
        // seen in the original snippet (config.globalEmail).

        // Check if config exists
        const configResult = await db.select().from(systemConfig).limit(1);

        if (configResult.length === 0) {
            await db.insert(systemConfig).values({ globalEmail: email });
        } else {
            await db.update(systemConfig)
                .set({ globalEmail: email })
                .where(eq(systemConfig.id, configResult[0].id));
        }

        res.json({ success: true, email });
    } catch (error) {
        console.error('Error setting email:', error);
        res.status(500).json({ error: 'Failed to set email' });
    }
};
