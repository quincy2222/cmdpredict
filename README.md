# CMDpredict — Internal Prediction Market

A Polymarket-style prediction market for internal company use. Anyone can create markets, and all outcomes are traded as YES/NO contracts with prices that normalise to 100%.

## Quick Start (5 minutes)

### Step 1: Enable GitHub Pages

1. Go to your repo **Settings** → **Pages**
2. Under "Source", select **Deploy from a branch**
3. Choose **main** branch, **/ (root)** folder
4. Click **Save**
5. Your site will be live at `https://quincy2222.github.io/cmdpredict/` in ~1 minute

### Step 2: Upload the files

1. Click **"uploading an existing file"** on the repo home page
2. Drag in `index.html` and this `README.md`
3. Commit to main

Your site is now live! Share the URL with your team.

---

## Adding Real-Time Sync (Firebase — free)

Without Firebase, the app works but each person only sees their own markets (localStorage). To make markets **shared across everyone in real-time**, set up Firebase:

### Step 1: Create a Firebase project (free)

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Create a project"** → name it `cmdpredict` → Continue
3. Disable Google Analytics (not needed) → **Create Project**

### Step 2: Create a Realtime Database

1. In your Firebase project, go to **Build** → **Realtime Database**
2. Click **Create Database**
3. Choose a location close to your team
4. Select **Start in test mode** → Enable
5. Copy the database URL (looks like `https://cmdpredict-xxxxx-default-rtdb.firebaseio.com`)

### Step 3: Get your web config

1. Go to **Project Settings** (gear icon) → **General**
2. Scroll to **"Your apps"** → click the **Web** icon (`</>`)
3. Register the app (name it anything)
4. Copy the `firebaseConfig` object

### Step 4: Paste config into index.html

Open `index.html` and find this section near the top:

```javascript
const FIREBASE_CONFIG = {
  // PASTE YOUR FIREBASE CONFIG HERE:
  // apiKey: "...",
  // authDomain: "...",
  // databaseURL: "...",
  // projectId: "...",
  // storageBucket: "...",
  // messagingSenderId: "...",
  // appId: "..."
};
```

Replace it with your actual config (uncomment the lines and fill in values):

```javascript
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXX",
  authDomain: "cmdpredict-xxxxx.firebaseapp.com",
  databaseURL: "https://cmdpredict-xxxxx-default-rtdb.firebaseio.com",
  projectId: "cmdpredict-xxxxx",
  storageBucket: "cmdpredict-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### Step 5: Commit and push

Push the updated `index.html` to GitHub. The site will update automatically.

### Step 6: (Optional) Lock down database rules

The "test mode" rules expire after 30 days. For a basic internal tool, set these rules in Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

For better security, you can add Firebase Authentication later.

---

## How It Works

- **Markets**: Anyone creates a market with multiple outcome contracts
- **Trading**: Buy YES or NO on any outcome. Prices move via a constant-product market maker (CPMM)
- **Normalisation**: All outcome prices in a market always sum to 100¢
- **Portfolio**: Each user has $10,000 starting balance (stored locally)
- **Leaderboard**: Tracks positions and trades per analyst

## Tech Stack

- Single `index.html` — no build step, no dependencies to install
- Firebase Realtime Database for shared state (optional, falls back to localStorage)
- Vanilla JS, no framework needed
- Deployed via GitHub Pages (free)
