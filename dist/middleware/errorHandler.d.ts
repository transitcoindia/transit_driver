import { Request, Response, NextFunction } from 'express';
import AppError from '../utils/AppError';
declare const errorHandler: (err: Error | AppError, req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export default errorHandler;
