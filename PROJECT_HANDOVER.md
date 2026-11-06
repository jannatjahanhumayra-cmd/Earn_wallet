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


## Phase 6 - Watch Ads (implemented in this handoff)
- [x] User-side active advertisement list
- [x] Start-watch API creates a server-side watch session
- [x] Completion API checks elapsed server time
- [x] Firestore transaction credits reward and records a one-time claim
- [x] Dashboard balance refresh after successful reward
- [x] One-time claim per user per advertisement
- [x] User account status checked before loading/starting/completing ads

## Important deployment notes
1. Do not upload `.env` or service-account JSON files to GitHub.
2. Set `TELEGRAM_BOT_TOKEN`, `FIREBASE_CREDENTIALS`, and `ADMIN_TELEGRAM_ID` in Render Environment.
3. `ADMIN_TELEGRAM_ID` is read from the environment; remove any hard-coded production secrets.
4. The timer only enforces elapsed time. It cannot prove that the user actually watched a video or prevent a user from leaving the destination open in another tab.
5. This build awards each user once per advertisement. Repeating ads daily requires a deliberate daily-claim policy and should not be enabled by simply resetting client state.
6. Test first with a low-value test ad and a test Telegram account before using real rewards.
