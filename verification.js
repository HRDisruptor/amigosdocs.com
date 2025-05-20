const express = require('express');
const User = require('../models/User');
const router = express.Router();

// Submit verification
router.post('/:userId', async (req, res) => {
  const { method, data } = req.body; // e.g., method: 'government_id', data: { idNumber, image }
  const user = await User.findById(req.params.userId);
  user.verifications.push({ method, data, status: 'pending' });
  await user.save();
  res.json({ message: 'Verification submitted' });
});

// Mark as verified (admin/moderator action)
router.post('/:userId/approve', async (req, res) => {
  const { method } = req.body;
  const user = await User.findById(req.params.userId);
  const v = user.verifications.find(v => v.method === method);
  if (v) v.status = 'verified';
  // Add badge
  user.badges.push({ type: `${method} Verified`, awardedAt: new Date() });
  await user.save();
  res.json({ message: 'User verified and badge awarded' });
});

module.exports = router;