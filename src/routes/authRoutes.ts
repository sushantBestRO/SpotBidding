import { Router } from 'express';
import { login, logout, getCurrentUser, getEmail, setEmail } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication API
 */

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', login);

/**
 * @swagger
 * /api/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', logout);

/**
 * @swagger
 * /api/user:
 *   get:
 *     summary: Get current user
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Current user details
 *       401:
 *         description: Unauthorized
 */
router.get('/user', requireAuth, getCurrentUser);

/**
 * @swagger
 * /api/get-email:
 *   get:
 *     summary: Get saved email
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Saved email
 */
router.get('/get-email', requireAuth, getEmail);

/**
 * @swagger
 * /api/set-email:
 *   post:
 *     summary: Set email
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email saved
 */
router.post('/set-email', requireAuth, setEmail);

import * as userController from '../controllers/userController';
import { requireAdmin } from '../middleware/auth';

// ... existing imports ...

// User Management Routes
router.get('/users', requireAdmin, userController.getUsers);
router.post('/users', requireAdmin, userController.addUser);
router.delete('/users/:username', requireAdmin, userController.deleteUser);
router.put('/users/:username/password', requireAdmin, userController.updateUserPassword);
router.post('/change-password', requireAuth, userController.changeOwnPassword);

export default router;
