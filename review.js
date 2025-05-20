const express = require('express');
const Review = require('../models/Review');
const User = require('../models/User');
const router = express.Router();

// Post a review
router.post('/', async (req, res) => {
  const review = new Review(req.body);
  await review.save();
  // Update helper's rating
  const helper = await User.findById(req.body.helper);
  helper.reviews.push(review._id);
  // Calculate new average
  const reviews = await Review.find({ helper: helper._id });
  helper.rating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  await helper.save();
  res.json(review);
});

// Get reviews for helper
router.get('/:helperId', async (req, res) => {
  const reviews = await Review.find({ helper: req.params.helperId }).populate('reviewer');
  res.json(reviews);
});

module.exports = router;