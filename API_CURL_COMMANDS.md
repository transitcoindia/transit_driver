# API cURL Commands for Transit Driver

## Subscription Activation Endpoint

### Endpoint Details
- **URL**: `/api/driver/subscription/activate`
- **Method**: `POST`
- **Authentication**: Required (Bearer Token)
- **Content-Type**: `application/json`

### Request Body
- `durationMinutes` (optional): Subscription duration in minutes (default: 60)

---

## cURL Commands

### 1. Basic Request (Default 60 minutes)

```bash
curl -X POST http://localhost:3000/api/driver/subscription/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{}'
```

### 2. With Custom Duration (e.g., 120 minutes)

```bash
curl -X POST http://localhost:3000/api/driver/subscription/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "durationMinutes": 120
  }'
```

### 3. One-liner (Default Duration)

```bash
curl -X POST http://localhost:3000/api/driver/subscription/activate -H "Content-Type: application/json" -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" -d '{}'
```

### 4. With Pretty JSON Output

```bash
curl -X POST http://localhost:3000/api/driver/subscription/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{"durationMinutes": 60}' \
  | jq .
```

### 5. Production/Staging URL

Replace `localhost:3000` with your actual server URL:

```bash
# Example for production
curl -X POST https://your-domain.com/api/driver/subscription/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{"durationMinutes": 60}'
```

### 6. With Verbose Output (for debugging)

```bash
curl -v -X POST http://localhost:3000/api/driver/subscription/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{"durationMinutes": 60}'
```

### 7. Save Response to File

```bash
curl -X POST http://localhost:3000/api/driver/subscription/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{"durationMinutes": 60}' \
  -o response.json
```

---

## PowerShell Commands (Windows)

### Basic Request

```powershell
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer YOUR_JWT_TOKEN_HERE"
}
$body = @{
    durationMinutes = 60
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/driver/subscription/activate" -Method Post -Headers $headers -Body $body
```

### With Custom Duration

```powershell
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer YOUR_JWT_TOKEN_HERE"
}
$body = @{
    durationMinutes = 120
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/driver/subscription/activate" -Method Post -Headers $headers -Body $body
```

---

## Expected Response

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "key": "driver:DRIVER_ID:status",
    "payload": {
      "status": "available",
      "updatedAt": "2025-01-15T10:30:00.000Z",
      "subscriptionExpiry": "2025-01-15T11:30:00.000Z"
    }
  }
}
```

### Error Responses

#### 401 Unauthorized (No Token)
```json
{
  "success": false,
  "message": "Authentication required. Please login."
}
```

#### 401 Unauthorized (Invalid Token)
```json
{
  "success": false,
  "message": "Invalid token. Please login again."
}
```

#### 401 Unauthorized (Phone Not Verified)
```json
{
  "message": "Phone number not verified. Please verify your phone number."
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## How to Get JWT Token

### 1. Login via Email

```bash
curl -X POST http://localhost:3000/api/driver/login/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "driver@example.com",
    "password": "your_password"
  }'
```

### 2. Login via Phone

```bash
# Step 1: Request OTP
curl -X POST http://localhost:3000/api/driver/login/phone \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+1234567890"
  }'

# Step 2: Verify OTP
curl -X POST http://localhost:3000/api/driver/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+1234567890",
    "otp": "123456"
  }'
```

The response will contain a `token` field that you can use in the Authorization header.

---

## Testing with Environment Variables

Create a `.env.test` file or export variables:

```bash
# Set variables
export API_URL="http://localhost:3000"
export JWT_TOKEN="your_jwt_token_here"

# Use in curl
curl -X POST $API_URL/api/driver/subscription/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{"durationMinutes": 60}'
```

---

## Notes

1. **Authentication Required**: You must be logged in and have a valid JWT token
2. **Phone Verification**: Your phone number must be verified to use this endpoint
3. **Default Duration**: If `durationMinutes` is not provided, it defaults to 60 minutes
4. **Minimum Duration**: The duration will be at least 1 minute (even if you pass 0 or negative)
5. **Redis Storage**: The subscription status is stored in Redis with the key `driver:{driverId}:status`
6. **Expiration**: The Redis key expires automatically based on the subscription duration

---

## Example Workflow

```bash
# 1. Login and get token
TOKEN=$(curl -s -X POST http://localhost:3000/api/driver/login/email \
  -H "Content-Type: application/json" \
  -d '{"email":"driver@example.com","password":"password"}' \
  | jq -r '.token')

# 2. Activate subscription for 2 hours (120 minutes)
curl -X POST http://localhost:3000/api/driver/subscription/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"durationMinutes": 120}' \
  | jq .
```

---

## Troubleshooting

### Error: "Authentication required"
- Make sure you're including the `Authorization` header
- Check that the token is valid and not expired
- Verify the token format: `Bearer <token>` (with space after Bearer)

### Error: "Phone number not verified"
- You must verify your phone number before using this endpoint
- Use the phone verification endpoint first

### Error: Connection refused
- Make sure the server is running
- Check the port (default is 3000)
- Verify the URL is correct

### Error: Invalid JSON
- Make sure the request body is valid JSON
- Check for trailing commas
- Verify Content-Type header is set to `application/json`

