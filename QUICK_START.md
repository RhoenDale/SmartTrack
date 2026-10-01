# SmartTrack Electron App - Quick Start (2 minutes)

## ⚡ One-Command Start

### PowerShell (Windows)
```powershell
.\start-electron-dev.ps1
```

### Command Prompt (Windows)
```cmd
start-electron-dev.bat
```

## What Happens
1. ✅ Checks if XAMPP is running
2. ✅ Installs dependencies if needed
3. ✅ Starts Vite dev server (port 5173)
4. ✅ Starts Electron app
5. ✅ You login and use the app

## 🔑 Default Credentials

```
Email: admin@tangub.ph
Password: admin123
```

## ✅ You Should See
- Pharmacy logo and welcome screen
- Dashboard with metrics
- 10 products in inventory
- Recent transactions
- Stock alerts

## 🚨 If Something Goes Wrong

### "Cannot connect to server"
**Fix:** Start XAMPP
- Open XAMPP Control Panel
- Click "Start" for Apache
- Click "Start" for MySQL
- Wait for both to show "Running"

### "Invalid email or password"
**Fix:** Setup test users
- Visit: http://localhost/SmartTrack/api/setup-test-users
- Then login again

### "XAMPP not running" warning
**Fix:** Start XAMPP before running script

### Blank screen
**Fix:** Check browser console
- Press F12 in app
- Look at "Console" tab
- Report any red errors

## 📦 Manual Setup (If Scripts Fail)

### Terminal 1
```powershell
npm run dev
```

Wait for: `Local:   http://localhost:5173`

### Terminal 2
```powershell
$env:ELECTRON_START_URL="http://localhost:5173"
npm run electron
```

## 🏗️ Build for Distribution

```powershell
npm run dist
```

Creates: `C:\SmartTrack-build\release\SmartTrack-Setup.exe`

## 📖 Full Guides

- **Complete Guide**: `ELECTRON_APP_README.md`
- **Build Instructions**: `RUN_ELECTRON_APP.md`
- **Troubleshooting**: `ELECTRON_FIX_GUIDE.md`
- **Setup Reference**: `ELECTRON_SETUP_INSTRUCTIONS.md`

## 🎯 Next: Try Features

1. **View Dashboard** - See revenue, stock, alerts
2. **Add Product** - Test inventory management
3. **Record Sale** - Test POS functionality
4. **View Reports** - Check analytics

## ⏱️ Total Setup Time
- First time: 2-3 minutes (dependencies install)
- Subsequent: 10-15 seconds (just starts)

---

**That's it!** Your app is running. Happy tracking! 🚀
