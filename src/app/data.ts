export type UserRole = "admin" | "staff";
export type Page = "dashboard" | "inventory" | "transactions" | "analytics" | "users" | "stock-alerts" | "reports";
export type StockStatus = "good" | "moderate" | "low" | "critical";
export type TxStatus = "completed" | "pending" | "approved" | "cancelled";
export type TxType = "sale" | "purchase" | "return";

export interface AuthUser {
  name: string;
  role: UserRole;
  initials: string;
  position: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  stock: number;
  reorder: number;
  price: number;
  salePrice?: number;
  expiry: string;
  status: StockStatus;
}

export interface Transaction {
  id: string;
  type: TxType;
  product: string;
  qty: number;
  amount: number;
  staff: string;
  date: string;
  status: TxStatus;
  productId?: string;
  note?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  email: string;
  status: "active" | "inactive";
  lastLogin: string;
  initials: string;
}

export interface Notification {
  id: number;
  type: "alert" | "order" | "info";
  title: string;
  body: string;
  time: string;
  read: boolean;
}

export const CREDENTIALS: Record<string, { password: string; user: AuthUser }> = {
  "admin@tangub.ph": { password: "admin123", user: { name: "Paterno Amamio Jr.", role: "admin", initials: "RG", position: "Owner / Admin" } },
  "staff@tangub.ph": { password: "staff123", user: { name: "Maria Santos", role: "staff", initials: "MS", position: "Pharmacist" } },
};

export const INIT_INVENTORY: Product[] = [
  { id: "P001", name: "Amoxicillin 500mg", category: "Antibiotic", stock: 284, reorder: 50, price: 8.50, salePrice: 6.00, expiry: "Aug 2026", status: "good" },
  { id: "P002", name: "Paracetamol 500mg", category: "Analgesic", stock: 1240, reorder: 200, price: 2.50, expiry: "Mar 2027", status: "good" },
  { id: "P003", name: "Metformin 500mg", category: "Antidiabetic", stock: 38, reorder: 100, price: 4.20, expiry: "Nov 2026", status: "low" },
  { id: "P004", name: "Amlodipine 5mg", category: "Antihypertensive", stock: 156, reorder: 80, price: 6.75, expiry: "Jan 2027", status: "good" },
  { id: "P005", name: "Cetirizine 10mg", category: "Antihistamine", stock: 22, reorder: 60, price: 5.00, expiry: "Sep 2026", status: "low" },
  { id: "P006", name: "Omeprazole 20mg", category: "Antacid", stock: 203, reorder: 100, price: 9.80, expiry: "Dec 2026", status: "good" },
  { id: "P007", name: "Losartan 50mg", category: "Antihypertensive", stock: 89, reorder: 80, price: 11.20, expiry: "Apr 2027", status: "moderate" },
  { id: "P008", name: "Ibuprofen 400mg", category: "NSAID", stock: 445, reorder: 150, price: 7.30, expiry: "Feb 2027", status: "good" },
  { id: "P009", name: "Salbutamol Inhaler", category: "Bronchodilator", stock: 14, reorder: 30, price: 210.00, expiry: "Dec 2025", status: "critical" },
  { id: "P010", name: "Vitamin C 500mg", category: "Supplement", stock: 892, reorder: 200, price: 3.20, expiry: "Jun 2027", status: "good" },
];

export const INIT_TRANSACTIONS: Transaction[] = [
  { id: "TXN-1201", type: "sale", product: "Amoxicillin 500mg", qty: 10, amount: 85.00, staff: "M. Santos", date: "06/25 09:14", status: "completed", productId: "P001" },
  { id: "TXN-1202", type: "sale", product: "Paracetamol 500mg", qty: 20, amount: 50.00, staff: "J. Dela Cruz", date: "06/25 09:32", status: "completed", productId: "P002" },
  { id: "PO-0084", type: "purchase", product: "Metformin 500mg", qty: 500, amount: 2100.00, staff: "Dr. Garcia", date: "06/25 10:00", status: "pending", productId: "P003" },
  { id: "TXN-1203", type: "sale", product: "Omeprazole 20mg", qty: 14, amount: 137.20, staff: "M. Santos", date: "06/25 10:45", status: "completed", productId: "P006" },
  { id: "TXN-1204", type: "sale", product: "Vitamin C 500mg", qty: 30, amount: 96.00, staff: "A. Reyes", date: "06/25 11:12", status: "completed", productId: "P010" },
  { id: "PO-0085", type: "purchase", product: "Cetirizine 10mg", qty: 200, amount: 1000.00, staff: "Dr. Garcia", date: "06/25 11:30", status: "approved", productId: "P005" },
  { id: "TXN-1205", type: "sale", product: "Amlodipine 5mg", qty: 28, amount: 189.00, staff: "J. Dela Cruz", date: "06/25 12:05", status: "completed", productId: "P004" },
  { id: "TXN-1206", type: "sale", product: "Losartan 50mg", qty: 30, amount: 336.00, staff: "M. Santos", date: "06/25 13:20", status: "completed", productId: "P007" },
];

export const INIT_STAFF: StaffMember[] = [
  { id: "U001", name: "Paterno Amamio Jr.", role: "Admin / Owner", email: "admin@tangub.ph", status: "active", lastLogin: "Jun 25, 09:00", initials: "RG" },
  { id: "U002", name: "Maria Santos", role: "Pharmacist", email: "staff@tangub.ph", status: "active", lastLogin: "Jun 25, 08:45", initials: "MS" },
  { id: "U003", name: "Juan Dela Cruz", role: "Pharmacist", email: "j.delacruz@tangub.ph", status: "active", lastLogin: "Jun 24, 17:30", initials: "JD" },
  { id: "U004", name: "Ana Reyes", role: "Staff", email: "a.reyes@tangub.ph", status: "active", lastLogin: "Jun 25, 09:15", initials: "AR" },
  { id: "U005", name: "Carlos Mendoza", role: "Staff", email: "c.mendoza@tangub.ph", status: "inactive", lastLogin: "Jun 20, 14:00", initials: "CM" },
];

export const INIT_NOTIFS: Notification[] = [
  { id: 1, type: "alert", title: "Critical: Salbutamol Inhaler", body: "Only 14 units remaining - urgent reorder needed", time: "5 min ago", read: false },
  { id: 2, type: "alert", title: "Low Stock: Metformin 500mg", body: "38 units remaining, reorder level is 100", time: "12 min ago", read: false },
  { id: 3, type: "order", title: "Purchase Order PO-0084 Pending", body: "Awaiting admin approval for Metformin 500mg", time: "1 hr ago", read: false },
  { id: 4, type: "alert", title: "Low Stock: Cetirizine 10mg", body: "22 units remaining, reorder level is 60", time: "2 hr ago", read: true },
  { id: 5, type: "info", title: "System: Inventory synced", body: "All stock levels updated successfully", time: "3 hr ago", read: true },
];

export const INIT_CATEGORIES = ["Antibiotic", "Analgesic", "Antidiabetic", "Antihypertensive", "Antihistamine", "Antacid", "NSAID", "Bronchodilator", "Supplement"];
export const ROLES = ["Admin / Owner", "Pharmacist", "Staff"];

export const revenueData = [
  { day: "Mon", revenue: 12400, profit: 8200 }, { day: "Tue", revenue: 15800, profit: 10700 },
  { day: "Wed", revenue: 11200, profit: 7300 }, { day: "Thu", revenue: 18900, profit: 12700 },
  { day: "Fri", revenue: 22100, profit: 14700 }, { day: "Sat", revenue: 28400, profit: 19500 },
  { day: "Sun", revenue: 19600, profit: 13500 },
];

export const demandSupply = [
  { month: "Jan", demand: 4200, supply: 4500 }, { month: "Feb", demand: 3800, supply: 4100 },
  { month: "Mar", demand: 5100, supply: 4800 }, { month: "Apr", demand: 5800, supply: 5200 },
  { month: "May", demand: 6200, supply: 6800 }, { month: "Jun", demand: 7100, supply: 7400 },
];

export const categoryData = [
  { name: "Antibiotics", value: 28 }, { name: "Analgesics", value: 22 },
  { name: "Antihypertensive", value: 18 }, { name: "Supplements", value: 15 }, { name: "Others", value: 17 },
];

export const PIE_COLORS = ["#0d9488", "#06b6d4", "#8b5cf6", "#f59e0b", "#94a3b8"];
