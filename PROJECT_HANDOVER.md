# PROJECT_HANDOVER.md

## Project Name
Watch & Earn Telegram Mini App

## Live Backend URL
https://earn-wallet-z0ea.onrender.com

## Technology Stack
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js (Express)
- Database: Firebase Firestore
- Auth: Telegram WebApp InitData
- Hosting: Render (Free Tier, Node 24)

## Completed Features (Phase 1 & 2) ✅
- [x] GitHub repository: watch-earn-app
- [x] Backend folder structure + Express server
- [x] Firebase project created & Firestore database enabled
- [x] Firestore Security Rules published (allow read, write: if false)
- [x] Firebase Admin SDK integrated & verified (write test passed)
- [x] Telegram Bot created via BotFather
- [x] Telegram InitData verification middleware built
- [x] Render deployed, Environment Variables configured
- [x] Telegram Menu Button configured with Render URL
- [x] Frontend skeleton served properly via Express static

## Environment Variables (Render)
| Key | Status |
|---|---|
| NODE_ENV | ✅ production |
| TELEGRAM_BOT_TOKEN | ✅ Real token set |
| FIREBASE_CREDENTIALS | ✅ Real JSON set |
| ADMIN_TELEGRAM_ID | ✅ Real ID set |

## Pending Features
- [ ] User Panel UI (Dashboard, Earn, Tasks, Referral, History, Withdraw, Profile)
- [ ] Admin Panel UI + auth
- [ ] Telegram WebApp Auth integration (frontend to backend)
- [ ] Watch Ads System
- [ ] Watch Video System
- [ ] Task System
- [ ] Referral System
- [ ] Wallet System (server-side transactions)
- [ ] Withdrawal System
- [ ] Anti-fraud & rate limiting
- [ ] Banner ad placements

## Next Development Steps (Phase 3)
1. Design and build User Panel UI (HTML/CSS).
2. Integrate Telegram WebApp SDK (frontend).
3. Create `/api/auth` endpoint to verify Telegram InitData and create user in Firestore.
4. Build the Wallet & Balance display logic.
