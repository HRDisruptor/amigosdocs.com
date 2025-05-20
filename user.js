router.get('/:id/export', async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  // Gather all user-related data
  // ...
  res.json(user);
});