import { Router, Request, Response } from 'express';
import path from 'path';

const router = Router();

// Helper to send file
const sendHtml = (res: Response, filename: string) => {
    res.sendFile(path.join(__dirname, '../../public', filename));
};

router.get('/login', (req: Request, res: Response) => {
    if ((req.session as any).user) {
        return res.redirect('/dashboard');
    }
    sendHtml(res, 'login.html');
});

router.get('/dashboard', (req: Request, res: Response) => {
    if (!(req.session as any).user) {
        return res.redirect('/login');
    }
    sendHtml(res, 'dashboard.html');
});

router.get('/enquiry/:id', (req: Request, res: Response) => {
    // Enquiry page is public, no auth check needed as per request
    sendHtml(res, 'enquiry.html');
});

router.get('/settings', (req: Request, res: Response) => {
    const user = (req.session as any).user;
    if (!user) {
        return res.redirect('/login');
    }
    // Allow all authenticated users to view settings page
    // Backend API routes are protected for modifications
    sendHtml(res, 'settings.html');
});

// Root redirects to dashboard or login
router.get('/', (req: Request, res: Response) => {
    if ((req.session as any).user) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/login');
    }
});

export default router;
