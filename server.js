/* ═══════════════════════════════════════════════════════════
   AXIS — Local Development Server
   Wraps api/index.js with static file serving + listen().
   Run: node server.js
   ═══════════════════════════════════════════════════════════ */

'use strict';

require('dotenv').config();

const app = require('./api/index.js');
const express = require('express');
const path = require('path');

// Serve static files locally (Vercel handles this in production)
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`\n✅  Axis server running at \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`   Admin panel: \x1b[36mhttp://localhost:${PORT}/admin.html\x1b[0m\n`);
});
