
// ===== TELEGRAM VERIFY FUNCTION =====
const BOT_TOKEN = process.env.9219055735:AAF1Lwqx5l7IxWFazDjWrCwInxwycNPYVhQ;
const ADMIN_BOT_TOKEN = process.env.9007933952:AAHovPNqxX-XcvwWumgNYEmafPV7xff7-k0;
const ADMIN_ID = String(process.env.ADMIN_TELEGRAM_ID || '7302992283');

function verifyInitData(initData, botToken = BOT_TOKEN) {
  if (!initData || !botToken) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) return null;

    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== hash) return null;

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);

    if (!authDate || now - authDate > 3600 || authDate > now + 60) {
      return null;
    }

    const userJson = params.get('user');
    if (!userJson) return null;

    return JSON.parse(userJson);
  } catch (error) {
    console.error('Telegram verification error:', error.message);
    return null;
  }
}

// ===== USER BOT AUTHENTICATION =====
async function telegramAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const initData = authHeader.startsWith('tma ')
      ? authHeader.slice(4)
      : '';

    const user = verifyInitData(initData, BOT_TOKEN);

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        error: 'Invalid User Bot InitData'
      });
    }

    req.telegramUser = {
      id: user.id,
      username: user.username || null,
      firstName: user.first_name || null,
      lastName: user.last_name || null
    };

    next();
  } catch (error) {
    console.error('User authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// ===== ADMIN BOT AUTHENTICATION =====
async function adminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const initData = authHeader.startsWith('tma ')
      ? authHeader.slice(4)
      : '';

    const admin = verifyInitData(initData, ADMIN_BOT_TOKEN);

    if (!admin || !admin.id) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Admin Bot InitData'
      });
    }

    if (String(admin.id) !== ADMIN_ID) {
      return res.status(403).json({
        success: false,
        error: 'Access Denied',
        message: 'You are not authorized to access the Admin Panel.'
      });
    }

    req.adminUser = admin;
    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    return res.status(401).json({ error: 'Admin authentication failed' });
  }
}
