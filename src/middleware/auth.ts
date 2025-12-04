import { Request, Response, NextFunction } from 'express';

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if ((req.session as any).user) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const user = (req.session as any).user;
    if (user && (user.role === 'admin' || user.isAdmin)) {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
};

export const requireManager = (req: Request, res: Response, next: NextFunction) => {
    const user = (req.session as any).user;
    if (user && (user.role === 'manager' || user.role === 'admin' || user.isAdmin)) {
        next();
    } else {
        res.status(403).json({ error: 'Manager access required' });
    }
};
