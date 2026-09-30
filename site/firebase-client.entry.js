import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, getAuth, onAuthStateChanged,
  sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword,
  signInWithPopup, signOut
} from 'firebase/auth';
import {
  addDoc, collection, collectionGroup, doc, getDoc, getDocs, getFirestore,
  onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, where
} from 'firebase/firestore';

const authSdk = {
  GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged,
  sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword,
  signInWithPopup, signOut
};
const dbSdk = {
  addDoc, collection, collectionGroup, doc, getDoc, getDocs, onSnapshot, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where
};

let client;

/** The build bundles the pinned Firebase SDK; account-sync imports it only after config validation. */
export function initializeFirebase(config) {
  if (client) return client;
  const app = getApps().find(item => item.name === 'hugging-app') || initializeApp(config, 'hugging-app');
  client = { enabled:true, app, auth:getAuth(app), db:getFirestore(app), authSdk, dbSdk };
  return client;
}
