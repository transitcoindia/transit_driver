# Port Configuration for Transit Services

## Port Assignment

| Service | Port | Configuration File |
|---------|------|-------------------|
| **Backend Service** (`transit_backend`) | **8000** | `transit_backend/.env` |
| **Driver Service** (`transit_driver`) | **3000** | `transit_driver/.env` |

## Why Different Ports?

Both services need to run simultaneously for testing:
- Backend service handles rider/customer APIs
- Driver service handles driver APIs

## Configuration

The driver service's `.env` file has been updated to use port **3000** (the default).

If you need to change it:
```bash
# In transit_driver/.env
PORT=3000
```

The code defaults to port 3000 if `PORT` is not set in the environment.


