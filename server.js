// server.js or app.js
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/user_routes.js';

const app = express();

app.use(cors()); // Enable CORS if external servers need to call your API
app.use(express.json()); // To parse JSON bodies

// Mount your auth routes (adjust the path as needed)
app.use('/api', authRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
