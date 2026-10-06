import { spawn } from 'node:child_process';
const demo = 'demo-tlc-holidays';
const env = { ...process.env, FIREBASE_PROJECT_ID: demo, GCLOUD_PROJECT: demo, FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099', FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080', FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199', NEXT_PUBLIC_USE_FIREBASE_EMULATORS:'true', NEXT_PUBLIC_FIREBASE_PROJECT_ID:demo, NEXT_PUBLIC_FIREBASE_API_KEY:'demo-api-key', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:`${demo}.firebaseapp.com`, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:`${demo}.appspot.com`, NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:'123456789', NEXT_PUBLIC_FIREBASE_APP_ID:'1:123456789:web:demo', NEXT_PUBLIC_SITE_URL:'http://localhost:3000', TLC_ORG_ID:'tlc-vacations' };
for (const key of ['FIREBASE_PRIVATE_KEY','FIREBASE_CLIENT_EMAIL','OPENAI_API_KEY','NEXT_PUBLIC_APP_CHECK_SITE_KEY','NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID']) env[key] = "";
const child=spawn('pnpm',['--filter','@tlc/web','exec','next',...(process.argv.slice(2).length?process.argv.slice(2):['dev'])],{env,stdio:'inherit'});
child.on('exit',code=>process.exit(code??1));
