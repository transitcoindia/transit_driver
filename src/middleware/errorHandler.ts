import { Request, Response, NextFunction } from 'express';
import AppError from '../utils/AppError';

const errorHandler = (err: Error | AppError, req: Request, res: Response, next: NextFunction) => {
  // Check if it's an AppError instance
  if (err instanceof AppError) {
    // Log the error
    console.error('AppError:', {
      message: err.message,
      statusCode: err.statusCode,
      stack: err.stack,
    });
    console.error('Request path:', req.path);
    console.error('Request method:', req.method);

    // Send the error response with the status code from AppError
    return res.status(err.statusCode).json({
      status: 'error',
      statusCode: err.statusCode,
      message: err.message,
    });
  }

  // Handle regular Error instances (default to 500)
  console.error('Error stack:', err.stack);
  console.error('Error message:', err.message);
  console.error('Request path:', req.path);
  console.error('Request method:', req.method);

  res.status(500).json({
    status: 'error',
    statusCode: 500,
    message: err.message || 'Internal Server Error',
  });
};

export default errorHandler;