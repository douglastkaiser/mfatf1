// Firebase Configuration
// Replace these placeholder values with your Firebase project settings.
//
// Setup steps:
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (or use existing)
// 3. Add a Web App (click the </> icon)
// 4. Copy the firebaseConfig values below
// 5. In the Firebase Console, go to Authentication > Sign-in method
//    and enable "Email/Password"
// 6. Go to Firestore Database > Create database (start in test mode)

export const FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

// The email address that gets admin/commissioner privileges.
// Set this to YOUR email before anyone registers.
export const ADMIN_EMAIL = 'admin@example.com';
