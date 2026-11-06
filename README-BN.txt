# EarnWalletBot User Mini App

## Included
- `server.js`: Node.js/Express backend, Telegram WebApp initData verification, user APIs, ads/tasks/referrals/withdraw/history, existing admin API routes retained.
- `public/index.html`, `style.css`, `app.js`: responsive Telegram User Mini App UI.
- `package.json`: runtime dependencies.

## Firebase config included
এই ZIP-এর মধ্যে `config/firebase.js` ফাইলটি তোমার আপলোড করা ফাইল থেকে যোগ করা হয়েছে। Render-এর `FIREBASE_CREDENTIALS` Environment Variable আগের মতোই থাকতে হবে। This project expects:
- `initializeFirebase()` to initialize Firebase Admin using your existing Render environment setup.
- `getDb()` to return Firestore.

## Render Environment Variables
Keep your existing Firebase variables and set:
- `TELEGRAM_BOT_TOKEN` = User Bot token
- `ADMIN_BOT_TOKEN` = Admin Bot token (for later Admin Mini App)
- `ADMIN_TELEGRAM_ID` = your numeric Telegram ID
- `TELEGRAM_BOT_USERNAME` = User Bot username without @
- `MIN_WITHDRAW` = minimum withdrawal amount, e.g. 100
- `REFERRAL_BONUS` = referral bonus amount (0 disables bonus until referral attribution is implemented)

Never paste tokens or Firebase private keys into source files or chat.

## Deploy
1. Upload/replace `server.js`, `package.json`, and the three files inside `public/`.
2. Keep `config/firebase.js` and existing Firebase environment variables unchanged.
3. In Render, run `npm install` (or let the deploy build run), then start command `npm start`.
4. Set the User Bot Mini App URL to your Render service URL.
5. Open the Mini App from Telegram, not a normal browser tab.

## Important setup still needed
- Paste your real, approved Adsterra placement snippets into the three marked ad areas in `public/index.html` / gate area. Do not paste them until you have the actual snippets.
- Adsterra display banners do not provide a reliable close/impression callback. The current gate is a navigation confirmation UI, not proof that an ad was viewed and does not award money.
- Ad reward campaigns in Firestore `advertisements` are separate from Adsterra display ads. Only create reward campaigns when the destination advertiser permits incentivized traffic.
- `TELEGRAM_BOT_USERNAME` is needed to build referral links.
- Admin review routes expect task documents in `tasks` and withdrawal review via the retained admin API. Admin UI is not included in this phase.

## Firestore collections used
`users`, `advertisements`, `adClaims`, `watchSessions`, `tasks`, `taskSubmissions`, `withdrawals`, `transactions`.

## Notes
This is a starter implementation to deploy and test. Before accepting real-money withdrawals, configure payment operations, test all transaction paths, and add a proper referral attribution flow plus admin task-submission review endpoints/UI.


## নতুন Ad Placement Management API
Admin Bot-এর বৈধ initData দিয়ে:
- GET `/api/admin/ad-placements` : সব placement settings দেখবে
- PUT `/api/admin/ad-placements/top` : top placement save/update
- PUT `/api/admin/ad-placements/middle` : middle placement save/update
- PUT `/api/admin/ad-placements/bottom` : bottom placement save/update
- PUT `/api/admin/ad-placements/gate` : button/gate placement save/update
- DELETE `/api/admin/ad-placements/<slot>` : নির্দিষ্ট placement মুছবে

PUT JSON body উদাহরণ:
`{"enabled":true,"label":"Top Banner","html":"<your approved Adsterra embed code>"}`

এই API-গুলো Admin Panel UI নয়; পরের ধাপে Admin Panel-এর ফর্ম থেকে এগুলো ব্যবহার করা যাবে।
Adsterra code কেবল নিজের অনুমোদিত placement code হিসেবে ব্যবহার করবে। এই UI বিজ্ঞাপন দেখা বা ক্লিকের সত্যতা যাচাই করে না।
