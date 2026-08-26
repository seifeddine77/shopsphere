const mongoose = require('mongoose');
const { hashPassword } = require('../utils/password');

/**
 * Embedded shipping address (used at checkout in Phase 6).
 */
const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 30, default: 'Home' },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    street: { type: String, required: true, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80, default: '' },
    postalCode: { type: String, required: true, trim: true, maxlength: 20 },
    country: { type: String, required: true, trim: true, maxlength: 80 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
);

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    },
    // select:false => never returned by queries unless explicitly requested.
    // Belt-and-suspenders: toJSON transform also strips it.
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
      match: [/^$|^\+?[0-9\s\-().]{6,20}$/, 'Please provide a valid phone number'],
    },
    avatar: { type: String, default: '' },
    role: {
      type: String,
      enum: ['USER', 'ADMIN'],
      default: 'USER',
    },
    addresses: [addressSchema],
    isActive: { type: Boolean, default: true },

    // Password reset (hashed token + expiry) - used by auth service
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        return ret;
      },
    },
  },
);

/** Hash the password whenever it is set or changed */
userSchema.pre('save', async function hashOnSave(next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await hashPassword(this.password);
    return next();
  } catch (error) {
    return next(error);
  }
});

/** Instance method - candidate compared against the stored hash */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  const { comparePassword: compare } = require('../utils/password');
  return compare(candidate, this.password);
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
