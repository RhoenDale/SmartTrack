# SmartTrack - Data Flow Architecture

## Overview
SmartTrack is a **client-side React application** with **no backend integration**. All state is managed locally using React's `useState` hook, and all data is initialized from mock constants in `data.ts`.

---

## 1. Application Entry & Authentication Flow

```
┌─────────────┐
│ main.tsx    │ ← React DOM entry point
└──────┬──────┘
       │ renders
       ↓
┌─────────────┐
│ Login.tsx   │ ← Auth gate component
└──────┬──────┘
       │
       ├─ Holds state: user: AuthUser | null
       │
       ├─ If user === null → renders LoginPage
       │    │
       │    ├─ User enters email + password
       │    │
       │    ├─ Validates against CREDENTIALS map (data.ts)
       │    │   - admin@tangub.ph → admin user
       │    │   - staff@tangub.ph → staff user
       │    │
       │    └─ On success → setUser(authUser)
       │
       └─ If user exists → renders <Home user={user} onLogout={...} />
```

---

## 2. Core Data Sources (data.ts)

All application data originates from `src/app/data.ts`:

```
data.ts
├── Types
│   ├── UserRole: "admin" | "staff"
│   ├── Page: "dashboard" | "inventory" | "transactions" | "analytics" | "users" | "stock-alerts" | "reports"
│   ├── StockStatus: "good" | "moderate" | "low" | "critical"
│   ├── TxStatus: "completed" | "pending" | "approved" | "cancelled"
│   ├── TxType: "sale" | "purchase" | "return"
│   ├── AuthUser: { name, role, initials, position }
│   ├── Product: { id, name, category, stock, reorder, price, salePrice?, expiry, status }
│   ├── Transaction: { id, type, product, qty, amount, staff, date, status, productId?, note? }
│   ├── StaffMember: { id, name, role, email, status, lastLogin, initials }
│   └── Notification: { id, type, title, body, time, read }
│
├── Mock Data (Initial State)
│   ├── CREDENTIALS: Record<email, { password, user: AuthUser }>
│   ├── INIT_INVENTORY: Product[]        (10 pharmacy products)
│   ├── INIT_TRANSACTIONS: Transaction[]  (8 sample transactions)
│   ├── INIT_STAFF: StaffMember[]         (5 staff members)
│   ├── INIT_NOTIFS: Notification[]       (5 notifications)
│   ├── INIT_CATEGORIES: string[]         (9 product categories)
│   └── ROLES: string[]                   (3 role options)
│
└── Chart Data (Static)
    ├── revenueData: { day, revenue, profit }[]  (7 days)
    ├── demandSupply: { month, demand, supply }[] (6 months)
    ├── categoryData: { name, value }[]          (pie chart data)
    └── PIE_COLORS: string[]
```

---

## 3. Home Component — Central State Manager

The `Home` component in `home.tsx` is the **single source of truth** for all application state:

```
┌────────────────────────────────────────────────────────────────┐
│                         Home Component                          │
│                                                                 │
│  State:                                                         │
│  ├── page: Page                     ← Current active page       │
│  ├── darkMode: boolean              ← UI theme toggle          │
│  ├── sidebarExpanded: boolean       ← Sidebar state            │
│  ├── showSettings: boolean          ← Settings panel toggle    │
│  │                                                              │
│  ├── inventory: Product[]           ← From INIT_INVENTORY      │
│  ├── transactions: Transaction[]    ← From INIT_TRANSACTIONS   │
│  ├── staff: StaffMember[]           ← From INIT_STAFF          │
│  ├── notifs: Notification[]         ← From INIT_NOTIFS         │
│  ├── categories: string[]           ← From INIT_CATEGORIES     │
│  │                                                              │
│  └── Modal States:                                             │
│      ├── showAddProduct: boolean                               │
│      ├── editingProduct: Product | null                        │
│      ├── showAddSale: boolean                                  │
│      ├── showAddPO: boolean                                    │
│      ├── showAddReturn: boolean                                │
│      ├── showAddUser: boolean                                  │
│      ├── editingUser: StaffMember | null                       │
│      ├── showNotifications: boolean                            │
│      └── viewingInvoice: Transaction | null                    │
│                                                                 │
│  Renders:                                                       │
│  ├── Sidebar (navigation)                                      │
│  ├── Topbar (search, notifications, user menu)                 │
│  └── Main Content (page switcher)                              │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow — Page Rendering

Navigation is **state-based** (no React Router):

```
User clicks nav item
       │
       ↓
setPage(newPage)
       │
       ↓
Home re-renders with new page value
       │
       ↓
Page switcher in <main>:
       │
       ├─ page === "dashboard"     → <Dashboard />
       ├─ page === "inventory"     → <InventoryPage />
       ├─ page === "transactions"  → <TransactionsPage />
       ├─ page === "analytics"     → <AnalyticsPage />
       ├─ page === "stock-alerts"  → <StockAlertsPage />
       ├─ page === "reports"       → <ReportsPage />
       └─ page === "users"         → <UsersPage /> (admin only)
```

Each page component receives state as props:

```
Dashboard:
  └── receives: user, inventory, transactions
  └── displays: KPI cards, revenue chart, top products, recent transactions, stock alerts

InventoryPage:
  └── receives: inventory, categories, onAddProduct, onEditProduct, onAddCategory
  └── displays: product table with search/filter, add/edit actions

TransactionsPage:
  └── receives: user, transactions, inventory, currentUser, onAddSale, onAddPO, onAddReturn, onUpdateTxStatus, onViewInvoice
  └── displays: transaction table, filter by type, approve/cancel PO, print receipt

AnalyticsPage:
  └── receives: none (uses static chart data from data.ts)
  └── displays: supply-demand chart, category pie chart, product performance table

StockAlertsPage:
  └── receives: inventory, onGoToInventory
  └── displays: critical/low/moderate items grouped, stock progress bars

ReportsPage:
  └── receives: inventory, transactions, user
  └── displays: tabbed reports (sales, stock alerts, inventory)

UsersPage:
  └── receives: staff, onAddUser, onEditUser
  └── displays: staff table, add/edit user (admin only)
```

---

## 5. Data Flow — User Actions

### 5.1. Add/Edit Product

```
User clicks "Add Product" button
       │
       ↓
setShowAddProduct(true)
       │
       ↓
<ProductFormModal> renders
       │
       ├─ User fills form
       ├─ Selects category (or adds custom)
       └─ Submits
       │
       ↓
onSave(original, updated)
       │
       ├─ If new: setInventory([updated, ...prev])
       └─ If edit: setInventory(prev.map(p => p.id === original.id ? updated : p))
       │
       ↓
Modal closes → Inventory state updated → InventoryPage re-renders with new data
```

### 5.2. Create Sale Transaction

```
User clicks "New Sale" button
       │
       ↓
setShowAddSale(true)
       │
       ↓
<NewSaleModal> renders
       │
       ├─ ProductSearchWidget: search by name or ID
       │    └─ Live filters inventory
       │
       ├─ User selects product
       ├─ Enters quantity
       └─ Submits
       │
       ↓
handleAddSale(tx, productId, qty)
       │
       ├─ Add transaction: setTransactions([tx, ...prev])
       │
       └─ Reduce inventory:
           setInventory(prev.map(p => {
             if (p.id === productId) {
               const newStock = p.stock - qty;
               return { ...p, stock: newStock, status: computeStatus(newStock, p.reorder) };
             }
             return p;
           }))
       │
       ↓
Modal closes → Transactions + Inventory states updated → UI reflects changes
```

### 5.3. Create Purchase Order

```
User clicks "Purchase Order" button
       │
       ↓
setShowAddPO(true)
       │
       ↓
<PurchaseOrderModal> renders
       │
       ├─ ProductSearchWidget: search product
       ├─ User enters supplier, unit cost, quantity, expected delivery
       └─ Submits
       │
       ↓
handleAddPO(tx)
       │
       └─ Add transaction with status="pending":
           setTransactions([tx, ...prev])
       │
       ↓
Modal closes → New PO appears in Transactions page with "Pending" status
```

### 5.4. Approve/Cancel Purchase Order

```
Admin/Staff clicks "Approve" or "Cancel" on PO row
       │
       ├─ Approve: onUpdateTxStatus(txId, "approved")
       │    └─ setTransactions(prev.map(t => t.id === txId ? { ...t, status: "approved" } : t))
       │
       └─ Cancel: Opens <CancelPOModal>
            │
            ├─ User enters cancellation reason
            └─ Submits
            │
            ↓
            onUpdateTxStatus(txId, "cancelled", reason)
            └─ setTransactions(prev.map(t => t.id === txId ? { ...t, status: "cancelled", note: reason } : t))
       │
       ↓
Transactions state updated → TransactionsPage re-renders with new status
```

### 5.5. Process Return

```
User clicks "Return" button
       │
       ↓
setShowAddReturn(true)
       │
       ↓
<ReturnModal> renders
       │
       ├─ ProductSearchWidget: search product
       ├─ User enters quantity and reason
       └─ Submits
       │
       ↓
handleReturn(tx, productId, qty)
       │
       ├─ Add return transaction: setTransactions([tx, ...prev])
       │
       └─ Restock inventory:
           setInventory(prev.map(p => {
             if (p.id === productId) {
               const newStock = p.stock + qty;
               return { ...p, stock: newStock, status: computeStatus(newStock, p.reorder) };
             }
             return p;
           }))
       │
       ↓
Modal closes → Transactions + Inventory states updated
```

### 5.6. Add/Edit User

```
User clicks "Add User" button
       │
       ↓
setShowAddUser(true)
       │
       ↓
<UserFormModal> renders
       │
       ├─ User fills name, role, email, status
       └─ Submits
       │
       ↓
handleSaveUser(original, updated)
       │
       ├─ If new: setStaff([...prev, updated])
       └─ If edit: setStaff(prev.map(s => s.id === original.id ? updated : s))
       │
       ↓
Modal closes → Staff state updated → UsersPage re-renders
```

### 5.7. View Receipt/Invoice

```
User clicks printer icon on transaction row
       │
       ↓
setViewingInvoice(transaction)
       │
       ↓
<InvoiceModal> renders
       │
       ├─ Displays formatted receipt
       └─ User clicks "Print" → window.open() → browser print dialog
       │
       ↓
User closes modal → setViewingInvoice(null)
```

---

## 6. Data Flow — Notifications

```
┌─────────────────────┐
│ Home Component      │
│ notifs: Notification[] ← From INIT_NOTIFS
└──────────┬──────────┘
           │
           │ passes to Topbar
           ↓
┌─────────────────────┐
│ Topbar              │
│ ├─ Displays unread count badge
│ └─ On bell click → setShowNotifications(true)
└──────────┬──────────┘
           │
           │ renders
           ↓
┌─────────────────────┐
│ NotificationPanel   │
│ ├─ Lists all notifs
│ ├─ "Mark all read" → markAllRead()
│ └─ Click notif → markOneRead(id)
└─────────────────────┘
           │
           │ calls handler in Home
           ↓
setNotifs(prev => prev.map(n => ({ ...n, read: true })))
           │
           ↓
Notification state updated → Unread badge updates
```

---

## 7. Data Flow — Stock Status Computation

Stock status is **derived dynamically** whenever inventory changes:

```
Function: computeStatus(stock: number, reorder: number): StockStatus

Logic:
├─ stock < reorder * 0.4     → "critical"  (red)
├─ stock < reorder           → "low"       (orange)
├─ stock < reorder * 1.5     → "moderate"  (yellow)
└─ else                      → "good"      (green)

Called:
├─ On initial load: INIT_INVENTORY already has precomputed status
├─ On sale: newStock computed → computeStatus(newStock, reorder)
├─ On return: newStock computed → computeStatus(newStock, reorder)
└─ On product add/edit: status computed in ProductFormModal before save
```

---

## 8. Role-Based Access Control

```
User logs in → AuthUser.role: "admin" | "staff"
       │
       ↓
Home receives user prop
       │
       ├─ navItems filtered by role:
       │    ├─ Admin: all 7 pages (dashboard, inventory, transactions, analytics, stock-alerts, reports, users)
       │    └─ Staff: 5 pages (dashboard, inventory, transactions, stock-alerts, reports)
       │
       ├─ Page render guards:
       │    ├─ AnalyticsPage: only renders if user.role === "admin"
       │    └─ UsersPage: only renders if user.role === "admin"
       │
       └─ TransactionsPage action visibility:
            ├─ isStaff = user.role === "staff"
            ├─ New Sale / PO / Return buttons: only shown if isStaff
            └─ Approve/Cancel PO: canManagePO = isStaff (note: quirk - staff can approve, not admin)
```

---

## 9. Search & Filter Flow

### 9.1. Inventory Search

```
InventoryPage
       │
       ├─ search: string ← user types in search input
       ├─ statusFilter: "all" | "critical" | "low" | "moderate" | "good"
       │
       └─ useMemo(() => inventory.filter(item => {
              const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
                                    item.category.toLowerCase().includes(search.toLowerCase());
              const matchesFilter = statusFilter === "all" || item.status === statusFilter;
              return matchesSearch && matchesFilter;
            }), [search, statusFilter, inventory])
       │
       ↓
Filtered results → Rendered in table
```

### 9.2. Product Search Widget (Transactions)

```
ProductSearchWidget
       │
       ├─ mode: "name" | "id" ← user toggles search mode
       ├─ query: string ← user types
       │
       └─ useMemo(() => {
              if (!query.trim()) return [];
              const q = query.toLowerCase();
              return inventory.filter(p =>
                mode === "name"
                  ? p.name.toLowerCase().includes(q)
                  : p.id.toLowerCase().includes(q)
              ).slice(0, 8);  // limit to 8 results
            }, [query, mode, inventory])
       │
       ↓
Filtered products → Dropdown list → User clicks → selectedProduct set
```

### 9.3. Transactions Filter

```
TransactionsPage
       │
       ├─ typeFilter: "all" | "sale" | "purchase" | "return"
       │
       └─ useMemo(() => {
              if (typeFilter === "all") return transactions;
              return transactions.filter(t => t.type === typeFilter);
            }, [typeFilter, transactions])
       │
       ↓
Filtered transactions → Rendered in table
```

---

## 10. Charts & Analytics Data Flow

All chart data is **static** and imported from `data.ts`:

```
Dashboard:
  ├─ Revenue & Profit Chart
  │    └─ uses revenueData (7-day array)
  │         └─ <SvgAreaChart data={revenueData} lines={[...]} />
  │
  └─ Top Selling Products Chart
       └─ uses hardcoded topProducts array
            └─ <SvgBarChart data={topProducts} />

AnalyticsPage:
  ├─ Supply vs. Demand Chart
  │    └─ uses demandSupply (6-month array)
  │         └─ <SvgAreaChart data={demandSupply} lines={[...]} />
  │
  └─ Sales by Category Pie Chart
       └─ uses categoryData + PIE_COLORS
            └─ <PieChart> from Recharts library
```

**Note:** Chart data is **not reactive** to user actions — it's purely for demonstration.

---

## 11. Print & Export Flow

```
TransactionsPage / ReportsPage:
       │
       └─ User clicks "Print" button
            │
            ↓
       window.print()
            │
            ↓
       Browser print dialog opens
            │
            └─ Prints current page content

InvoiceModal:
       │
       ├─ Generates HTML receipt string
       └─ User clicks "Print"
            │
            ↓
       const win = window.open("", "_blank", "width=400,height=600")
       win.document.write(receiptHtml)
       win.print()
            │
            └─ Opens new window with receipt → browser print dialog
```

**Note:** No actual file export (CSV, PDF) — only browser print functionality.

---

## 12. Dark Mode Flow

```
Home Component:
       │
       ├─ darkMode: boolean ← default false
       │
       └─ <div className={darkMode ? "dark" : ""}> ← root wrapper
            │
            └─ Tailwind CSS applies dark: variant styles
                 ├─ bg-background → light or dark background
                 ├─ text-foreground → light or dark text
                 └─ border-border → light or dark borders

Settings Panel:
       │
       └─ User toggles dark mode switch
            │
            ↓
       setDarkMode(v => !v)
            │
            ↓
       Root div className updates → All child components re-render with dark theme
```

---

## 13. Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────────────┘

                                  main.tsx
                                     │
                                     ↓
                                 Login.tsx
                           (Auth gate + routing)
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ↓                                 ↓
              LoginPage                            Home
           (validates creds)                  (state manager)
                    │                                 │
                    │                  ┌──────────────┼──────────────┐
                    │                  │              │              │
                    │                  ↓              ↓              ↓
                    │              Sidebar        Topbar         Main
                    │            (navigation)   (search,         (page
                    │                           notifs)        renderer)
                    │                                              │
                    │                  ┌───────────────────────────┤
                    │                  │                           │
                    ↓                  ↓                           ↓
             data.ts ◄───────── Page Components           Modals (overlays)
          (all types,           ├─ Dashboard             ├─ ProductFormModal
           mock data,           ├─ InventoryPage         ├─ NewSaleModal
           constants)           ├─ TransactionsPage      ├─ PurchaseOrderModal
                                ├─ AnalyticsPage         ├─ ReturnModal
                                ├─ StockAlertsPage       ├─ CancelPOModal
                                ├─ ReportsPage           ├─ InvoiceModal
                                └─ UsersPage             └─ UserFormModal
                                        │                         │
                                        └─────────┬───────────────┘
                                                  │
                                                  ↓
                                        User Actions (events)
                                                  │
                                    ┌─────────────┼─────────────┐
                                    │             │             │
                                    ↓             ↓             ↓
                              Add/Edit       Create TX     Approve/Cancel
                               Product      (Sale/PO/      PO, Print
                                            Return)        Receipt
                                    │             │             │
                                    └─────────────┼─────────────┘
                                                  │
                                                  ↓
                                        Home.setState(...)
                                                  │
                                                  ↓
                                        Re-render affected
                                        components with
                                        updated data
                                                  │
                                                  ↓
                                        UI reflects changes
```

---

## 14. Key Observations

1. **No Backend**: Entirely client-side, no API calls, no persistence (refresh = reset)
2. **No Router**: Page navigation via state variable (`page: Page`)
3. **No State Library**: Pure React `useState` in root `Home` component
4. **No Context API**: Props drilling from `Home` to all pages
5. **Inline Components**: All pages + modals defined in single `home.tsx` file (~2,083 lines)
6. **Mock Data**: Everything initialized from `data.ts` constants
7. **No Validation**: Form validation is basic HTML5 `required` attributes
8. **No Persistence**: All changes lost on refresh
9. **Static Charts**: Chart data doesn't update based on user actions
10. **Role-Based UI**: Navigation and actions filtered by `user.role`

---

## 15. Future Backend Integration Points

If you were to add a backend, here's where you'd hook in:

| Feature | Current (Mock) | Backend Integration Point |
|---------|----------------|---------------------------|
| Authentication | `CREDENTIALS` map in data.ts | POST `/api/auth/login` → JWT token |
| Fetch Inventory | `INIT_INVENTORY` array | GET `/api/inventory` |
| Add/Edit Product | `setInventory(...)` | POST/PUT `/api/inventory` |
| Create Transaction | `setTransactions(...)` | POST `/api/transactions` |
| Update Stock | Local array mutation | PATCH `/api/inventory/:id/stock` |
| Fetch Staff | `INIT_STAFF` array | GET `/api/staff` |
| Add/Edit User | `setStaff(...)` | POST/PUT `/api/staff` |
| Notifications | `INIT_NOTIFS` array | GET `/api/notifications` (SSE or polling) |
| Reports | Local computations | GET `/api/reports/:type` |

---

## 16. Summary

**SmartTrack** is a fully functional **frontend prototype** demonstrating:
- Role-based pharmacy management (admin + staff)
- Inventory tracking with stock status computation
- Sales, purchase orders, and returns processing
- Notification system
- Analytics dashboard with charts
- Dark mode support
- Print receipts/reports

All data lives in React state, initialized from `data.ts`, with no persistence layer. Perfect for demos, prototypes, or offline use cases.
