const express = require('express');
const Request = require('../models/Request');
const User = require('../models/User');
const router = express.Router();

// Create request
router.post('/', async (req, res) => {
  const reqData = req.body;
  try {
    const request = new Request(reqData);
    await request.save();
    res.json(request);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all open requests
router.get('/', async (req, res) => {
  const requests = await Request.find({ status: 'open' }).populate('seeker');
  res.json(requests);
});

// Assign helper
router.post('/:id/assign', async (req, res) => {
  const { helperId } = req.body;
  const request = await Request.findByIdAndUpdate(
    req.params.id,
    { status: 'in_progress', helper: helperId },
    { new: true }
  );
  res.json(request);
});

module.exports = router;