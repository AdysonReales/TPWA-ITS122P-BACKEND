require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const tripRoutes = require('./routes/trips.routes');

const app = express();

// Enable CORS so the Vercel frontend can call this backend.
// credentials: true is required so the httpOnly auth cookie is sent/received.
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

// Render automatically assigns process.env.PORT
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
