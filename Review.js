const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  helper: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
  rating: { type: Number, min: 1, max: 5 },
  comment: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Review', ReviewSchema);