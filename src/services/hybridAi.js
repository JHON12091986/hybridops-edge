import { initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from "firebase/app-check";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
} from "firebase/ai";

let cachedApp = null;
let cachedAi = null;
let modelCache = null;
let currentMode = null;

function initFirebase() {
  if (cachedApp && cachedAi) {
    return { app: cachedApp, ai: cachedAi };
  }

  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  if (!firebaseConfig.apiKey) {
    throw new Error("Missing VITE_FIREBASE_API_KEY in .env. Restart Vite after saving .env.");
  }

  if (import.meta.env.DEV && import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN =
      import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN === "true"
        ? true
        : import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN;
  }

  const app = initializeApp(firebaseConfig);
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "debug-site-key";

  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });

  const ai = getAI(app, { backend: new GoogleAIBackend() });
  cachedApp = app;
  cachedAi = ai;

  return { app, ai };
}

export function getHybridModel(mode = InferenceMode.PREFER_ON_DEVICE) {
  if (modelCache && currentMode === mode) return modelCache;

  const { ai } = initFirebase();
  modelCache = getGenerativeModel(ai, {
    mode,
    inCloudParams: {
      model: "gemini-3.8-flash",
    },
    onDeviceParams: {},
  });
  currentMode = mode;
  return modelCache;
}

export async function analyzeIncident(logText, mode = InferenceMode.PREFER_ON_DEVICE) {
  const model = getHybridModel(mode);
  const prompt = [
    "You are HybridOps Edge, an SRE incident triage engine. Be concise and actionable.",
    "Output strictly these three sections:",
    "1) Summary (max 2 lines)",
    "2) Likely Root Cause (max 2 lines)",
    "3) Immediate Action Steps (3-4 short bullets)",
    "",
    "Logs:",
    logText,
  ].join("\n");

  const start = performance.now();
  const response = await model.generateContent(prompt);
  const elapsedMs = Math.round(performance.now() - start);
  const text = response.response.text();

  return { text, elapsedMs, mode };
}

export { InferenceMode };