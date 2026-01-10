# Admin APIs Documentation

Complete documentation for all admin driver management APIs in the Transit Driver Service.

**Base URL:** `https://api.transitco.in` or `http://localhost:3000` (for local development)

**Service:** Transit Driver Service (`transit_driver`)

---

## Table of Contents

1. [Authentication](#authentication)
2. [List All Drivers](#1-list-all-drivers)
3. [Approve Driver](#2-approve-driver)
4. [Reject Driver](#3-reject-driver)
5. [Suspend Driver](#4-suspend-driver)
6. [Update Driver Approval Status](#5-update-driver-approval-status-generic-endpoint)
7. [Error Responses](#error-responses)
8. [Driver Approval Status Values](#driver-approval-status-values)

---

## Authentication

All admin endpoints require authentication with an admin JWT token.

**Header Required:**
```
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

**Note:** Admin users must have `isAdmin: true` in their user record.

---

## 1. List All Drivers

Get a paginated list of all drivers with optional filtering by approval status.

### Endpoint
```
GET /api/driver/admin/list
```

### Authentication
- ✅ Required: Admin token
- 🔒 Method: Bearer Token

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | `1` | Page number for pagination |
| `limit` | number | No | `50` | Number of drivers per page (max 100) |
| `approvalStatus` | string | No | - | Filter by status: `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED` |

### Request Example

#### cURL
```bash
# Get all drivers (first page, default limit)
curl -X GET "https://api.transitco.in/api/driver/admin/list" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"

# Get pending drivers only (page 1)
curl -X GET "https://api.transitco.in/api/driver/admin/list?approvalStatus=PENDING&page=1&limit=25" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"

# Get suspended drivers (page 2, 20 per page)
curl -X GET "https://api.transitco.in/api/driver/admin/list?approvalStatus=SUSPENDED&page=2&limit=20" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

#### JavaScript (Fetch)
```javascript
const response = await fetch('https://api.transitco.in/api/driver/admin/list?page=1&limit=50&approvalStatus=PENDING', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "drivers": [
      {
        "id": "clx1234567890abcdef",
        "name": "John Doe",
        "email": "john.doe@example.com",
        "phoneNumber": "+919876543210",
        "emailVerified": true,
        "phoneNumberVerified": true,
        "isVerified": true,
        "approvalStatus": "APPROVED",
        "accountActive": true,
        "rejectionReason": null,
        "suspensionReason": null,
        "averageRating": 4.8,
        "totalRatings": 45,
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-20T14:22:00.000Z",
        "documents": [
          {
            "id": "doc123",
            "documentType": "DRIVING_LICENSE",
            "isVerified": true,
            "expiryDate": "2026-12-31T00:00:00.000Z"
          },
          {
            "id": "doc124",
            "documentType": "VEHICLE_REGISTRATION",
            "isVerified": true,
            "expiryDate": null
          }
        ],
        "vehicle": {
          "id": "veh123",
          "licensePlate": "MH01AB1234",
          "vehicleType": "SEDAN"
        },
        "user": {
          "id": "user123",
          "email": "john.doe@example.com",
          "name": "John Doe",
          "phoneNumber": "+919876543210"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalCount": 247,
      "limit": 50
    }
  }
}
```

### Error Responses

- **401 Unauthorized**: Missing or invalid token
- **403 Forbidden**: User is not an admin
- **500 Internal Server Error**: Server error

---

## 2. Approve Driver

Approve a driver's application and activate their account. This will:
- Set `approvalStatus` to `APPROVED`
- Set `isVerified` to `true`
- Set `accountActive` to `true`
- Clear any rejection reason
- Send approval email to driver with onboarding token

### Endpoints

**Option 1: Direct API Call (Requires Admin Auth)**
```
PUT /api/driver/admin/approve/:driverId
```

**Option 2: Email Token-Based (No Auth Required - Token is Secure)**
```
GET /api/driver/admin/approve?token=APPROVE_TOKEN
```

### Authentication

**Option 1:** ✅ Required: Admin token  
**Option 2:** ❌ Not required (token provides security)

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `driverId` | string | Yes | Unique driver ID (CUID) |

### Query Parameters (Option 2 Only)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | JWT token from approval email link |

### Request Example

#### cURL - Direct API Call
```bash
curl -X PUT "https://api.transitco.in/api/driver/admin/approve/clx1234567890abcdef" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

#### cURL - Email Token-Based
```bash
curl -X GET "https://api.transitco.in/api/driver/admin/approve?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

#### JavaScript (Fetch)
```javascript
// Direct API call
const response = await fetch('https://api.transitco.in/api/driver/admin/approve/clx1234567890abcdef', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

### Success Response (200 OK)

**Direct API Call Response:**
```json
{
  "success": true,
  "message": "Driver approved successfully",
  "data": {
    "driver": {
      "id": "clx1234567890abcdef",
      "name": "John Doe",
      "isVerified": true,
      "approvalStatus": "APPROVED"
    }
  }
}
```

**Email Token-Based Response:**
- Returns HTTP 302 Redirect to: `${FRONTEND_APP_URL}/admin/driver-approved?name=John%20Doe`
- Or JSON response if redirect is not possible

### Email Notification

When a driver is approved, they receive an email with:
- Approval confirmation
- Onboarding token for driver app login
- Welcome message and next steps

### Error Responses

- **400 Bad Request**: Invalid driver ID or token
- **401 Unauthorized**: Missing or invalid admin token (for direct API)
- **403 Forbidden**: User is not an admin (for direct API)
- **404 Not Found**: Driver not found
- **500 Internal Server Error**: Server error

---

## 3. Reject Driver

Reject a driver's application. This will:
- Set `approvalStatus` to `REJECTED`
- Set `isVerified` to `false`
- Set `accountActive` to `false`
- Store rejection reason
- Send rejection email to driver with reason

### Endpoints

**Option 1: Direct API Call (Requires Admin Auth)**
```
PUT /api/driver/admin/reject/:driverId
POST /api/driver/admin/reject/:driverId
```

**Option 2: Email Token-Based (No Auth Required)**
```
GET /api/driver/admin/reject?token=REJECT_TOKEN
POST /api/driver/admin/reject
```

### Authentication

**Option 1:** ✅ Required: Admin token  
**Option 2:** ❌ Not required (token provides security)

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `driverId` | string | Yes (Option 1) | Unique driver ID (CUID) |

### Query Parameters (Option 2 Only)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | JWT token from rejection email link |

### Request Body

```json
{
  "reason": "Incomplete document submission",
  "rejectionReason": "Documents are not clear or missing required information"
}
```

**Note:** Either `reason` or `rejectionReason` can be used (both are accepted).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | Yes | Reason for rejection |
| `rejectionReason` | string | Yes* | Alternative field name for rejection reason |

*At least one of `reason` or `rejectionReason` must be provided.

### Request Example

#### cURL - Direct API Call
```bash
curl -X PUT "https://api.transitco.in/api/driver/admin/reject/clx1234567890abcdef" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Incomplete document submission. Please ensure all documents are clear and valid."
  }'
```

#### cURL - Email Token-Based (GET - redirects to form)
```bash
curl -X GET "https://api.transitco.in/api/driver/admin/reject?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

#### cURL - Email Token-Based (POST with reason)
```bash
curl -X POST "https://api.transitco.in/api/driver/admin/reject" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "reason": "Documents do not meet our verification standards"
  }'
```

#### JavaScript (Fetch)
```javascript
// Direct API call
const response = await fetch('https://api.transitco.in/api/driver/admin/reject/clx1234567890abcdef', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    reason: 'Incomplete document submission. Please resubmit with clear, valid documents.'
  })
});

const data = await response.json();
```

### Success Response (200 OK)

**Direct API Call Response:**
```json
{
  "success": true,
  "message": "Driver rejected successfully",
  "data": {
    "driver": {
      "id": "clx1234567890abcdef",
      "name": "John Doe",
      "rejectionReason": "Incomplete document submission. Please ensure all documents are clear and valid.",
      "approvalStatus": "REJECTED"
    }
  }
}
```

**Email Token-Based Response:**
- If no reason provided (GET): Returns HTTP 302 Redirect to: `${FRONTEND_APP_URL}/admin/driver-reject-form?token=...`
- If reason provided: Returns HTTP 302 Redirect to: `${FRONTEND_APP_URL}/admin/driver-rejected?name=John%20Doe`
- Or JSON response if redirect is not possible

### Email Notification

When a driver is rejected, they receive an email with:
- Rejection notification
- The rejection reason
- Information about reapplying in the future
- Support contact information

### Error Responses

- **400 Bad Request**: Missing rejection reason or invalid driver ID/token
- **401 Unauthorized**: Missing or invalid admin token (for direct API)
- **403 Forbidden**: User is not an admin (for direct API)
- **404 Not Found**: Driver not found
- **500 Internal Server Error**: Server error

---

## 4. Suspend Driver

Suspend an active driver's account. This will:
- Set `approvalStatus` to `SUSPENDED`
- Set `accountActive` to `false`
- Store suspension reason
- Send suspension email to driver with reason
- Driver cannot accept new rides during suspension

### Endpoints

**Option 1: Direct API Call (Requires Admin Auth)**
```
PUT /api/driver/admin/suspend/:driverId
```

**Option 2: Email Token-Based (Optional)**
```
GET /api/driver/admin/suspend?token=SUSPEND_TOKEN
POST /api/driver/admin/suspend
```

### Authentication

**Option 1:** ✅ Required: Admin token  
**Option 2:** ❌ Not required (token provides security)

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `driverId` | string | Yes (Option 1) | Unique driver ID (CUID) |

### Query Parameters (Option 2 Only)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | JWT token from suspension email link |

### Request Body

```json
{
  "reason": "Violation of terms and conditions",
  "suspensionReason": "Multiple complaints from riders about driver behavior"
}
```

**Note:** Either `reason` or `suspensionReason` can be used (both are accepted).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | Yes | Reason for suspension |
| `suspensionReason` | string | Yes* | Alternative field name for suspension reason |

*At least one of `reason` or `suspensionReason` must be provided.

### Request Example

#### cURL - Direct API Call
```bash
curl -X PUT "https://api.transitco.in/api/driver/admin/suspend/clx1234567890abcdef" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Multiple complaints from riders about unprofessional behavior"
  }'
```

#### cURL - Email Token-Based (GET - redirects to form)
```bash
curl -X GET "https://api.transitco.in/api/driver/admin/suspend?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

#### cURL - Email Token-Based (POST with reason)
```bash
curl -X POST "https://api.transitco.in/api/driver/admin/suspend" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "reason": "Account under review due to suspicious activity"
  }'
```

#### JavaScript (Fetch)
```javascript
// Direct API call
const response = await fetch('https://api.transitco.in/api/driver/admin/suspend/clx1234567890abcdef', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    reason: 'Multiple complaints from riders about driver behavior. Account suspended pending investigation.'
  })
});

const data = await response.json();
```

### Success Response (200 OK)

**Direct API Call Response:**
```json
{
  "success": true,
  "message": "Driver suspended successfully",
  "data": {
    "driver": {
      "id": "clx1234567890abcdef",
      "name": "John Doe",
      "suspensionReason": "Multiple complaints from riders about unprofessional behavior",
      "approvalStatus": "SUSPENDED",
      "accountActive": false
    }
  }
}
```

**Email Token-Based Response:**
- If no reason provided (GET): Returns HTTP 302 Redirect to: `${FRONTEND_APP_URL}/admin/driver-suspend-form?token=...`
- If reason provided: Returns HTTP 302 Redirect to: `${FRONTEND_APP_URL}/admin/driver-suspended?name=John%20Doe`
- Or JSON response if redirect is not possible

### Email Notification

When a driver is suspended, they receive an email with:
- Suspension notice
- The suspension reason
- Information about account restrictions
- Contact information for support/appeals

### Error Responses

- **400 Bad Request**: Missing suspension reason or invalid driver ID/token
- **401 Unauthorized**: Missing or invalid admin token (for direct API)
- **403 Forbidden**: User is not an admin (for direct API)
- **404 Not Found**: Driver not found
- **500 Internal Server Error**: Server error

---

## 5. Update Driver Approval Status (Generic Endpoint)

A generic endpoint to update driver approval status with support for all statuses (PENDING, APPROVED, REJECTED, SUSPENDED). This is a flexible endpoint that handles all status changes in one place.

### Endpoint
```
PATCH /api/driver/admin/:driverId/approval
```

### Authentication
- ✅ Required: Admin token
- 🔒 Method: Bearer Token

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `driverId` | string | Yes | Unique driver ID (CUID) |

### Request Body

```json
{
  "approvalStatus": "SUSPENDED",
  "rejectionReason": "Optional: reason for rejection (if status is REJECTED)",
  "suspensionReason": "Optional: reason for suspension (if status is SUSPENDED)"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `approvalStatus` | string | Yes | One of: `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED` |
| `rejectionReason` | string | No | Required if `approvalStatus` is `REJECTED` |
| `suspensionReason` | string | No | Required if `approvalStatus` is `SUSPENDED` |

### Status-Specific Behavior

#### When `approvalStatus = "APPROVED"`
- Sets `isVerified = true`
- Sets `accountActive = true`
- Clears `rejectionReason` (sets to `null`)
- Sends approval email with onboarding token

#### When `approvalStatus = "REJECTED"`
- Sets `isVerified = false`
- Sets `accountActive = false`
- Stores `rejectionReason` (if provided)
- Sends rejection email with reason

#### When `approvalStatus = "SUSPENDED"`
- Sets `accountActive = false`
- Stores `suspensionReason` (if provided)
- Sends suspension email with reason

#### When `approvalStatus = "PENDING"`
- No additional actions, just updates status

### Request Example

#### cURL - Approve Driver
```bash
curl -X PATCH "https://api.transitco.in/api/driver/admin/clx1234567890abcdef/approval" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalStatus": "APPROVED"
  }'
```

#### cURL - Reject Driver
```bash
curl -X PATCH "https://api.transitco.in/api/driver/admin/clx1234567890abcdef/approval" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalStatus": "REJECTED",
    "rejectionReason": "Documents are not clear. Please resubmit with valid, high-quality images."
  }'
```

#### cURL - Suspend Driver
```bash
curl -X PATCH "https://api.transitco.in/api/driver/admin/clx1234567890abcdef/approval" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalStatus": "SUSPENDED",
    "suspensionReason": "Multiple complaints from riders. Account suspended pending investigation."
  }'
```

#### cURL - Set to Pending
```bash
curl -X PATCH "https://api.transitco.in/api/driver/admin/clx1234567890abcdef/approval" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalStatus": "PENDING"
  }'
```

#### JavaScript (Fetch)
```javascript
// Suspend a driver
const response = await fetch('https://api.transitco.in/api/driver/admin/clx1234567890abcdef/approval', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    approvalStatus: 'SUSPENDED',
    suspensionReason: 'Account under review due to multiple complaints'
  })
});

const data = await response.json();
```

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Driver suspended successfully",
  "data": {
    "driver": {
      "id": "clx1234567890abcdef",
      "name": "John Doe",
      "approvalStatus": "SUSPENDED",
      "isVerified": true,
      "accountActive": false,
      "rejectionReason": null,
      "suspensionReason": "Account under review due to multiple complaints"
    }
  }
}
```

### Error Responses

- **400 Bad Request**: 
  - Missing `driverId` or `approvalStatus`
  - Invalid `approvalStatus` value (must be one of: PENDING, APPROVED, REJECTED, SUSPENDED)
  - Missing `rejectionReason` when status is REJECTED
  - Missing `suspensionReason` when status is SUSPENDED
- **401 Unauthorized**: Missing or invalid admin token
- **403 Forbidden**: User is not an admin
- **404 Not Found**: Driver not found
- **500 Internal Server Error**: Server error

---

## Error Responses

### Standard Error Format

All endpoints return errors in the following format:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (in development mode)"
}
```

### Common HTTP Status Codes

| Status Code | Description | Common Causes |
|-------------|-------------|---------------|
| `200 OK` | Request successful | - |
| `400 Bad Request` | Invalid request parameters | Missing required fields, invalid status values |
| `401 Unauthorized` | Authentication required | Missing or invalid JWT token |
| `403 Forbidden` | Access denied | User is not an admin |
| `404 Not Found` | Resource not found | Driver ID doesn't exist |
| `500 Internal Server Error` | Server error | Database connection issues, unexpected errors |

### Example Error Response

```json
{
  "success": false,
  "message": "Admin access required",
  "error": "User with ID 'user123' is not an admin"
}
```

---

## Driver Approval Status Values

| Status | Description | `accountActive` | `isVerified` | Email Sent |
|--------|-------------|-----------------|--------------|------------|
| `PENDING` | Driver application is under review | `false` | `false` | No |
| `APPROVED` | Driver has been approved and can operate | `true` | `true` | Yes (with onboarding token) |
| `REJECTED` | Driver application has been rejected | `false` | `false` | Yes (with rejection reason) |
| `SUSPENDED` | Driver account has been suspended | `false` | `true`* | Yes (with suspension reason) |

*`isVerified` remains `true` for suspended drivers as they were previously approved.

---

## Email Token-Based Actions

Some endpoints support email token-based actions for easier workflow integration. These tokens:

- Are JWT tokens signed with `JWT_SECRET`
- Contain `action` (approve/reject/suspend) and `driverId` in payload
- Expire after 7 days
- Are sent in admin notification emails when drivers submit documents

### Token Structure

```json
{
  "action": "approve", // or "reject" or "suspend"
  "driverId": "clx1234567890abcdef",
  "iat": 1234567890,
  "exp": 1235173890
}
```

### Using Email Tokens

1. Admin receives email with approve/reject/suspend links
2. Clicking link makes GET request with token
3. If reason required, user is redirected to form
4. Form submission makes POST request with token and reason
5. Action is processed and confirmation is shown

---

## Best Practices

1. **Always provide reasons**: When rejecting or suspending, always provide clear, helpful reasons
2. **Use appropriate endpoints**: 
   - Use specific endpoints (`/approve`, `/reject`, `/suspend`) for clarity
   - Use generic endpoint (`/approval`) for flexible status management
3. **Handle pagination**: When listing drivers, use pagination to avoid large payloads
4. **Filter appropriately**: Use `approvalStatus` filter to get specific driver groups
5. **Error handling**: Always check response status and handle errors gracefully
6. **Rate limiting**: Be mindful of rate limits when making multiple requests

---

## Testing

### Test with cURL

```bash
# 1. Get admin token (login as admin first)
ADMIN_TOKEN="your_admin_jwt_token"

# 2. List all drivers
curl -X GET "http://localhost:3000/api/driver/admin/list?page=1&limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 3. Approve a driver
curl -X PUT "http://localhost:3000/api/driver/admin/approve/DRIVER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 4. Reject a driver
curl -X PUT "http://localhost:3000/api/driver/admin/reject/DRIVER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Test rejection reason"}'

# 5. Suspend a driver
curl -X PUT "http://localhost:3000/api/driver/admin/suspend/DRIVER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Test suspension reason"}'

# 6. Update status using generic endpoint
curl -X PATCH "http://localhost:3000/api/driver/admin/DRIVER_ID/approval" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalStatus": "SUSPENDED",
    "suspensionReason": "Test suspension"
  }'
```

---

## Support

For issues or questions:
- Check error messages for specific guidance
- Verify admin token is valid and user has admin privileges
- Ensure driver ID exists in the database
- Review logs for detailed error information

---

**Last Updated:** 2024  
**API Version:** 1.0  
**Service:** Transit Driver Service (`transit_driver`)
