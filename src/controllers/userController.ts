import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../config/db';
import { users } from '../models/schema';
import { eq } from 'drizzle-orm';

export const getUsers = async (req: Request, res: Response) => {
    try {
        const allUsers = await db.select().from(users);
        const userList = allUsers.map(u => ({
            username: u.username,
            name: u.name,
            isAdmin: u.role === 'admin' || u.isAdmin,
            role: u.role,
            isActive: u.isActive
        }));
        res.json({ users: userList });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

export const addUser = async (req: Request, res: Response) => {
    const { username, name, password, isAdmin } = req.body;

    if (!username || !name || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const existingUser = await db.select().from(users).where(eq(users.username, username));
        if (existingUser.length > 0) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.insert(users).values({
            username,
            password: hashedPassword,
            name,
            role: isAdmin ? 'admin' : 'analyst',
            isAdmin: !!isAdmin,
            isActive: true
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ error: 'Failed to add user' });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    const { username } = req.params;

    try {
        const userToDelete = await db.select().from(users).where(eq(users.username, username));

        if (userToDelete.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (userToDelete[0].role === 'admin' || userToDelete[0].isAdmin) {
            // Prevent deleting the last admin or specific protected admins if needed
            // For now, just a basic check
            if (username === 'admin' || username === 'bestroadways') {
                return res.status(403).json({ error: 'Cannot remove system admin users' });
            }
        }

        await db.delete(users).where(eq(users.username, username));
        res.json({ success: true });

    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to remove user' });
    }
};

export const updateUserPassword = async (req: Request, res: Response) => {
    const { username } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
        return res.status(400).json({ error: 'New password is required' });
    }

    try {
        const userToUpdate = await db.select().from(users).where(eq(users.username, username));
        if (userToUpdate.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.update(users)
            .set({ password: hashedPassword })
            .where(eq(users.username, username));

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ error: 'Failed to update password' });
    }
};

export const changeOwnPassword = async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const username = (req.session as any).user.username;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Both passwords are required' });
    }

    try {
        const result = await db.select().from(users).where(eq(users.username, username));
        const user = result[0];

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.update(users)
            .set({ password: hashedPassword })
            .where(eq(users.username, username));

        res.json({ success: true });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ error: 'Failed to update password' });
    }
};
