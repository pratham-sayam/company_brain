const mongoose = require('mongoose');

const idempotencyKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  action: {
    type: String,
    enum: ['classify', 'generate', 'chat'],
    required: true,
  },
  count: {
    type: Number,
    default: 1,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    // TTL index — auto-delete after 24 hours
    expires: 86400,
  },
});

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
