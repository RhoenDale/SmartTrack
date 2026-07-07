# Requirements Document

## Introduction

SmartTrack currently allows all authenticated users to perform any action in the Transactions module regardless of their role. This feature introduces role-based access control (RBAC) for the Transactions module so that **Staff** users retain full transactional capabilities (create, initiate, and manage transactions) while **Admin** users are restricted to read-only visibility, receipt printing, and reporting — but cannot create new transactions or approve/cancel Purchase Orders.

The two roles in scope are:

- **Admin** — the pharmacy owner (e.g., Paterno Amamio Jr.). Monitors and reviews all transaction activity but does not initiate or approve individual transactions.
- **Staff** — pharmacists and pharmacy personnel (e.g., Maria Santos). Perform day-to-day transaction work including sales, purchase orders, and returns.

## Glossary

- **Admin**: A user whose `AuthUser.role` equals `"admin"`. Identified in the UI by the "Admin Access" label.
- **Staff**: A user whose `AuthUser.role` equals `"staff"`. Represents pharmacists and pharmacy personnel.
- **Transaction_Module**: The Transactions page of SmartTrack, accessible via the sidebar navigation.
- **Action_Buttons**: The top-right button group on the Transactions page containing "New Sale", "Purchase Order", and "Return" buttons.
- **PO_Actions**: The "Approve" and "Cancel" buttons rendered in the Actions column of the transaction list for Purchase Orders with `pending` or `approved` status.
- **Receipt_Button**: The printer icon button in the Actions column that opens the Invoice/Receipt modal for any transaction.
- **Permission_Guard**: The UI-level logic that evaluates the current user's role and conditionally renders or hides UI controls.
- **Purchase_Order (PO)**: A transaction of type `"purchase"` that starts in `"pending"` status and must be approved to be fulfilled.

---

## Requirements

### Requirement 1: Staff Can Create New Transactions

**User Story:** As a Staff user, I want to create new sales, purchase orders, and returns from the Transactions page, so that I can carry out day-to-day pharmacy operations.

#### Acceptance Criteria

1. WHILE the authenticated user has the `"staff"` role, THE Transaction_Module SHALL display the "New Sale", "Purchase Order", and "Return" Action_Buttons in the top-right of the page header.
2. WHEN a Staff user clicks "New Sale" and submits the form, THE Transaction_Module SHALL close the New Sale modal and display the new sale transaction in the transaction list with `"completed"` status.
3. WHEN a Staff user clicks "Purchase Order" and submits the form, THE Transaction_Module SHALL close the Purchase Order modal and display the new purchase order in the transaction list with `"pending"` status.
4. WHEN a Staff user clicks "Return" and submits the form, THE Transaction_Module SHALL close the Return modal and display the new return transaction in the transaction list with `"completed"` status.
5. WHEN a Staff user submits a transaction form and the submission fails, THE Transaction_Module SHALL keep the modal open, preserve all entered field values, and display an inline error message describing the failure.
6. WHEN a Staff user clicks the dismiss or cancel control within any transaction creation modal, THE Transaction_Module SHALL close the modal without creating a transaction and without altering the transaction list.

---

### Requirement 2: Admin Cannot Create New Transactions

**User Story:** As an Admin user, I want the transaction creation buttons to be hidden, so that I do not accidentally initiate transactions that should be handled by staff.

#### Acceptance Criteria

1. WHILE the authenticated user has the `"admin"` role, THE Permission_Guard SHALL not render the "New Sale" Action_Button in the Transactions page header.
2. WHILE the authenticated user has the `"admin"` role, THE Permission_Guard SHALL not render the "Purchase Order" Action_Button in the Transactions page header.
3. WHILE the authenticated user has the `"admin"` role, THE Permission_Guard SHALL not render the "Return" Action_Button in the Transactions page header.
4. WHILE the authenticated user has the `"admin"` role, THE Transaction_Module SHALL render the page header displaying the "Transactions" heading and the "Sales, purchase orders & returns" description, with no Action_Buttons present.

---

### Requirement 3: Admin Cannot Approve or Cancel Purchase Orders

**User Story:** As an Admin user, I want the Approve and Cancel buttons for Purchase Orders to be hidden, so that PO management actions are reserved for staff.

#### Acceptance Criteria

1. WHILE the authenticated user has the `"admin"` role, THE Permission_Guard SHALL hide the "Approve" button for all Purchase Orders with `"pending"` status in the transaction list.
2. WHILE the authenticated user has the `"admin"` role, THE Permission_Guard SHALL hide the "Cancel" button for all Purchase Orders with `"pending"` or `"approved"` status in the transaction list.
3. WHILE the authenticated user has the `"staff"` role, THE Transaction_Module SHALL display the "Approve" button for Purchase Orders with `"pending"` status in the Actions column.
4. WHILE the authenticated user has the `"staff"` role, THE Transaction_Module SHALL display the "Cancel" button for Purchase Orders with `"pending"` or `"approved"` status in the Actions column.
5. WHEN a Staff user clicks "Approve" on a pending Purchase Order and the approval succeeds, THE Transaction_Module SHALL update the Purchase Order status to `"approved"` in the transaction list and remove the "Approve" button from that row without requiring additional confirmation.
6. WHEN a Staff user clicks "Cancel" on a Purchase Order, THE Transaction_Module SHALL open the Cancel PO modal with a required cancellation reason field (1–500 characters); upon confirmation, THE Transaction_Module SHALL update the Purchase Order status to `"cancelled"` and re-render the row without the "Cancel" button.
7. IF a Staff user's Approve or Cancel action fails due to a system error, THEN THE Transaction_Module SHALL preserve the Purchase Order's current status, close any open confirmation modal without saving, and display an error message to the user.

---

### Requirement 4: All Users Can View and Print Receipts

**User Story:** As any authenticated user, I want to view and print receipts for any transaction, so that I can access transaction records for reference or audit purposes.

#### Acceptance Criteria

1. THE Transaction_Module SHALL display the Receipt_Button (printer icon) in the Actions column for every transaction row, regardless of the current user's role.
2. WHEN any user clicks the Receipt_Button for a transaction, THE Transaction_Module SHALL open the Invoice/Receipt modal displaying at minimum: Transaction ID, product name, quantity, unit price, total amount, staff member name, transaction date and time, transaction type, and transaction status.
3. WHEN the Invoice/Receipt modal is open, THE Transaction_Module SHALL display an enabled "Print" button that triggers the browser print dialog for the receipt.
4. WHEN the Invoice/Receipt modal is closed, THE Transaction_Module SHALL ensure the "Print" button is no longer accessible or interactive.
5. WHILE the authenticated user has the `"admin"` role, THE Transaction_Module SHALL ensure the Receipt_Button is the only interactive control rendered in the Actions column for transactions of type `"sale"` or `"return"` (i.e., non-Purchase_Order transactions as defined in the Glossary).
6. IF the Invoice/Receipt modal fails to load transaction data, THEN THE Transaction_Module SHALL display an error message within the modal and disable the "Print" button.

---

### Requirement 5: Role Restrictions Are Enforced at the UI Layer Consistently

**User Story:** As a system, I want role checks to be evaluated from the authenticated user's session at render time, so that UI permissions are always consistent with the logged-in user's role.

#### Acceptance Criteria

1. THE Permission_Guard SHALL derive the user's role exclusively from the `AuthUser.role` property passed as a prop to the Transaction_Module.
2. WHEN the authenticated user's role is `"admin"`, THE Permission_Guard SHALL produce a rendered state where Action_Buttons are absent and PO_Actions are absent, as defined in Requirements 2 and 3.
3. WHEN the authenticated user's role is `"staff"`, THE Permission_Guard SHALL produce a rendered state where Action_Buttons are present and PO_Actions are present for applicable PO statuses, as defined in Requirements 1 and 3.
4. IF an unrecognized role value is passed to the Permission_Guard, THEN THE Permission_Guard SHALL default to the most restrictive access level, hiding Action_Buttons and PO_Actions while keeping the Receipt_Button visible.
5. THE Transaction_Module SHALL apply role-based visibility on initial render without requiring a page reload.
6. WHEN the `AuthUser.role` prop value changes, THE Transaction_Module SHALL re-apply the appropriate permission set to the rendered controls without requiring a page reload or navigation event.
