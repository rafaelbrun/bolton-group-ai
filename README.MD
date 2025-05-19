# Description
Backend for Vapi voice agent for Bolton Group.

## Local Setup
- Install firebase CLI if not already installed: `npm install -g firebase-tools@latest`
- Clone this repo and cd into folder.
- `cd functions`
- `npm ci`
- `firebase login --reauth` and log in with your Google account (admin@solve.support)

## Deploy to Firebase
- `firebase deploy --only functions` from the functions directory

## Todo
- Customer to provide call list and reporting format. 
- Final test.
