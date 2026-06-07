require('dotenv').config();
const express = require('express');
const path = require('path');

const app = require('./api/index');
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`smartestking 啟動中：http://localhost:${PORT}`));
