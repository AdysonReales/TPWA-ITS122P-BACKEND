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
2. Paste and run the contents of [`sql/schema.sql`](./sql/schema.sql). This creates:
   - a `user_role` enum (`admin`, `staff`, `customer`)
   - the `users` table (with hashed passwords)
   - the `trips` table (sample CRUD resource)
   - a seed admin account: `admin@lakbye.com` / `Admin123!` — **change this password after your first login.**

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
| GET    | `/api/trips/:id`     | Admin, Staff, Customer | Get one trip (owner or staff/admin)  |
| POST   | `/api/trips`         | Admin, Staff, Customer | Create a trip                        |
| PUT    | `/api/trips/:id`     | Admin, Staff, Customer | Update a trip (owner or staff/admin) |
| DELETE | `/api/trips/:id`     | Admin, Staff, Customer | Delete a trip (owner or staff/admin) |

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

