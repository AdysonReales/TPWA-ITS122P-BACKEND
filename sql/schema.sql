-- LakBye Travel Planner — Database Schema
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New Query)

-- 1. Role enum: Admin, Staff, Customer
CREATE TYPE user_role AS ENUM ('admin', 'staff', 'customer');

-- 2. Users table
CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    full_name      VARCHAR(150) NOT NULL,
    email          VARCHAR(150) UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    role           user_role NOT NULL DEFAULT 'customer',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Trips table (sample CRUD resource for the travel planner)
CREATE TABLE IF NOT EXISTS trips (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          VARCHAR(150) NOT NULL,
    destination    VARCHAR(150) NOT NULL,
    start_date     DATE NOT NULL,
    end_date       DATE NOT NULL,
    budget         NUMERIC(10, 2) DEFAULT 0,
    status         VARCHAR(50) NOT NULL DEFAULT 'planned',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Auto-update "updated_at" on row changes
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_trips_updated_at
BEFORE UPDATE ON trips
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. Seed one admin account for initial testing
--    Password below is a bcrypt hash for: Admin123!
--    (Generated with bcrypt, 10 salt rounds — change this after first login)
INSERT INTO users (full_name, email, password_hash, role)
VALUES (
    'System Admin',
    'admin@lakbye.com',
    '$2b$10$ULCvvFw6UCE0op.fJMqT9.P7dOA7xJS66LpU4kYDMtrGfZ7YXZfxa',
    'admin'
)
ON CONFLICT (email) DO NOTHING;
