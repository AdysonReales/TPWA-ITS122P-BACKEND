# ✈️ LakBye: Travel Planner Web Application — Backend API
**Course:** ITS122P - Web-Based Smart Service Management System  
**Section:** AM2 | Group 2  
**Date:** September 4, 2026  
**Status:** Phase 2 (Database & Backend Architecture) — Active Sprint  

---

## 📌 Project Overview
**LakBye** (*"Saan aabot ang Lakbye mo?"*) is a centralized travel planning web platform designed to streamline trip coordination, multi-destination itinerary scheduling, live expense tracking, and activity bookings across three distinct user roles: **Customer**, **Staff**, and **Administrator**.

This repository hosts the decoupled Node.js/Express.js RESTful API engine responsible for business logic, database queries, authentication, and role-based access control (RBAC).

---

## 👥 Team Group 2 & Responsibilities
* **Adyson M. Reales** — Project Manager / System Analyst
* **Jose Andres B. Pagcu** — Backend Developer
* **Vincent Joseph A. Villanueva** — Database / API Developer
* **Edmund Jacob B. Borja** — Frontend Developer
* **Marla Rue P. Canlas** — QA / Security / UI / Documentation

---

## 🛠️ Technology Stack
* **Runtime:** Node.js (v18+)
* **Framework:** Express.js
* **Database:** PostgreSQL (Cloud instance via Supabase)
* **Authentication & Security:** JSON Web Tokens (JWT), `bcrypt` password hashing, parameterized SQL queries
* **Hosting & Deployment:** Render (Continuous Deployment via `main` branch)
* **Cross-Origin Handling:** `cors` middleware

---

## ⚙️ Environment Variables Setup

Copy `.env.example` to `.env` and fill in the values:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres
JWT_SECRET=your_super_secret_jwt_key_here
FRONTEND_URL=http://localhost:5173
```

`DATABASE_URL` comes from **Supabase > Project Settings > Database > Connection string (URI)**.
Use the pooled ("Transaction" or "Session") connection string, not the direct one, when deploying to Render.

---

## 🗄️ Database Setup (Supabase)

1. Open your Supabase project > **SQL Editor** > New Query.
2. Paste and run the contents of [`sql/schema.sql`](./sql/schema.sql). This creates all 9 tables from the project ERD:
   - `users` (roles: `admin`, `staff`, `customer`, `vendor`; supports activate/deactivate via `is_active`)
   - `trips`, `destinations` (a trip's multi-stop itinerary)
   - `vendor_profiles`, `categories`, `activities` (the bookable catalog)
   - `bookings` (Pending → Confirmed/Cancelled/Completed approval workflow)
   - `system_logs` (audit trail, written automatically by the API)
   - `notifications` (in-app alerts for booking/trip updates)
   - a seed admin account: `admin@lakbye.com` / `Admin123!` — **change this password after your first login.**
   - sample seed data (a customer, a vendor, a trip, a destination, categories, an activity, and a booking) so you have something to test against immediately.

---

## 🚀 Running Locally

```bash
npm install
cp .env.example .env   # then fill in your real values
npm run dev             # nodemon, auto-restarts on changes
# or
npm start
```

Server runs at `http://localhost:5000` by default. Health check: `GET /api/health`.

---

## 🔐 Authentication & RBAC

- Passwords are hashed with `bcrypt` (10 salt rounds) — never stored in plaintext.
- On login/register, a JWT is issued and set as an **httpOnly cookie** (`token`), and also returned in the JSON response body for frontends that prefer bearer-token auth (`Authorization: Bearer <token>`).
- `middleware/auth.js` (`authenticateToken`) verifies the token on protected routes.
- `middleware/rbac.js` (`authorizeRoles(...roles)`) restricts a route to specific roles.
- Public registration always creates a `customer` account. `admin`/`staff` accounts are created by an existing admin via `POST /api/users`.

### API Endpoints

| Method | Route              | Access               | Description                          |
|--------|--------------------|-----------------------|--------------------------------------|
| POST   | `/api/auth/register` | Public              | Create a new customer account        |
| POST   | `/api/auth/login`    | Public              | Log in, receive JWT (cookie + body)  |
| POST   | `/api/auth/logout`   | Authenticated       | Clear auth cookie                    |
| GET    | `/api/auth/me`       | Authenticated       | Get current logged-in user           |
| GET    | `/api/users`         | Admin only          | List all users                       |
| GET    | `/api/users/:id`     | Admin only          | Get one user                         |
| POST   | `/api/users`         | Admin only          | Create user with any role            |
| PUT    | `/api/users/:id`     | Admin only          | Update a user's name/role            |
| DELETE | `/api/users/:id`     | Admin only          | Delete a user                        |
| GET    | `/api/trips`         | Admin, Staff, Customer | List trips (customers see only their own) |
| GET    | `/api/trips/:id`     | Admin, Staff, Customer | Get one trip, with its destinations  |
| POST   | `/api/trips`         | Admin, Staff, Customer | Create a trip                        |
| PUT    | `/api/trips/:id`     | Admin, Staff, Customer | Update a trip (owner or staff/admin) |
| DELETE | `/api/trips/:id`     | Admin, Staff, Customer | Delete a trip (owner or staff/admin) |
| GET    | `/api/destinations?trip_id=` | Admin, Staff, Customer | List a trip's destinations   |
| POST   | `/api/destinations`  | Admin, Staff, Customer | Add a destination to a trip          |
| PUT    | `/api/destinations/:id` | Admin, Staff, Customer | Update a destination              |
| DELETE | `/api/destinations/:id` | Admin, Staff, Customer | Remove a destination              |
| GET    | `/api/categories`    | Authenticated        | Browse the activity category catalog |
| POST   | `/api/categories`    | Admin, Staff          | Add a category                       |
| PUT    | `/api/categories/:id` | Admin, Staff         | Update a category                    |
| DELETE | `/api/categories/:id` | Admin, Staff         | Delete a category                    |
| GET    | `/api/vendors`       | Admin, Staff, Vendor  | List vendor profiles (vendor sees only their own) |
| POST   | `/api/vendors`       | Admin, Staff, Vendor  | Create a vendor business profile     |
| PUT    | `/api/vendors/:id`   | Admin, Staff, Vendor  | Update a vendor profile              |
| DELETE | `/api/vendors/:id`   | Admin only            | Delete a vendor profile              |
| GET    | `/api/activities`    | Authenticated         | Browse bookable activities (filter by `?destination_id=`, `?category_id=`, `?vendor_id=`) |
| POST   | `/api/activities`    | Admin, Staff, Vendor  | Create an activity                   |
| PUT    | `/api/activities/:id` | Admin, Staff, Vendor (own) | Update an activity              |
| DELETE | `/api/activities/:id` | Admin, Staff, Vendor (own) | Delete an activity              |
| GET    | `/api/bookings?status=` | Admin, Staff, Customer, Vendor | List relevant bookings (customer: own, vendor: theirs, staff/admin: all) |
| POST   | `/api/bookings`      | Customer              | Submit a booking request (starts as `pending`) |
| PUT    | `/api/bookings/:id`  | Admin, Staff          | Confirm, reject, or complete a booking |
| GET    | `/api/notifications` | Authenticated         | Get the logged-in user's notifications |
| PUT    | `/api/notifications/:id/read` | Authenticated | Mark one notification as read       |
| PUT    | `/api/notifications/read-all` | Authenticated | Mark all notifications as read      |
| GET    | `/api/logs?user_id=` | Admin only            | View the system audit trail          |

### Example: Register

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Juan Dela Cruz","email":"juan@example.com","password":"Password123"}'
```

### Example: Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@example.com","password":"Password123"}' \
  -c cookies.txt
```

