/**
 * Configuração do Firebase (Nuvem DMS).
 *
 * A firebaseConfig de app Web é um dado PÚBLICO por design (identifica o projeto,
 * não autentica nada) — a segurança real fica nas Security Rules do Storage e do
 * Firestore e no modelo de acesso por código de dispositivo.
 *
 * Inicialização LAZY: nada toca o Firebase durante o SSR — só quando um handler
 * de usuário chama getFirebase() no navegador.
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB3rDTibbtLWrk48f8N2YotMFC7f84bRTQ",
  authDomain: "dmsprintapp.firebaseapp.com",
  projectId: "dmsprintapp",
  storageBucket: "dmsprintapp.firebasestorage.app",
  messagingSenderId: "944897858113",
  appId: "1:944897858113:web:847c6560a123bb2e4184c0",
};

export interface FirebaseServices {
  app: FirebaseApp;
  storage: FirebaseStorage;
  db: Firestore;
}

let cached: FirebaseServices | null = null;

/** Retorna (e memoiza) os serviços Firebase — chamar somente no navegador. */
export function getFirebase(): FirebaseServices {
  if (cached) return cached;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  cached = { app, storage: getStorage(app), db: getFirestore(app) };
  return cached;
}
