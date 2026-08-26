const mongoose = require('mongoose');

/** Newsletter subscriber list. */
const subscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    source: { type: String, enum: ['footer', 'home', 'checkout'], default: 'footer' },
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.models.Subscriber || mongoose.model('Subscriber', subscriberSchema);
