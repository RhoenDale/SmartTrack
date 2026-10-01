# SmartTrack Network Setup Guide
## Multiple Users on Multiple Computers

---

## 📋 What You Need

### Hardware:
- ✅ **Server Computer** (running XAMPP)
- ✅ **Client Computers** (cashiers, inventory staff, etc.)
- ✅ **Router/Switch** (for UTP cable connections) OR **WiFi Router**
- ✅ **UTP/Ethernet Cables** (Cat5e or Cat6) - if using wired connection

### Software:
- ✅ XAMPP installed on server computer
- ✅ Web browser on all client computers (Chrome, Edge, Firefox)

---

## 🔧 Setup Steps

### **STEP 1: Find Server IP Address**

On the **server computer** (where XAMPP is installed):

1. Press `Win + R`
2. Type: `cmd` and press Enter
3. Type: `ipconfig` and press Enter
4. Look for **"IPv4 Address"** under your active network adapter

**Example:**
```
Ethernet adapter:
   IPv4 Address. . . . . . . : 192.168.1.100
```

**Write down this IP!** For this guide, we'll use `192.168.1.100`

---

### **STEP 2: Configure XAMPP Apache**

1. Open **XAMPP Control Panel**
2. Click **"Config"** button next to **Apache**
3. Select **"httpd.conf"**
4. Find this line (around line 50):
   ```apache
   Listen 80
   ```
   ✅ Make sure it says `Listen 80` (NOT `Listen 127.0.0.1:80`)

5. Find this section (around line 220):
   ```apache
   <Directory "C:/xampp/htdocs">
       Options Indexes FollowSymLinks Includes ExecCGI
       AllowOverride All
       Require all granted
   </Directory>
   ```
   ✅ Make sure it says **`Require all granted`**

6. **Save** and close Notepad

---

### **STEP 3: Configure MySQL for Remote Access**

1. In **XAMPP Control Panel**, click **"Config"** next to **MySQL**
2. Select **"my.ini"**
3. Find this line (around line 20):
   ```ini
   bind-address=127.0.0.1
   ```
4. Change it to:
   ```ini
   bind-address=0.0.0.0
   ```
5. **Save** and close

---

### **STEP 4: Grant MySQL User Remote Access**

1. Open **phpMyAdmin**: http://localhost/phpmyadmin
2. Click **"SQL"** tab at the top
3. Run this query:
   ```sql
   GRANT ALL PRIVILEGES ON smarttrack.* TO 'root'@'%' IDENTIFIED BY '';
   FLUSH PRIVILEGES;
   ```
4. Click **"Go"**

**Note:** If you set a password for MySQL root, replace the empty `''` with your password.

---

### **STEP 5: Configure Windows Firewall**

1. Press `Win + R`, type: `firewall.cpl`, press Enter
2. Click **"Advanced settings"** (left sidebar)
3. Click **"Inbound Rules"** (left panel)
4. Click **"New Rule..."** (right panel)
5. Select **"Port"** → Click **Next**
6. Select **"TCP"**
7. Enter ports: **`80, 3306`**
8. Click **Next**
9. Select **"Allow the connection"** → **Next**
10. Check all boxes (Domain, Private, Public) → **Next**
11. Name: **"SmartTrack XAMPP Access"**
12. Click **Finish**

---

### **STEP 6: Restart XAMPP Services**

1. In **XAMPP Control Panel**:
   - Click **"Stop"** for Apache
   - Click **"Stop"** for MySQL
2. Wait 5 seconds
3. Click **"Start"** for Apache
4. Click **"Start"** for MySQL

✅ Both should show green "Running" status

---

### **STEP 7: Test from Server Computer**

1. Open browser on the **server computer**
2. Go to: `http://192.168.1.100/SmartTrack/`
   (Replace `192.168.1.100` with your actual IP from Step 1)
3. ✅ SmartTrack login page should appear

---

### **STEP 8: Connect Client Computers**

On **each client computer** (cashier terminals, inventory stations):

#### **Option A: Direct Browser Access (Recommended)**
1. Open web browser (Chrome/Edge/Firefox)
2. Go to: `http://192.168.1.100/SmartTrack/`
3. Bookmark this page for easy access
4. ✅ Login with user credentials

#### **Option B: Desktop Shortcut**
1. Right-click on desktop → **New** → **Shortcut**
2. Enter location: `http://192.168.1.100/SmartTrack/`
3. Name it: **"SmartTrack POS"**
4. Click **Finish**
5. Double-click shortcut to open

---

## 🌐 Network Topology Examples

### **Setup 1: Wired Network (UTP Cables)**
```
[Server PC with XAMPP]
         |
    [Switch/Router]
    /    |    \
[PC1]  [PC2]  [PC3]
```

### **Setup 2: WiFi Network**
```
[Server PC with XAMPP] ──── [WiFi Router]
                               /   |   \
                           [PC1] [PC2] [PC3]
```

### **Setup 3: Mixed (Wired + WiFi)**
```
[Server PC with XAMPP]
         |
    [WiFi Router]
    /    |    \
[Wired] [WiFi] [WiFi]
```

---

## 🔒 Security Recommendations

### **1. Set MySQL Password**
```sql
-- In phpMyAdmin SQL tab:
SET PASSWORD FOR 'root'@'localhost' = PASSWORD('your_strong_password');
SET PASSWORD FOR 'root'@'%' = PASSWORD('your_strong_password');
FLUSH PRIVILEGES;
```

Then update `api/config.php`:
```php
define('DB_PASS', 'your_strong_password');
```

### **2. Change Admin Password**
In SmartTrack, login as admin → Go to **Users** → Change password

### **3. Restrict Network Access**
Only allow specific IPs to access MySQL:
```sql
-- Instead of 'root'@'%', use specific IPs:
GRANT ALL PRIVILEGES ON smarttrack.* TO 'root'@'192.168.1.101' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON smarttrack.* TO 'root'@'192.168.1.102' IDENTIFIED BY 'password';
```

---

## 🧪 Testing Checklist

- [ ] Server computer can access: `http://localhost/SmartTrack/`
- [ ] Server computer can access: `http://192.168.1.100/SmartTrack/`
- [ ] Client computer can access: `http://192.168.1.100/SmartTrack/`
- [ ] Multiple users can login simultaneously
- [ ] Transactions sync across all computers
- [ ] Inventory updates reflect on all terminals

---

## 🐛 Troubleshooting

### **Problem: Cannot access from client computer**

**Solution 1: Check Firewall**
```cmd
# On server computer, run as Administrator:
netsh advfirewall firewall add rule name="XAMPP Apache" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="XAMPP MySQL" dir=in action=allow protocol=TCP localport=3306
```

**Solution 2: Check Server IP**
```cmd
ipconfig
```
Make sure you're using the correct IP address.

**Solution 3: Ping Server**
On client computer:
```cmd
ping 192.168.1.100
```
If it fails, there's a network connectivity issue.

**Solution 4: Disable Antivirus Temporarily**
Some antivirus software blocks incoming connections.

---

### **Problem: "Access denied for user 'root'@'client-ip'"**

Run this in phpMyAdmin on the server:
```sql
GRANT ALL PRIVILEGES ON smarttrack.* TO 'root'@'%' IDENTIFIED BY '';
FLUSH PRIVILEGES;
```

---

### **Problem: Slow Performance**

**Causes:**
- Too many open connections
- Weak WiFi signal
- Server computer too slow

**Solutions:**
- Use wired connection (UTP cable) instead of WiFi
- Upgrade server RAM
- Close unnecessary applications on server

---

## 📱 Mobile Device Access (Bonus)

Smartphones/tablets on the same WiFi can also access SmartTrack!

1. Connect phone to same WiFi network
2. Open browser
3. Go to: `http://192.168.1.100/SmartTrack/`
4. ✅ Login and use

---

## 🔄 Daily Operations

### **Server Computer (XAMPP Host):**
- ✅ Must be turned ON during business hours
- ✅ XAMPP Apache and MySQL must be running
- ✅ Don't close XAMPP Control Panel

### **Client Computers:**
- ✅ Just open browser and go to server IP
- ✅ Login with assigned user credentials
- ✅ No special software needed

---

## 📊 Recommended Hardware Specs

### **Server Computer:**
- **CPU:** Intel Core i3 or AMD Ryzen 3 (minimum)
- **RAM:** 8GB minimum, 16GB recommended
- **Storage:** 256GB SSD
- **Network:** Gigabit Ethernet (1000 Mbps)

### **Client Computers:**
- **CPU:** Any modern processor
- **RAM:** 4GB minimum
- **Network:** 100 Mbps Ethernet or WiFi

---

## 💡 Tips

1. **Use Static IP** for server computer (prevents IP changes)
2. **Set XAMPP to auto-start** on Windows startup
3. **Backup database regularly** (export from phpMyAdmin)
4. **Use UPS (Uninterruptible Power Supply)** for server computer
5. **Keep server computer in a secure location**

---

## 📞 Quick Reference

**Server Access URLs:**
- SmartTrack: `http://192.168.1.100/SmartTrack/`
- phpMyAdmin: `http://192.168.1.100/phpmyadmin/`
- XAMPP Dashboard: `http://192.168.1.100/dashboard/`

**Default Login:**
- Username: `admin@smarttrack.local`
- Password: `admin123` (change after first login!)

---

## ✅ Setup Complete!

Your SmartTrack POS system is now ready for multi-user, multi-computer operation!

**Need Help?** Check the Troubleshooting section above.

