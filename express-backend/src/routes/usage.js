const { Router } = require('express');
const { getUsage, checkFiles } = require('../controllers/usageController');
const { authenticate } = require('../middleware/authenticate');

const router = Router();

// All usage endpoints require authentication
router.get('/',           authenticate, getUsage);
router.get('/check-files', authenticate, checkFiles);

module.exports = router;
