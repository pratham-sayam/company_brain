const { Router } = require('express');

const router = Router();

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

module.exports = router;
