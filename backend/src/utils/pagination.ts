import { Request } from 'express';

export function getPagination(req: Request, defaultLimit: number = 50, maxLimit: number = 100) {
  const page  = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(maxLimit, parseInt(req.query.limit as string) || defaultLimit);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
