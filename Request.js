const mongoose = require('mongoose');

const RequestSchema = new mongoose.Schema({
  documentType: String, // e.g., 'passport'
  description: String,
  country: String,
  city: String,
  seeker: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['open', 'in_progress', 'completed'], default: 'open' },
  helper: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  preferredLanguage: String,
  preferredConsulate: { country: String, city: String },
  files: [{ url: String, encrypted: Boolean }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Request', RequestSchema);