const express = require('express');
const Message = require('../models/Message');
const router = express.Router();

// Post message
router.post('/', async (req, res) => {
  const msg = new Message(req.body);
  await msg.save();
  res.json(msg);
});

// Get messages for request
router.get('/:requestId', async (req, res) => {
  const messages = await Message.find({ request: req.params.requestId }).populate('sender');
  res.json(messages);
});

module.exports = router;