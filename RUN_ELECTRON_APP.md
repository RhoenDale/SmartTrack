# SmartTrack Electron Desktop App - Build & Run Guide

## Prerequisites

### Required
- Node.js 18+ and npm/yarn/pnpm
- XAMPP with Apache + MySQL running
- Database initialized with test data
- Test users setup

### Start XAMPP First
```powershell
# Windows XAMPP Control Panel
C:\xampp\xampp-control-panel.exe

# Or command line
C:\xampp\apache\bin\apache.exe
C:\xampp\mysql\bin\mysqld.exe
```

### Verify XAMPP is Ready
```powershell
# Check database
C:\xampp\mysql\bin\mysql.exe -u root smarttrack -e "SELECT COUNT(*) as products FROM products;"
# Should show: 10 (or your product count)

# Check Apache is responding
Invoke-WebRequest http://localhost -UseBasicParsing
# Should get 200 OK
```

### Setup Test Users (One-time)
```
Visit: http://localhost/SmartTrack/api/setup-test-users
```

## Quick Start (5 minutes)

### Option 1: Development Mode (Recommended)

```powershell
# Terminal 1: Start Vite dev server
npm run dev
# or
yarn dev
# or
pnpm dev

# Wait for "Local: http://localhost:5173" message

# Terminal 2: Start Electron
npm run electron
# or in a new terminal
ELECTRON_START_URL=http://localhost:5173 npm start
```

**What happens:**
- Vite dev server runs on port 5173
- Hot-reload enabled: changes auto-refresh
- Electron loads from dev server
- DevTools automatically open (F12)

### Option 2: Production Build

```powershell
# Build the app
npm run build

# Run with built version
npm start
```

## Troubleshooting

### App Shows Blank Screen
1. **Check browser console** (F12)
2. **Verify XAMPP is running**
   ```powershell
   curl http://localhost/SmartTrack/api/diagnostic
   ```
3. **Check network tab** - Look for failed API requests
4. **Check for errors** in Electron console (DevTools)

### Login Fails
**Error: "Cannot connect to server"**
- Start XAMPP (Apache + MySQL)
- Verify: http://localhost/SmartTrack/api/diagnostic

**Error: "Invalid email or password"**
- Setup test users: http://localhost/SmartTrack/api/setup-test-users
- Try: admin@tangub.ph / admin123

### Hot-reload Not Working
1. Kill Vite process (Terminal 1)
2. Kill Electron process (Terminal 2)
3. Run `npm run dev` again
4. Run Electron app again

### CORS Errors in Console
The Electron app automatically injects headers. If you still see CORS errors:
1. Restart XAMPP
2. Clear browser cache: Ctrl+Shift+Delete in DevTools
3. Hard refresh: Ctrl+F5

### "Module not found" Errors
```powershell
# Reinstall dependencies
rm -r node_modules package-lock.json
npm install
npm run dev
npm start
```

## Development Workflow

### Normal Development
```powershell
# Terminal 1: Vite dev server (stays running)
npm run dev

# Terminal 2: Electron (restart as needed)
npm run electron
# or with reload:
kill electron process, then run again
```

### Edit Cycle
1. Edit React component in `src/app/`
2. Save file
3. Vite auto-rebuilds (1-2 seconds)
4. Electron auto-reloads (if hot-reload is enabled)
5. Or manually refresh in Electron (Ctrl+R)

### Edit API Client
1. Edit `src/app/api.ts`
2. Save file
3. Vite rebuilds
4. Electron reloads
5. Changes take effect

### Edit Electron Main Process
1. Edit `electron/main.cjs` or `electron/preload.cjs`
2. Save file
3. **You must manually restart Electron**
   - Close Electron window
   - Run `npm run electron` again

## Building for Distribution

### Create Installer (Windows)

```powershell
# Build and create setup.exe
npm run dist

# Output: C:\SmartTrack-build\release\SmartTrack-Setup.exe
# This file can be distributed to users
```

**Requirements:**
- .NET Framework (for NSIS installer)
- All dependencies installed
- XAMPP connectivity working

### Configuration

Edit `package.json` build section to customize:
- App name
- Version number
- Icon file
- Installer appearance
- Output location

## Build Artifacts

After build:
```
dist/                 ← Compiled web files
electron/main.cjs     ← Electron main process
electron/preload.cjs  ← Preload script
build/                ← Icons and resources
release/              ← Installer output
```

## Environment Variables

### Development
```powershell
$env:NODE_ENV="development"
$env:VITE_API_URL="http://localhost/SmartTrack/api"
npm run dev
```

### Production
```powershell
$env:NODE_ENV="production"
npm run build
npm start
```

## Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Build for production (output: dist/) |
| `npm run electron` | Start Electron with built dist/ |
| `npm start` | Build + run Electron (production) |
| `npm run dist` | Build + create installer (Windows) |

## Performance Tips

### During Development
- Keep DevTools closed unless debugging
- Use "Development Tools" only when needed
- Disable extensions in Electron

### For Production
- Build is fully optimized (minified, tree-shaken)
- App size: ~120MB (after installer)
- Startup time: ~2-3 seconds
- Runtime memory: 150-200MB typical

## File Structure

```
SmartTrack/
├── src/
│   ├── main.tsx              ← App entry point
│   ├── app/
│   │   ├── login.tsx         ← Login page
│   │   ├── home.tsx          ← Main dashboard
│   │   ├── api.ts            ← API client
│   │   ├── electron-init.ts  ← Electron setup
│   │   └── ...other pages
│   └── styles/
│       └── index.css         ← Tailwind styles
├── electron/
│   ├── main.cjs              ← Electron main process
│   └── preload.cjs           ← Preload script
├── build/
│   └── icon.ico              ← App icon
├── dist/                      ← Built app (auto-generated)
├── package.json              ← Dependencies & scripts
└── vite.config.ts           ← Build config
```

## Debugging

### View Logs
**Electron console (automatic):**
```
[SmartTrack] Initializing Electron app
[SmartTrack Electron] { isDev: true, apiBase: "...", ... }
[API] GET /auth/me
[API] Response 200 (45ms)
```

**Browser DevTools (F12):**
```
Console tab: All console.log() output
Network tab: API calls to XAMPP
Application tab: LocalStorage (token)
```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Blank screen | XAMPP not running | Start Apache + MySQL |
| Login fails | Test users not set | Visit setup-test-users endpoint |
| No data | Token not sent | Check localStorage in DevTools |
| CORS error | Headers not injected | Restart XAMPP + clear cache |
| Hot-reload stops | Dev server crashed | Restart `npm run dev` |

## Next Steps

1. ✅ Start XAMPP
2. ✅ Setup test users
3. ✅ Run `npm run dev`
4. ✅ Run `npm run electron`
5. ✅ Login with: admin@tangub.ph / admin123
6. ✅ See dashboard with data

For production, run `npm run dist` to create installer.

## Support

If you encounter issues:
1. Check console (F12) for errors
2. Check Electron console for logs
3. Verify XAMPP is running
4. Run `/api/diagnostic` endpoint
5. Check `/api/test-complete-flow` for full system test
