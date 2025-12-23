"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.limiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
exports.limiter = (0, express_rate_limit_1.default)({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 20, // Limit each IP to 20 requests per windowMs
    message: { message: "Too many requests from this IP, please try again later." },
    headers: true, // Send RateLimit headers
});
//# sourceMappingURL=rateLimiter.js.map