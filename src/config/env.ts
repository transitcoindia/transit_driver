import dotenv from 'dotenv';
dotenv.config();

const val = (keys: string[], fallback?: string): string | undefined => {
  for (const k of keys) {
    const v = (process.env as any)[k];
    if (v && typeof v === 'string' && v.trim().length > 0) return v;
  }
  return fallback;
};

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = Number(process.env.PORT || 3000);

export const API_GATEWAY_URL = val([
  'API_GATEWAY_WS_URL',
  'API_GATEWAY_URL'
], 'http://localhost:3005')!;

export const API_GATEWAY_PUBLIC_ORIGIN = val(['API_GATEWAY_PUBLIC_ORIGIN']);
export const SOCKET_IO_PATH = '/socket.io/';

export function getAllowedOrigins(): string[] {
  const defaults = [
    API_GATEWAY_URL,
    process.env.RIDER_BACKEND_URL || 'http://localhost:8000',
    process.env.FRONTEND_APP_URL || 'http://localhost:3000',
    'https://www.shankhtech.com',
    'https://pramaan.ondc.org'
  ];
  const extraCsv = process.env.CORS_ALLOWED_ORIGINS || '';
  const extras = extraCsv.split(',').map(s => s.trim()).filter(Boolean);
  return Array.from(new Set([...defaults, ...extras]));
}

// Redis TTLs (seconds)
export const DRIVER_LOCATION_TTL_SECONDS = Number(process.env.DRIVER_LOCATION_TTL_SECONDS || 300);
export const RIDE_LAST_LOCATION_TTL_SECONDS = Number(process.env.RIDE_LAST_LOCATION_TTL_SECONDS || 7200);

// Redis channels
export const CHANNELS = {
  DRIVER_LOCATION_UPDATES: 'driver_location_updates',
  RIDE_STATUS_UPDATES: 'ride_status_updates'
} as const;


