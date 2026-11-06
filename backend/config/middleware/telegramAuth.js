const crypto = require('crypto');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Telegram WebApp InitData verify (official algorithm)
 * Docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');

  // Sort by key and join with \n
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // secret_key = HMAC_SHA256(bot_token, key="WebAppData")
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) return null;

  // Check auth_date (1 hour expiry)
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 3600) return null;

  // Parse user JSON
  const userJson = params.get('user');
  if (!userJson) return null;

  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

async function telegramAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [authType, initData] = authHeader.split(' ');

    if (authType !== 'tma' || !initData) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const user = verifyInitData(initData);

    if (!user || !user.id) {
      return res.status(401).json({ error: 'Invalid or expired InitData' });
    }

    req.telegramUser = {
      id: user.id,
      username: user.username || null,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
    };

    next();
  } catch (error) {
    console.error('Telegram auth error:', error.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

module.exports = telegramAuth;
