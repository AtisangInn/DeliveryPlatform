
# Production Upgrade Plan: Delivery Platform

This roadmap outlines the transition from the current "Simulation" state to a production-ready system.

## Phase 1: Security & Architecture Hardening (Current Priority)
*   **BCrypt Password Hashing:** Replace SHA256 hashing in `AuthController` with BCrypt for salted, secure password storage.
*   **Service Layer Pattern:** Refactor `Controllers` to delegate business logic to a `Services` layer (e.g., `OrderService`, `AuthService`).
*   **Price Validation:** Implement server-side checks to ensure `TotalAmount` on orders matches the current prices of items in the database.

## Phase 2: Data Integrity & State Management
*   **Order State Machine:** Enforce valid state transitions (e.g., `Paid` -> `Preparing` -> `OutForDelivery` -> `Delivered`).
*   **Transactional Updates:** Ensure all multi-table updates (Order + Payment) are wrapped in database transactions.

## Phase 3: Observability & Reliability
*   **Structured Logging:** Integrate Serilog for consistent logging to files/console.
*   **Global Exception Handling:** Add middleware to catch and log all unhandled exceptions, returning clean JSON errors to the frontend.

## Phase 4: Production Payments
*   **PayFast ITN Verification:** Implement signature validation and ITN server-to-server confirmation.
*   **Environment Config:** Securely manage API keys and secrets using Environment Variables.
