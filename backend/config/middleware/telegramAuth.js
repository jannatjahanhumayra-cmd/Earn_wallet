const { validate } = require('@tma.js/init-data');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function telegramAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [authType, initData] = authHeader.split(' ');

    if (authType !== 'tma' || !initData) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const validatedData = await validate(initData, BOT_TOKEN, {
      expiresIn: 3600,
    });

    if (!validatedData.user || !validatedData.user.id) {
      return res.status(401).json({ error: 'Invalid user data' });
    }

    req.telegramUser = {
      id: validatedData.user.id,
      username: validatedData.user.username || null,
      firstName: validatedData.user.first_name || null,
      lastName: validatedData.user.last_name || null,
    };

    next();
  } catch (error) {
    console.error('Telegram auth error:', error.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

module.exports = telegramAuth;
