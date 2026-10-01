# SmartTrack Electron Desktop App - Complete Guide

## 🚀 Quick Start (Easiest Way)

### Step 1: Start XAMPP
Open XAMPP Control Panel and click "Start" for both Apache and MySQL.

### Step 2: Run the Startup Script

**Windows (PowerShell):**
```powershell
.\start-electron-dev.ps1
```

**Windows (Command Prompt):**
```cmd
start-electron-dev.bat
```

The script will:
1. ✓ Check XAMPP connectivity
2. ✓ Install dependencies if needed
3. ✓ Start Vite dev server (port 5173)
4. ✓ Start Electron app

### Step 3: Login
```
Email: admin@tangub.ph
Password: admin123
```

You should see the dashboard with:
- 📊 Weekly revenue chart
- 📦 Inventory data
- 📋 Recent transactions
- ⚠️ Stock alerts

---

## 📋 Manual Setup (If Scripts Don't Work)

### Terminal 1: Start Dev Server
```powershell
npm run dev
# or: yarn dev
# or: pnpm dev

# Wait for: "Local:   http://localhost:5173"
```

### Terminal 2: Start Electron
```powershell
set ELECTRON_START_URL=http://localhost:5173
npm run electron
```

Or as one command:
```powershell
$env:ELECTRON_START_URL="http://localhost:5173"; npm run electron
```

---

## 🔧 Architecture

### How It Works

```
┌─────────────────────────────────────────────────────┐
│         Electron Desktop App (file://)              │
│  ┌─────────────────────────────────────────────┐   │
│  │  React Frontend (src/app/)                  │   │
│  │  - Login page (login.tsx)                   │   │
│  │  - Dashboard (home.tsx, dashboard.tsx)      │   │
│  │  - Inventory, Transactions, Reports, etc.   │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Electron Main (electron/main.cjs)          │   │
│  │  - Injects Origin headers                   │   │
│  │  - Manages window                           │   │
│  │  - IPC bridge to preload                    │   │
│  └─────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────┘
                           │
                 CORS Headers Injected
                    (file:// context)
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│       HTTP API (http://localhost/SmartTrack/api)    │
│  ┌─────────────────────────────────────────────┐   │
│  │  XAMPP Apache + PHP Router                  │   │
│  │  - Route: /auth/login → Bearer token        │   │
│  │  - Route: /products → Product list          │   │
│  │  - Route: /transactions → Transaction list  │   │
│  │  - Route: /dashboard → Dashboard metrics    │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  MySQL Database (smarttrack)                │   │
│  │  - Products & Batches                       │   │
│  │  - Transactions (Sales, Returns, etc.)      │   │
│  │  - Users & Auth Tokens                      │   │
│  │  - Categories, Notifications, etc.          │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Data Flow

1. **User Login**
   - Enter email/password in login page
   - POST `/auth/login` with credentials
   - Server returns Bearer token + user info
   - Token stored in localStorage

2. **Data Fetching**
   - Each API request includes: `Authorization: Bearer <token>`
   - GET `/products` → List products with batch info
   - GET `/transactions` → List all transactions
   - GET `/dashboard` → Dashboard metrics

3. **State Management**
   - React state holds: inventory, transactions, users, categories
   - Updates trigger re-render automatically
   - Dashboard calculates metrics from data

---

## 📁 Project Structure

```
SmartTrack/
├── src/
│   ├── main.tsx                 ← App entry point
│   ├── app/
│   │   ├── login.tsx            ← Login page component
│   │   ├── home.tsx             ← Main dashboard view
│   │   ├── dashboard.tsx        ← Dashboard metrics & charts
│   │   ├── inventory.tsx        ← Inventory management
│   │   ├── transactions.tsx     ← Transaction list
│   │   ├── analytics.tsx        ← Analytics & reports
│   │   ├── api.ts               ← API client (Bearer token handling)
│   │   ├── electron-init.ts     ← Electron initialization
│   │   ├── data.ts              ← TypeScript types
│   │   ├── shared.tsx           ← Shared components
│   │   └── components/          ← UI components
│   └── styles/
│       └── index.css            ← Tailwind CSS
├── electron/
│   ├── main.cjs                 ← Electron main process
│   │   ├── Setup XAMPP session
│   │   ├── Inject Origin headers
│   │   ├── Create window
│   │   └── Handle IPC
│   └── preload.cjs              ← Preload script (IPC bridge)
├── build/
│   └── icon.ico                 ← App icon
├── dist/                        ← Built app (auto-generated)
├── package.json                 ← Dependencies & build scripts
├── vite.config.ts              ← Vite build config
├── tailwind.config.ts          ← Tailwind CSS config
├── postcss.config.mjs          ← PostCSS config
└── api/                        ← XAMPP PHP backend (separate)
    ├── config.php              ← DB connection
    ├── auth.php                ← Token validation
    ├── helpers.php             ← Utility functions
    ├── routes/                 ← API endpoints
    │   ├── auth.php            ← /auth/login, /auth/me
    │   ├── products.php        ← /products (CRUD)
    │   ├── transactions.php    ← /transactions
    │   ├── dashboard.php       ← /dashboard
    │   └── ... more routes
    └── migrations/             ← Database migrations
```

---

## 🔑 Key Technologies

| Tech | Purpose |
|------|---------|
| React 18.3 | UI framework |
| TypeScript | Type safety |
| Vite 6.3 | Build tool (instant reload) |
| Tailwind CSS 4 | Styling |
| Lucide React | Icons |
| Recharts | Charts & graphs |
| Electron 43 | Desktop app |
| PHP 8+ | Backend API |
| MySQL 5.7+ | Database |

---

## 🛠️ Build Targets

### Development
```powershell
npm run dev              # Vite dev server (localhost:5173)
npm run electron        # Electron app (file:// protocol)
```

### Production
```powershell
npm run build           # Build for production (output: dist/)
npm start              # Build + run Electron
npm run dist           # Build + create Windows installer
```

---

## 🔒 Authentication

### Bearer Token Flow

1. **Login Request**
   ```javascript
   POST /auth/login
   { "email": "admin@tangub.ph", "password": "admin123" }
   ```

2. **Server Response**
   ```json
   {
     "user": { "id": "U001", "name": "Admin", "role": "admin/owner", ... },
     "token": "9e7b8bf49ec42e9bee63450681eaf5e0c1ef2dfff2d5e21d46d82524abd0834b"
   }
   ```

3. **Store Token**
   ```javascript
   localStorage.setItem('st_token', token)
   ```

4. **Use in Requests**
   ```javascript
   Authorization: Bearer 9e7b8bf49ec42e9bee63450681eaf5e0c1ef2dfff2d5e21d46d82524abd0834b
   ```

### Token Validation

- Server validates token against `auth_tokens` table
- Token includes 24-hour expiry
- On 401 error, token is cleared from localStorage
- User must re-login

---

## 📊 Available Test Users

| Email | Password | Role | Permissions |
|-------|----------|------|-------------|
| admin@tangub.ph | admin123 | Admin/Owner | Full access (dashboard, users, reports) |
| inv@tangub.ph | inv123 | Inventory Manager | Inventory only (products, stock) |
| cashier@tangub.ph | cashier123 | Cashier | POS only (sales, returns) |

---

## 🌐 API Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/auth/login` | POST | Get Bearer token | No |
| `/auth/logout` | POST | Clear token | Yes |
| `/auth/me` | GET | Current user info | Yes |
| `/products` | GET | List products | Yes |
| `/products` | POST | Create product | Yes (Inventory) |
| `/transactions` | GET | List transactions | Yes |
| `/transactions/sale` | POST | Record sale | Yes (Cashier) |
| `/dashboard` | GET | Dashboard metrics | Yes (Admin) |
| `/diagnostic` | GET | System health check | No |
| `/test-complete-flow` | GET | Full integration test | No |

---

## 🐛 Debugging

### View Console Output

**Electron Developer Tools:**
- Press `F12` in the app
- Go to "Console" tab
- See all logs and errors

**Electron Main Process:**
- Check terminal where you ran `npm run electron`
- Shows startup logs and errors

### Common Messages

```
[API] GET /products
[API] Response 200 (150ms)
[SmartTrack] ✓ XAMPP connected
[SmartTrack Electron] { isDev: true, platform: "win32", ... }
```

### Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Blank screen | App didn't load | Check F12 console, see "Failed to fetch" |
| Login fails | XAMPP not running | Start Apache + MySQL in XAMPP |
| "Cannot connect to server" | API unreachable | Verify http://localhost/SmartTrack/api |
| No data showing | Token not sent | Check localStorage in DevTools |
| Slow data loading | Large dataset | Data is cached, check network tab |

---

## 📦 Packaging for Distribution

### Create Windows Installer

```powershell
npm run dist
# Output: C:\SmartTrack-build\release\SmartTrack-Setup.exe
```

### Distribute to Users

1. Give them `SmartTrack-Setup.exe`
2. They run the installer
3. App installs to Program Files
4. Start menu shortcut created
5. XAMPP must be running on their machine

### Before Distribution

- [ ] Update version in package.json
- [ ] Update app icon (build/icon.ico)
- [ ] Test complete flow end-to-end
- [ ] Verify all features work
- [ ] Remove debug code / test endpoints

---

## ✅ Verification Checklist

Before running:
- [ ] XAMPP is running (Apache + MySQL)
- [ ] Database is initialized: `mysql -u root smarttrack`
- [ ] Test users are set: Visit `/api/setup-test-users`
- [ ] Dependencies installed: `npm install`

During startup:
- [ ] Vite dev server starts (localhost:5173)
- [ ] Electron app window opens
- [ ] No blank screen / errors in F12

After login:
- [ ] Dashboard shows data
- [ ] Charts display correctly
- [ ] Inventory lists products
- [ ] Transactions show sales/returns
- [ ] Can perform CRUD operations

---

## 📞 Support

### Quick Tests

```
System Health: http://localhost/SmartTrack/api/diagnostic
Full Flow Test: http://localhost/SmartTrack/api/test-complete-flow
Setup Users: http://localhost/SmartTrack/api/setup-test-users
```

### Logs to Check

1. **Browser DevTools** (F12)
   - Console: JavaScript errors
   - Network: API calls
   - Application: LocalStorage (token)

2. **Electron Terminal**
   - Main process logs
   - Connection messages

3. **XAMPP Logs**
   - `C:\xampp\apache\logs\error.log`
   - `C:\xampp\mysql\data\mysql.err`

### If All Else Fails

```powershell
# Reset everything
rm -r node_modules dist .
npm install
npm run build
npm start
```

---

## 📝 License

SmartTrack © 2024 - Tangub Pharmacy

---

**Ready to start?** Run `.\start-electron-dev.ps1` (or `.bat` on Command Prompt) and login!
