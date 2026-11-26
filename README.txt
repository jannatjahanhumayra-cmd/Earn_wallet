EarnWallet Admin App - first build
==================================

WHAT IS INCLUDED
- server.js: exact copy of the supplied existing EarnWallet server.js. Existing Firestore collection names, authentication, and API routes are retained.
- backend/public/admin.html + css/admin.css: new black/white Admin UI (old admin UI is not used).
- backend/public/js/: frontend split into API helper, dashboard, page modules and table renderer.
- package.json and .env.example.

DATABASE SAFETY
- This package does not create a Firebase project or database.
- It uses the existing FIREBASE_CREDENTIALS from your current Render environment.
- It does not run migrations, rename collections, or delete Firestore documents.
- Existing server endpoints are retained. Existing write endpoints (for example task/ad/withdrawal actions) retain their original behavior.
- Backup page exports only; restore is deliberately not exposed in this first UI.

IMPORTANT LIMITATION OF THIS FIRST BUILD
The existing backend was supplied as one monolithic server.js. To avoid breaking its current routes or changing the database contract, it is kept intact in this first package. Frontend JavaScript is split into separate files. Backend domain folders are prepared for a later, tested extraction of routes (users, referrals, tasks, ads, wallet, withdrawals, notifications, settings); those folders are not yet active route modules. Do not deploy this as a finished feature-complete replacement without testing each admin page against your live API.

DEPLOY
1. Keep a backup of your current GitHub repository and Render environment values.
2. Replace/add files preserving these paths. Do not delete Firebase credentials or change FIREBASE_CREDENTIALS.
3. Keep the same Render start command: npm start (or node server.js).
4. Deploy only after reviewing the diff. Test /health and /admin from the Admin Telegram Bot.
5. Some pages are read-only in this first UI. Task/ad creation, approval/rejection and other admin actions will be added after confirming the existing API contract.

Never put real bot tokens or Firebase service-account JSON in GitHub.
