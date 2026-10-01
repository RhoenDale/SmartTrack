# SmartTrack Electron Desktop App - Setup & Troubleshooting

## Quick Start (5 minutes)

### 1. Start XAMPP
```
1. Open XAMPP Control Panel
2. Click "Start" for Apache and MySQL
3. Wait until both show "Running" status
```

### 2. Verify Database
```powershell
# In PowerShell, run:
C:\xampp\mysql\bin\mysql.exe -u root smarttrack -e "SELECT COUNT(*) as products FROM products;"
```
Should show: `10` (or your number of products)

### 3. Setup Test Users (One-time only)
```
Open in browser: http://localhost/SmartTrack/api/setup-test-users
```
Response should show 3 users updated.

### 4. Launch Electron App
```powershell
npm run electron
# or
yarn electron
```

### 5. Login
```
Email: admin@tangub.ph
Password: admin123
```

You should see the dashboard with:
- Stock metrics
- Revenue charts
- Product listings
- Recent transactions

---

## If Dashboard Shows 0 for All Metrics

### Issue 1: No Data in Database
**Test:**
```
http://localhost/SmartTrack/api/diagnostic
```

**Check:** Look for:
- `"tables_found": 11`
- `"all_present": true`
- `"data": { "products": 10, ... }`

**Fix:** If data is 0, run:
```
mysql -u root smarttrack < smarttrack.sql
```

---

### Issue 2: Login Fails with "Invalid email or password"
**Test:**
```
http://localhost/SmartTrack/api/setup-test-users
```

**Check:** Should return:
```json
{
  "status": "success",
  "message": "3 users updated with test passwords"
}
```

**Fix:** If it fails, run manually:
```powershell
C:\xampp\mysql\bin\mysql.exe -u root smarttrack -e "UPDATE users SET password = '\$2y\$10\$dummyhashhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh' WHERE id = 'U001';"
```

---

### Issue 3: Electron App Loads but No Data
**Test:**
```
http://localhost/SmartTrack/api/test-complete-flow
```

**Check:** Should show:
- `"step_1_login": { "status": "success", ... }`
- `"step_2_products": { "count": 10, ... }`
- `"overall_status": "SUCCESS - All data fetched correctly!"`

**Fix:** If any step fails:
1. Check XAMPP MySQL is running
2. Verify `api/config.php` has correct credentials
3. Run diagnostic endpoint

---

### Issue 4: "Failed to fetch" Errors in Console

**Check Electron Console (F12):**
```
1. Press F12 in Electron app
2. Look at "Console" tab
3. Check "Network" tab for failed requests
```

**Common errors:**
- `ERR_NAME_NOT_RESOLVED` → XAMPP not running
- `HTTP 401 Unauthorized` → Token invalid, re-login
- `HTTP 404 Not Found` → API endpoint missing
- `HTTP 500 Internal Server Error` → Database error

**Fix:**
```
1. Restart XAMPP
2. Clear browser cache (Ctrl+Shift+Delete)
3. Hard refresh (Ctrl+F5)
4. Re-login
```

---

## API Testing Endpoints

### Test Everything at Once
```
GET http://localhost/SmartTrack/api/test-complete-flow
```

### Test Individual Components

#### 1. Database Health
```
GET http://localhost/SmartTrack/api/diagnostic
```

#### 2. User Setup
```
GET http://localhost/SmartTrack/api/setup-test-users
```

#### 3. Login
```powershell
$login = @{
    email = "admin@tangub.ph"
    password = "admin123"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost/SmartTrack/api/auth/login" `
  -Method POST -ContentType "application/json" -Body $login
```

#### 4. Fetch Products (with token)
```powershell
$token = "YOUR_TOKEN_HERE"

Invoke-WebRequest -Uri "http://localhost/SmartTrack/api/products" `
  -Method GET -Headers @{ "Authorization" = "Bearer $token" }
```

---

## Port & Connection Info

| Service | Host | Port | Status |
|---------|------|------|--------|
| XAMPP Apache | localhost | 80 | Must be running |
| XAMPP MySQL | 127.0.0.1 | 3306 | Must be running |
| Vite Dev Server | localhost | 5173 | Optional (for dev) |
| Electron App | file:// | N/A | Loads local HTML |
| API Base URL | http://localhost/SmartTrack/api | 80 | Used by Electron |

---

## Database Credentials

**File:** `api/config.php`

```php
define('DB_HOST', '127.0.0.1');  // XAMPP default
define('DB_PORT', '3306');        // MySQL default
define('DB_NAME', 'smarttrack');  // Database name
define('DB_USER', 'root');        // MySQL root
define('DB_PASS', '');            // No password (XAMPP default)
```

**For Production:**
1. Add a real password to DB_PASS
2. Create a separate DB user (not root)
3. Restrict database access

---

## Test Users

| Email | Password | Role |
|-------|----------|------|
| admin@tangub.ph | admin123 | Admin/Owner - Full access |
| inv@tangub.ph | inv123 | Inventory Manager - Inventory only |
| cashier@tangub.ph | cashier123 | Cashier - POS only |

---

## Logs & Debugging

### Browser Console (Electron)
```
1. Press F12
2. Check Console tab for errors
3. Check Network tab for API calls
4. Look for CORS errors
```

### XAMPP Error Logs
```
Apache: C:\xampp\apache\logs\error.log
MySQL: C:\xampp\mysql\data\mysql.err
PHP: Check browser response body
```

### Check Tokens in Storage
```javascript
// In browser console (F12):
localStorage.getItem('st_token')
```

---

## Development vs Production

### Development (Current Setup)
- ✅ XAMPP with no password
- ✅ File:// protocol for Electron
- ✅ Test users with simple passwords
- ✅ All endpoints accessible
- ✅ Diagnostic endpoints active

### Production Checklist
- [ ] Add DB password to config.php
- [ ] Remove /api/setup-test-users endpoint
- [ ] Remove /api/diagnostic endpoint
- [ ] Remove /api/test-complete-flow endpoint
- [ ] Enable HTTPS in Apache
- [ ] Set session cookies to secure + httponly
- [ ] Add rate limiting to /auth/login
- [ ] Enable CORS only for production domain
- [ ] Set up proper error logging (not console)
- [ ] Change default admin password

---

## Recovery Steps

### If Everything Breaks

```powershell
# 1. Restart XAMPP
# (Stop both Apache and MySQL, then start again)

# 2. Reset database
$xamppPath = "C:\xampp\mysql\bin\mysql.exe"
& $xamppPath -u root smarttrack -e "DROP DATABASE smarttrack;"
& $xamppPath -u root < smarttrack.sql

# 3. Setup users again
# Visit: http://localhost/SmartTrack/api/setup-test-users

# 4. Clear Electron cache
# Delete: C:\Users\<user>\AppData\Roaming\SmartTrack\

# 5. Restart Electron app
```

---

## Performance Tips

### Reduce Load Time
- Products endpoint caches batches per product
- Queries use indexes on product_id, user_id, transaction dates
- PDO prepared statements prevent SQL injection

### Monitor Performance
- Dashboard query: Last 7 days only
- Product list: Computed stock per product
- Batch queries: Use FIFO ordering (received_date ASC)

### Database Optimization
```sql
-- Add if not exists:
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_batches_product ON product_batches(product_id);
CREATE INDEX idx_transactions_date ON transactions(transacted_at);
```

---

## Support Checklist

Before asking for help, verify:
- [ ] XAMPP is running (both Apache & MySQL)
- [ ] Database initialized: `mysql -u root smarttrack`
- [ ] Test users setup: Visit setup endpoint
- [ ] Login works: Try admin@tangub.ph / admin123
- [ ] API responds: Visit /api/diagnostic
- [ ] No network errors: Check browser F12 console
- [ ] Token stored: Check localStorage in F12
- [ ] Recent date data: Dashboard only shows last 7 days

---

## Files Modified

| File | Purpose |
|------|---------|
| api/config.php | Database connection settings |
| api/db.php | PDO singleton |
| api/index.php | Route dispatcher |
| api/auth.php | Bearer token + session auth |
| src/app/api.ts | Frontend API client |
| src/app/home.tsx | Data loading after login |
| src/app/dashboard.tsx | Dashboard metrics calculation |

---

## Next Steps

1. ✅ Verify all endpoints work
2. ✅ Confirm dashboard displays data
3. ✅ Test all CRUD operations (Add/Edit/Delete products)
4. ✅ Run transactions (Sales/Returns/Adjustments)
5. ✅ Verify reports and exports
6. ✅ Ready for production deployment
