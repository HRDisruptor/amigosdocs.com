const fs = require('fs');
const https = require('https');
const express = require('express');
// ...other imports

const app = express();
// all your middleware/routes...

// For local dev with SSL certs
const httpsOptions = {
  key: fs.readFileSync('path/to/key.pem'),
  cert: fs.readFileSync('path/to/cert.pem'),
};
https.createServer(httpsOptions, app).listen(443, () => {
  console.log('HTTPS Server running');
});