-- ============================================================
-- LakBye Travel Planner — Database Schema (PostgreSQL / Supabase)
-- Translated from the team's MySQL ERD (trip_planner_schema_8806.sql)
-- Group 2 — Users, Trips, VendorProfiles, Destinations, Categories,
--           Activities, Bookings, System_logs, Notifications
--
-- Roles: admin, staff, customer, vendor
-- Run this whole file in the Supabase SQL Editor (Project > SQL Editor > New Query)
-- ============================================================

-- Clean slate: drop in dependency order if re-running during development.
-- (Comment this block out once you have real data you don't want to lose.)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS system_logs CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS destinations CASCADE;
DROP TABLE IF EXISTS vendor_profiles CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS trip_status CASCADE;
DROP TYPE IF EXISTS booking_status CASCADE;
DROP TYPE IF EXISTS notification_type CASCADE;

-- ============================================================
-- Enums (Postgres equivalent of MySQL's inline ENUM columns)
-- ============================================================
CREATE TYPE user_role AS ENUM ('admin', 'staff', 'customer', 'vendor');
CREATE TYPE trip_status AS ENUM ('planning', 'confirmed', 'ongoing', 'completed', 'cancelled');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');
CREATE TYPE notification_type AS ENUM ('booking', 'trip', 'system', 'promo');

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    full_name      VARCHAR(100) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           user_role NOT NULL DEFAULT 'customer',
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,   -- supports admin activate/deactivate
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. TRIPS  (User plans Trip)
-- ============================================================
CREATE TABLE trips (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          VARCHAR(150) NOT NULL,
    start_date     DATE NOT NULL,
    end_date       DATE NOT NULL,
    total_budget   DECIMAL(10, 2) DEFAULT 0.00,
    status         trip_status NOT NULL DEFAULT 'planning',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. VENDOR_PROFILES  (User manages VendorProfile)
-- ============================================================
CREATE TABLE vendor_profiles (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_name  VARCHAR(150) NOT NULL,
    service_type   VARCHAR(100) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. DESTINATIONS  (Trip visits Destination)
-- ============================================================
CREATE TABLE destinations (
    id             SERIAL PRIMARY KEY,
    trip_id        INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    location_name  VARCHAR(150) NOT NULL,
    latitude       DECIMAL(10, 7),
    longitude      DECIMAL(10, 7),
    order_sequence INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- 5. CATEGORIES  (Category categorizes Activity)
-- ============================================================
CREATE TABLE categories (
    id     SERIAL PRIMARY KEY,
    name   VARCHAR(100) NOT NULL,
    type   VARCHAR(50) NOT NULL
);

-- ============================================================
-- 6. ACTIVITIES  (Destination hosts / VendorProfile offers Activity)
-- ============================================================
CREATE TABLE activities (
    id             SERIAL PRIMARY KEY,
    destination_id INTEGER NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
    category_id    INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    vendor_id      INTEGER NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
    title          VARCHAR(150) NOT NULL,
    start_time     TIMESTAMPTZ NOT NULL,
    end_time       TIMESTAMPTZ NOT NULL,
    cost           DECIMAL(10, 2) DEFAULT 0.00
);

-- ============================================================
-- 7. BOOKINGS  (User submits Booking / Activity receives Booking)
-- ============================================================
CREATE TABLE bookings (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id    INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    status         booking_status NOT NULL DEFAULT 'pending',
    submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. SYSTEM_LOGS  (tracks user/system actions for auditing)
-- ============================================================
CREATE TABLE system_logs (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type    VARCHAR(100) NOT NULL,     -- e.g. 'CREATE_BOOKING', 'LOGIN', 'UPDATE_TRIP'
    table_affected VARCHAR(100),               -- e.g. 'bookings', 'trips'
    record_id      INTEGER,                    -- id of the affected row
    description    VARCHAR(255),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. NOTIFICATIONS  (alerts sent to users about their activity)
-- ============================================================
CREATE TABLE notifications (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          VARCHAR(150) NOT NULL,
    message        VARCHAR(255) NOT NULL,
    type           notification_type NOT NULL DEFAULT 'system',
    is_read        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Auto-update "updated_at" on trips (mirrors the old schema's behavior)
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trips_updated_at
BEFORE UPDATE ON trips
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Helpful indexes
-- ============================================================
CREATE INDEX idx_trips_user ON trips(user_id);
CREATE INDEX idx_vendor_profiles_user ON vendor_profiles(user_id);
CREATE INDEX idx_destinations_trip ON destinations(trip_id);
CREATE INDEX idx_activities_destination ON activities(destination_id);
CREATE INDEX idx_activities_category ON activities(category_id);
CREATE INDEX idx_activities_vendor ON activities(vendor_id);
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_activity ON bookings(activity_id);
CREATE INDEX idx_logs_user ON system_logs(user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);

-- ============================================================
-- Seed admin account
--   Password hash below is bcrypt for: Admin123!
--   Change this password after your first login.
-- ============================================================
INSERT INTO users (full_name, email, password_hash, role)
VALUES (
    'System Admin',
    'admin@lakbye.com',
    '$2b$10$ULCvvFw6UCE0op.fJMqT9.P7dOA7xJS66LpU4kYDMtrGfZ7YXZfxa',
    'admin'
);

-- ============================================================
-- SAMPLE DATA (optional — for testing the full flow end to end)
-- ============================================================
INSERT INTO users (full_name, email, password_hash, role) VALUES
-- password hash below is bcrypt for: Password123
('Juan Dela Cruz', 'juan@example.com', '$2b$10$ULCvvFw6UCE0op.fJMqT9.P7dOA7xJS66LpU4kYDMtrGfZ7YXZfxa', 'customer'),
('Maria Santos', 'maria@example.com', '$2b$10$ULCvvFw6UCE0op.fJMqT9.P7dOA7xJS66LpU4kYDMtrGfZ7YXZfxa', 'vendor');

INSERT INTO trips (user_id, title, start_date, end_date, total_budget, status) VALUES
(2, 'Palawan Getaway', '2026-10-10', '2026-10-15', 15000.00, 'planning');

INSERT INTO vendor_profiles (user_id, business_name, service_type) VALUES
(3, 'Santos Island Tours', 'Tour Operator');

INSERT INTO destinations (trip_id, location_name, latitude, longitude, order_sequence) VALUES
(1, 'El Nido, Palawan', 11.1949000, 119.4079000, 1);

INSERT INTO categories (name, type) VALUES
('Island Hopping', 'Outdoor'),
('Food Tour', 'Culinary');

INSERT INTO activities (destination_id, category_id, vendor_id, title, start_time, end_time, cost) VALUES
(1, 1, 1, 'El Nido Island Hopping Tour A', '2026-10-11 08:00:00+08', '2026-10-11 16:00:00+08', 1500.00);

INSERT INTO bookings (user_id, activity_id, status) VALUES
(2, 1, 'confirmed');

INSERT INTO system_logs (user_id, action_type, table_affected, record_id, description) VALUES
(2, 'CREATE_BOOKING', 'bookings', 1, 'User booked Island Hopping Tour A');

INSERT INTO notifications (user_id, title, message, type) VALUES
(2, 'Booking Confirmed', 'Your booking for El Nido Island Hopping Tour A has been confirmed.', 'booking');

-- ============================================================
-- 10. EXPENSES (Trip line-item expenses for Budget tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
    id             SERIAL PRIMARY KEY,
    trip_id        INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name           VARCHAR(150) NOT NULL,
    items          INTEGER NOT NULL DEFAULT 1,
    category       VARCHAR(50) NOT NULL,
    cost           DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    date           DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id);
