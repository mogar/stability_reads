# Stability Reads

A speed reading Android app built with Capacitor.

## Features

- Library view to manage documents
- Import TXT files
- Normal reading mode with word highlighting
- Speed reading mode with RSVP and adjustable WPM

## Project Setup

The project is set up with Capacitor for hybrid mobile development. The web app resides in the `www/` directory.

### Prerequisites

- Node.js
- Android SDK (for Android builds)

### Installation

1. Install dependencies:
   ```
   npm install
   ```

2. Add Android platform:
   ```
   npx cap add android
   ```

### Development

1. Develop the web app in `www/`.
2. Sync web assets to native projects:
   ```
   npm run build && npx cap sync
   ```
3. Run on Android device/emulator:
   ```
   npx cap run android
   ```

## Next Steps

Implement EPUB support, auto-pace feature, and polish the UI.