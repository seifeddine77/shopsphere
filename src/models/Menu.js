const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    icon: { type: String, default: '' },
    target: { type: String, enum: ['_self', '_blank'], default: '_self' },
    order: { type: Number, default: 0 },
    children: [
      {
        label: { type: String, required: true, trim: true },
        url: { type: String, required: true, trim: true },
        icon: { type: String, default: '' },
        order: { type: Number, default: 0 },
      },
    ],
  },
  { _id: false },
);

const menuSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    location: { type: String, enum: ['HEADER', 'FOOTER', 'MEGA_MENU'], required: true },
    items: [menuItemSchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.models.Menu || mongoose.model('Menu', menuSchema);
