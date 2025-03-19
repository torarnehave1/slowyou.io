// server.js
import express from 'express'; // Use require('express') if you're using CommonJS

const app = express();
const PORT = process.env.PORT || 3001;

// Basic route
app.get('/', (req, res) => {
  res.send('Hello from Express!');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
