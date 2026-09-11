require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const tripRoutes = require('./routes/trips.routes');
const destinationRoutes = require('./routes/destinations.routes');
const categoryRoutes = require('./routes/categories.routes');
const vendorRoutes = require('./routes/vendors.routes');
const activityRoutes = require('./routes/activities.routes');
const bookingRoutes = require('./routes/bookings.routes');
const notificationRoutes = require('./routes/notifications.routes');
const logRoutes = require('./routes/logs.routes');
const expenseRoutes = require('./routes/expenses.routes');
const { initExpensesTable } = require('./controllers/expenses.controller');

const app = express();

// Allowed origins for CORS (supports localhost, production Vercel, and Vercel preview deployments)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  'https://lakbye.vercel.app',
];

if (process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL.split(',').forEach((url) => {
    const trimmed = url.trim();
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);

    // Allow explicitly defined origins or any Vercel deployment (*.vercel.app)
    const isAllowed =
      allowedOrigins.includes(origin) ||
      /^https:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin);

    if (isAllowed) {
      return callback(null, true);
    }

    console.warn(`[CORS] Request origin blocked: ${origin}`);
    return callback(new Error(`CORS policy blocked access from origin: ${origin}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With', 'Accept'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Base Route & Health Check
app.get('/', (req, res) => {
  res.send('LakBye Backend API is running.');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'API is live', timestamp: new Date() });
});

// Feature routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/trips/:tripId/budget', expenseRoutes);
app.use('/api/destinations', destinationRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/logs', logRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

// Render automatically assigns process.env.PORT
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  initExpensesTable();
});
