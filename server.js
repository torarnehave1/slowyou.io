// server.js or app.js
import express from 'express';
import cors from 'cors';
import userRoutes from './routes/user_routes.js';
import githubRoutes from './routes/github_route.js';
import path from 'path';
import { fileURLToPath } from 'url';
import {connect}   from 'mongoose';
import dotenv from 'dotenv';



const app = express();

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

app.use(cors()); // Enable CORS if external servers need to call your API
app.use(express.json()); // To parse JSON bodies


connect(process.env.MONGO_DB_URL)
  .then(() => console.log('Connected to MongoDB with Mongoose'))
  .catch(err => console.error('Could not connect to MongoDB', err));


// Mount your auth routes (adjust the path as needed)
app.use('/api', userRoutes);
app.use('/api/github', githubRoutes);


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
