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

Create a `.env` file in the root directory and configure the following variables:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres
JWT_SECRET=your_super_secret_jwt_key_here


