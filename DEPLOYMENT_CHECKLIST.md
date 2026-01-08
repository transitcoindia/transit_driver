# Deployment Checklist - Subscription API

## ✅ Pre-Deployment Checks

### 1. Code Review
- [x] Subscription controller created (`subscription.ts`)
- [x] Routes added to `driverRoutes.ts`
- [x] Validation schema added (`driverValidation.ts`)
- [x] No TypeScript compilation errors
- [x] Code follows existing patterns

### 2. Local Testing

#### Test 1: Service Starts
```bash
cd transit_driver
npm run dev
```
- [x] Service starts without errors
- [x] Health endpoint works: `GET http://localhost:3000/health`

#### Test 2: Registration API
```bash
POST http://localhost:3000/api/driver/register
```
- [x] Registration works (Status 201)

#### Test 3: Subscription Endpoints Exist
After restarting service with new code:
```bash
# Should return 401 (not 404) = endpoint exists but needs auth
POST http://localhost:3000/api/driver/subscription/activate
GET http://localhost:3000/api/driver/subscription
```

### 3. Database Schema
- [x] `DriverSubscription` model exists
- [x] `SubscriptionPayment` model exists
- [x] Prisma client generated (`npx prisma generate`)

---

## 🚀 Deployment Steps

### Step 1: Commit Changes
```bash
cd transit_driver
git add .
git commit -m "feat: Add driver subscription API endpoints"
```

### Step 2: Push to Repository
```bash
git push origin main
```

### Step 3: Deploy to Production

**Option A: If using AWS ECS (Current Setup)**
```bash
# 1. Build and push Docker image
docker build -t transit-driver .
docker tag transit-driver:latest 910162731533.dkr.ecr.ap-south-1.amazonaws.com/transit-driver:latest
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 910162731533.dkr.ecr.ap-south-1.amazonaws.com
docker push 910162731533.dkr.ecr.ap-south-1.amazonaws.com/transit-driver:latest

# 2. Update ECS service (forces new deployment)
aws ecs update-service \
  --cluster transit-cluster \
  --service transit-driver-service \
  --force-new-deployment \
  --region ap-south-1
```

**Option B: If using Render/Other Platform**
- Push to git repository
- Platform auto-deploys on push

### Step 4: Verify Deployment
```bash
# Check service health
curl https://api.transitco.in/health

# Test subscription endpoint (should return 401, not 404)
curl -X POST https://api.transitco.in/api/driver/subscription/activate \
  -H "Content-Type: application/json" \
  -d '{"amount":1000,"paymentMode":"UPI"}'
```

---

## 🧪 Post-Deployment Testing

### Test 1: Registration (Production)
```bash
POST https://api.transitco.in/api/driver/register
```
- [ ] Returns 201 Created
- [ ] Creates User and Driver records
- [ ] Returns OTP in response

### Test 2: Login (Production)
```bash
POST https://api.transitco.in/api/driver/login/email
Body: { "email": "...", "password": "..." }
```
- [ ] Returns 200 OK
- [ ] Returns access token
- [ ] Requires email verification

### Test 3: Subscription Activate (Production)
```bash
POST https://api.transitco.in/api/driver/subscription/activate
Headers: Authorization: Bearer <token>
Body: {
  "amount": 1000,
  "paymentMode": "UPI",
  "durationDays": 30
}
```
- [ ] Returns 201 Created
- [ ] Creates SubscriptionPayment record
- [ ] Creates DriverSubscription with ACTIVE status
- [ ] Returns subscription and payment details

### Test 4: Get Subscription (Production)
```bash
GET https://api.transitco.in/api/driver/subscription
Headers: Authorization: Bearer <token>
```
- [ ] Returns 200 OK
- [ ] Returns active subscription or null
- [ ] Auto-updates expired subscriptions

---

## 📊 Expected Behavior

### Success Scenarios
1. ✅ Driver registers successfully
2. ✅ Driver logs in after email verification
3. ✅ Driver activates subscription with payment
4. ✅ Driver can check subscription status
5. ✅ New subscription cancels old active subscription

### Error Scenarios
1. ✅ Returns 401 if not authenticated
2. ✅ Returns 400 if validation fails
3. ✅ Returns 404 if driver not found
4. ✅ Returns 500 if database error

---

## 🔍 Monitoring After Deployment

### Check CloudWatch Logs
```bash
aws logs tail /ecs/transit-driver --follow --region ap-south-1
```

### Monitor for Errors
- Subscription creation failures
- Payment record creation issues
- Database transaction errors
- Authentication failures

---

## 📝 Rollback Plan (If Needed)

If issues occur:

```bash
# Revert to previous task definition
aws ecs update-service \
  --cluster transit-cluster \
  --service transit-driver-service \
  --task-definition transit-driver:PREVIOUS_VERSION \
  --region ap-south-1
```

Or revert git commit:
```bash
git revert HEAD
git push origin main
```

---

## ✅ Final Checklist

- [ ] All code changes committed
- [ ] Code pushed to repository
- [ ] Database schema is up to date
- [ ] Service deployed successfully
- [ ] Health endpoint responding
- [ ] Registration API working
- [ ] Login API working
- [ ] Subscription activate endpoint working
- [ ] Subscription get endpoint working
- [ ] No errors in CloudWatch logs

---

## 🎯 Success Criteria

Deployment is successful when:
1. ✅ All endpoints return expected status codes (not 404)
2. ✅ Registration creates driver accounts
3. ✅ Login authenticates drivers
4. ✅ Subscription activation creates records in database
5. ✅ No critical errors in logs

