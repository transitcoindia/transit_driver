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
// import { initializeSocketServer } from './socket/socketServer';
// Load environment variables
dotenv_1.default.config();
// Initialize Express app
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// Initialize Socket.IO
// initializeSocketServer(httpServer);
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
//app.use(morgan('dev'));
// Routes
app.use('/api/driver', driverRoutes_1.default);
// Health check routes
const healthRoutes_1 = __importDefault(require("./routes/healthRoutes"));
app.use('/', healthRoutes_1.default);
// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});
app.get('/', (req, res) => {
    res.send('Hello World');
});
// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
//# sourceMappingURL=app.js.map