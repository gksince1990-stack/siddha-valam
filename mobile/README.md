# Siddha Valam — Mobile App

Native Android/iOS wrapper for the Siddha Valam web app, built with [Capacitor](https://capacitorjs.com).

It loads your deployed Siddha Valam site (the same `frontend/` + `backend/` from the root
of this repo) directly inside a native app shell — same features, same data, one codebase.

## 1. Set your production URL

Deploy `backend/` (which also serves `frontend/`) somewhere — e.g. Railway, as described in
`../SETUP-GUIDE.txt`. Then edit `capacitor.config.json` and replace:

```json
"server": {
  "url": "https://REPLACE-WITH-YOUR-PRODUCTION-URL.example.com"
}
```

with your real URL (e.g. `https://siddha-valam-production.up.railway.app`).

## 2. Install dependencies

```bash
cd mobile
npm install
```

## 3. Sync the native projects

```bash
npx cap sync
```

## 4. Build & run

**Android** (requires Android Studio / Android SDK):

```bash
npx cap open android
```

Then click Run in Android Studio, or build an APK via `Build > Build Bundle(s) / APK(s)`.

**iOS** (requires a Mac with Xcode):

```bash
npx cap add ios
npx cap open ios
```

## Notes

- App ID: `com.siddhavalam.app`
- App name: `Siddha Valam`
- Because the app loads the live site over HTTPS, any update you deploy to the backend
  (new products, pricing, pages) shows up in the app immediately — no app-store update needed.
- `www/index.html` is only a brief splash/fallback shown before the remote site loads.
