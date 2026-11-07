"""
EarnWallet Vote Bot — Render Webhook Version
==============================================
Render Free Tier-এ চলার জন্য Webhook মোডে তৈরি।
/healthcheck এন্ডপয়েন্ট আছে যাতে Render সার্ভিস ঘুমিয়ে না পড়ে।
"""

import os
import logging
from contextlib import asynccontextmanager

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
)
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
)
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse, Response
from starlette.routing import Route
import uvicorn


# ============================================================
# ⚙️ কনফিগারেশন — এখানে আপনার লিংক বসান
# ============================================================

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")

CHALLENGE_LINK = "https://t.me/EarnWallet_Official"      # 🎯 চ্যালেঞ্জ জয়েন লিংক
HOW_TO_WORK_LINK = "https://t.me/EarnWallet_Official"    # 📖 How to Work লিংক
MINI_APP_LINK = "https://earn-wallet-z0ea.onrender.com/" # 🚀 Mini App লিংক
CHANNEL_LINK = "https://t.me/EarnWallet_Official"        # 📢 Official Channel

WELCOME_MESSAGE = (
    "🎉 <b>Welcome to EarnWallet!</b>\n"
    "━━━━━━━━━━━━━━━━━━━━━━\n\n"
    "আপনি সফলভাবে EarnWallet Vote Bot-এ যুক্ত হয়েছেন।\n"
    "নিচের বাটনগুলো ব্যবহার করে কাজ শুরু করুন 👇\n\n"
    "📋 <b>Challenge Join</b> — ভোটে অংশ নিন\n"
    "📖 <b>How to Work</b> — কাজের নিয়ম জানুন\n"
    "🚀 <b>Open Mini App</b> — EarnWallet খুলুন\n"
    "📢 <b>Official Channel</b> — আপডেট পান\n\n"
    "━━━━━━━━━━━━━━━━━━━━━━\n"
    "💡 <i>প্রথমে How to Work দেখুন, তারপর Mini App খুলুন।</i>"
)

HELP_MESSAGE = (
    "📖 <b>How to Use This Bot</b>\n"
    "━━━━━━━━━━━━━━━━━━━━━━\n\n"
    "1️⃣ <b>/start</b> — বট শুরু করুন\n"
    "2️⃣ <b>Challenge Join</b> — ভোট লিংকে যান\n"
    "3️⃣ <b>How to Work</b> — কাজের নিয়ম পড়ুন\n"
    "4️⃣ <b>Open Mini App</b> — EarnWallet-এ ঢুকুন\n"
    "5️⃣ <b>Official Channel</b> — আপডেট পান\n\n"
    "━━━━━━━━━━━━━━━━━━━━━━\n"
    "❓ সমস্যা হলে: /help"
)


# ============================================================
# 🎯 কীবোর্ড
# ============================================================

def build_main_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("🎯 Join Challenge (Vote Now)", url=CHALLENGE_LINK)],
        [InlineKeyboardButton("📖 How to Work — কিভাবে কাজ করবেন", url=HOW_TO_WORK_LINK)],
        [InlineKeyboardButton("🚀 Open EarnWallet Mini App", web_app=WebAppInfo(url=MINI_APP_LINK))],
        [InlineKeyboardButton("📢 Official Channel", url=CHANNEL_LINK)],
        [
            InlineKeyboardButton("❓ Help", callback_data="help"),
            InlineKeyboardButton("🔄 Refresh", callback_data="refresh"),
        ],
    ]
    return InlineKeyboardMarkup(keyboard)


# ============================================================
# 🚀 হ্যান্ডলার
# ============================================================

async def start(update: Update, context):
    name = update.effective_user.first_name or "Friend"
    await update.message.reply_text(
        text=f"👋 হ্যালো <b>{name}</b>!\n\n" + WELCOME_MESSAGE,
        parse_mode=ParseMode.HTML,
        reply_markup=build_main_keyboard(),
        disable_web_page_preview=True,
    )

async def help_command(update: Update, context):
    await update.message.reply_text(
        text=HELP_MESSAGE,
        parse_mode=ParseMode.HTML,
        reply_markup=build_main_keyboard(),
        disable_web_page_preview=True,
    )

async def button_callback(update: Update, context):
    query = update.callback_query
    await query.answer()
    if query.data == "help":
        await query.edit_message_text(
            text=HELP_MESSAGE,
            parse_mode=ParseMode.HTML,
            reply_markup=build_main_keyboard(),
            disable_web_page_preview=True,
        )
    elif query.data == "refresh":
        await query.edit_message_text(
            text=WELCOME_MESSAGE,
            parse_mode=ParseMode.HTML,
            reply_markup=build_main_keyboard(),
            disable_web_page_preview=True,
        )


# ============================================================
# 🌐 Webhook + Healthcheck
# ============================================================

telegram_app: Application = None


async def healthcheck(request: Request):
    return PlainTextResponse("OK")


async def webhook_handler(request: Request):
    data = await request.json()
    update = Update.de_json(data, telegram_app.bot)
    await telegram_app.process_update(update)
    return Response(status_code=200)


@asynccontextmanager
async def lifespan(app: Starlette):
    global telegram_app
    logging.info("🚀 Starting bot...")

    telegram_app = Application.builder().token(BOT_TOKEN).updater(None).build()
    telegram_app.add_handler(CommandHandler("start", start))
    telegram_app.add_handler(CommandHandler("help", help_command))
    telegram_app.add_handler(CallbackQueryHandler(button_callback))

    await telegram_app.initialize()
    await telegram_app.start()

    render_url = os.environ.get("RENDER_EXTERNAL_URL", "").rstrip("/")
    if render_url:
        webhook_url = f"{render_url}/webhook"
        await telegram_app.bot.set_webhook(url=webhook_url)
        logging.info(f"✅ Webhook set: {webhook_url}")

    yield

    logging.info("🛑 Stopping bot...")
    await telegram_app.stop()
    await telegram_app.shutdown()


starlette_app = Starlette(
    routes=[
        Route("/healthcheck", healthcheck),
        Route("/webhook", webhook_handler, methods=["POST"]),
    ],
    lifespan=lifespan,
)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    if not BOT_TOKEN:
        raise RuntimeError("❌ BOT_TOKEN সেট করা নেই!")
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(starlette_app, host="0.0.0.0", port=port)
