const express = require('express');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const User = require('../models/User');
const router = express.Router();

// Setup 2FA - returns QR code
router.post('/setup', async (req, res) => {
  const { userId } = req.body;
  const secret = speakeasy.generateSecret({ length: 20 });
  const user = await User.findByIdAndUpdate(userId, { '2fa': { secret: secret.base32, enabled: false } });
  qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
    res.json({ qr: data_url, secret: secret.base32 });
  });
});

// Verify 2FA code
router.post('/verify', async (req, res) => {
  const { userId, token } = req.body;
  const user = await User.findById(userId);
  const verified = speakeasy.totp.verify({
    secret: user['2fa'].secret,
    encoding: 'base32',
    token
  });
  if (verified) {
    user['2fa'].enabled = true;
    await user.save();
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

module.exports = router;