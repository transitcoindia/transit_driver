"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
// import morgan from 'morgan';
const http_1 = require("http");
const dotenv_1 = __importDefault(require("dotenv"));
const driverRoutes_1 = __importDefault(require("./routes/driverRoutes"));
const socketServer_1 = require("./socket/socketServer");
// Load environment variables
dotenv_1.default.config();
// Initialize Express app
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// Initialize Socket.IO (drivers connect when online to receive ride requests)
(0, socketServer_1.initializeSocketServer)(httpServer);
// CORS Configuration
// Allow all origins for now - can be restricted in production via CORS_ORIGIN env var
const corsOptions = {
    origin: process.env.CORS_ORIGIN || true, // Allow all origins if not specified
    credentials: false, // Set to false when using Bearer tokens (not cookies)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400, // 24 hours
};
// Middleware - Apply CORS before other middleware
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
//app.use(morgan('dev'));
// Routes
app.use('/api/driver', driverRoutes_1.default);
// Health check routes
const healthRoutes_1 = __importDefault(require("./routes/healthRoutes"));
app.use('/', healthRoutes_1.default);
app.get('/', (req, res) => {
    res.send('Hello World');
});
// Error handling middleware (must be last)
const errorHandler_1 = __importDefault(require("./middleware/errorHandler"));
app.use(errorHandler_1.default);
// Start server
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
//# sourceMappingURL=app.js.map