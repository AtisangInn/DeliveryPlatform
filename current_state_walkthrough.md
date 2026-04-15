# Current State & Testing Walkthrough

This guide explains how to test the current "Simulation" version of the Delivery Platform.

## 🛠️ Prerequisites
1.  **Backend Running:** The API must be running at `http://localhost:5000`.
2.  **Frontend Server:** The static files (**CustomerApp**, **DriverApp**, **AdminWeb**) must be served on port **5500**.
    *   **Option A (VS Code):** Use the "Live Server" extension.
    *   **Option B (Python):** Run `python -m http.server 5500` in the `DeliveryPlatform` root directory.
    *   **Option C (Node):** Run `npx http-server -p 5500`.

## 🛵 Testing Steps

### 1. Register/Login as a Customer
*   Open: `http://127.0.0.1:5500/CustomerApp/index.html`
*   Register a new account or use an existing one (if DB is seeded).
*   **Demo Account:** `customer@example.com` / `password123` (Note: Password hashing is currently SHA256).

### 2. Place an Order
*   Select a Merchant from the list.
*   Add items to your cart.
*   Click **Checkout & Pay**.
*   You will be redirected to the **PayFast Sandbox**.
*   Complete the payment in the sandbox.
*   On the "Success" page, click the **Process Order Status & Alert Drivers** button. This manually triggers the ITN hook since PayFast cannot reach your localhost directly.

### 3. Accept Order as a Driver
*   Open: `http://127.0.0.1:5500/DriverApp/index.html` in a **new tab or incognito window**.
*   Login as a Driver.
*   **Demo Account:** `driver@example.com` / `password123`.
*   You should see a "New Order Available" notification via SignalR.
*   Click **Accept Delivery**.

### 4. Real-Time Tracking
*   In the **Driver App**, go to the **Active Delivery** tab.
*   Click anywhere on the map to simulate the driver moving.
*   Switch back to the **Customer App** (Orders tab).
*   You will see the driver's icon moving on the customer's map in real-time!

### 5. Complete Delivery
*   In the **Driver App**, click **Picked Up** and then **Mark as Delivered**.
*   The Customer App will receive a SignalR notification that the order is complete.

---
**Current Limitation:** ITN notifications require a public tunnel (like Ngrok) for automated production testing. Phase 4 of the upgrade plan will address this.
