# KU Confessions 🎓

An anonymous confession board for Kathmandu University students.

## Features
- 📬 Anonymous confessions (no login required)
- 🏷️ Categories: Love, Academics, Campus, Other
- ❤️ Like confessions (tracked per device)
- 🔄 Real-time updates via Firebase Firestore
- 📊 Sort by newest or most liked
- 🎨 Aesthetic dark UI with grain & glow effects

## Setup

### 1. Firebase Firestore Rules
In your Firebase console → Firestore → Rules, set:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /confessions/{id} {
      allow read: if true;
      allow create: if request.resource.data.text is string
                    && request.resource.data.text.size() > 0
                    && request.resource.data.text.size() <= 500;
      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes'])
                    && request.resource.data.likes == resource.data.likes + 1;
    }
  }
}
```

### 2. Create Firestore Index
In Firebase console → Firestore → Indexes, create a composite index:
- Collection: `confessions`
- Fields: `createdAt` (Descending)
- Query scope: Collection

### 3. Run the site
Because this uses ES Modules (`import`), you need to serve it over HTTP (not file://). 

**Option A – VS Code Live Server**: Right-click `index.html` → Open with Live Server

**Option B – Python**:
```bash
python -m http.server 8080
```
Then open http://localhost:8080

**Option C – Deploy to Firebase Hosting**:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

## File Structure
```
ku-confessions/
├── index.html    # Main HTML
├── style.css     # All styles
├── app.js        # Firebase logic + UI
└── README.md     # This file
```

## Tech Stack
- Firebase Firestore (real-time database)
- Firebase Analytics
- Firebase SDK v9.23.0 (via CDN)
- Vanilla JS (ES Modules)
- Google Fonts: DM Serif Display + DM Sans
