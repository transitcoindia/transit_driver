"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errorHandler = (err, req, res, next) => {
    // Set default values for the error
    err.statusCode = err.statusCode || 500;
    err.message = err.message || 'Internal Server Error';
    // Log the error (you can use a logging library here)
    console.error(err);
    // Send the error response
    res.status(err.statusCode).json({
        status: 'error',
        statusCode: err.statusCode,
        message: err.message,
    });
};
exports.default = errorHandler;
//# sourceMappingURL=errorHandler.js.map