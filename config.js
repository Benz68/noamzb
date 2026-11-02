// Firebase project for the listings (console → Project settings → Your apps → Web app). These values are meant to
// be public; what protects the data are the rules in firebase/firestore.rules. Approved admins are documents in admins/.
window.SS_CONFIG = {
  apiKey: "AIzaSyBF3wxFqrcRd4wcwzeIH9KWcv6SIkjuZIQ",
  authDomain: "silverstein-listings.firebaseapp.com",
  projectId: "silverstein-listings",
  appId: "1:108469277896:web:16757a6f0732bb8daf41fd",
  owner: "noanzil0608@gmail.com"   // approves admins; must match isOwner() in firebase/firestore.rules
};
