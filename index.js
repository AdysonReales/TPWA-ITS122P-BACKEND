const express = require('express');
const cors = require('cors');

const app = express();

// Enable CORS so Vercel frontend can call this backend
app.use(cors());
app.use(express.json());

// Base Route & Health Check
app.get('/', (req, res) => {
  res.send('LakBye Backend API is running.');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'API is live', timestamp: new Date() });
});

// Render automatically assigns process.env.PORT
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});