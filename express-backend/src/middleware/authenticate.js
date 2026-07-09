const jwt = require('jsonwebtoken');

/**
 * Express middleware that verifies a Bearer JWT.
 * On success, attaches the decoded payload to req.user and calls next().
 * Returns 401 for missing, malformed, invalid, or expired tokens.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided.' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}

module.exports = { authenticate };
