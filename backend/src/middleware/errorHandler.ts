import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  // Log error
  logger.error({
    error: message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId: (req.user as any)?.id
  }, 'Request error');

  // Don't leak error details in production
  const isProd = process.env.NODE_ENV === 'production';
  
  res.status(statusCode).json({
    error: message,
    ...(isProd ? {} : { stack: err.stack })
  });
}

