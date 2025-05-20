const UserSchema = new mongoose.Schema({
  // ...existing fields...
  publicFields: [String], // e.g., ['name', 'languages', 'rating']
  // rest as before
});

// Helper: Remove hidden fields before sending to client
UserSchema.methods.toPublicJSON = function() {
  const obj = this.toObject();
  Object.keys(obj).forEach(key => {
    if (this.publicFields && !this.publicFields.includes(key)) {
      obj[key] = undefined;
    }
  });
  return obj;
};