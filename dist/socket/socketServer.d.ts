import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
export declare const initializeSocketServer: (httpServer: HttpServer) => Server<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
