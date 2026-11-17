#!/usr/bin/env node
/**
 * Creates (once) and restores iOS signing credentials for CI using only an App Store Connect API key,
 * so no Mac is ever needed.
 *
 *   node scripts/ios-credentials.mjs bootstrap   # register bundle ID, create distribution cert + App Store profile,
 *                                                 # save them encrypted to credentials/ios.enc
 *   node scripts/ios-credentials.mjs restore     # decrypt credentials/ios.enc into credentials.json + files for EAS
 *   node scripts/ios-credentials.mjs app-id      # print the App Store Connect app ID for the bundle ID
 *
 * Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (contents of the .p8 file), optional BUNDLE_ID.
 * The encryption key is derived from ASC_KEY_P8, so no extra secret is required.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const BUNDLE_ID = process.env.BUNDLE_ID || appJson.expo.ios.bundleIdentifier;
const ENC_PATH = path.join(root, 'credentials', 'ios.enc');
const { ASC_KEY_ID, ASC_ISSUER_ID } = process.env;
const ASC_KEY_P8 = (process.env.ASC_KEY_P8 || '').replace(/\\n/g, '\n').trim();

function need(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Missing GitHub secret(s): ${missing.join(', ')}`);
    process.exit(1);
  }
}

// ---------- App Store Connect API ----------
const b64url = (b) => Buffer.from(b).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key: ASC_KEY_P8, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64url(sig)}`;
}

async function asc(method, p, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${p}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = (json.errors || []).map((e) => `${e.title}: ${e.detail}`).join('; ');
    throw new Error(`App Store Connect ${method} ${p} failed (${res.status}): ${detail || text}`);
  }
  return json;
}

// ---------- encryption (AES-256-GCM, key derived from the .p8) ----------
const encKey = () => crypto.createHash('sha256').update('stremie-ios-credentials\n' + ASC_KEY_P8).digest();
function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
}
function decrypt(text) {
  const { iv, tag, data } = JSON.parse(text);
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString());
}

// ---------- commands ----------
async function bootstrap() {
  need('ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8');
  if (fs.existsSync(ENC_PATH)) {
    console.log('credentials/ios.enc already exists; nothing to do.');
    return;
  }

  // 1. Bundle ID
  let bundle = (await asc('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE_ID)}&limit=5`)).data.find(
    (b) => b.attributes.identifier === BUNDLE_ID
  );
  if (!bundle) {
    console.log(`Registering bundle ID ${BUNDLE_ID}…`);
    bundle = (
      await asc('POST', '/v1/bundleIds', {
        data: { type: 'bundleIds', attributes: { identifier: BUNDLE_ID, name: appJson.expo.name || 'App', platform: 'IOS' } },
      })
    ).data;
  } else console.log(`Bundle ID ${BUNDLE_ID} already registered.`);

  // 2. Distribution certificate from a fresh key + CSR
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ioscreds-'));
  const keyPem = path.join(tmp, 'key.pem');
  const csrPem = path.join(tmp, 'csr.pem');
  execFileSync('openssl', ['genrsa', '-out', keyPem, '2048'], { stdio: 'ignore' });
  execFileSync('openssl', ['req', '-new', '-key', keyPem, '-out', csrPem, '-subj', `/CN=${appJson.expo.name} CI/O=EAS`], { stdio: 'ignore' });
  const csr = fs.readFileSync(csrPem, 'utf8').replace(/-----[^-]+-----|\s/g, '');
  console.log('Creating Apple Distribution certificate…');
  let cert;
  try {
    cert = (await asc('POST', '/v1/certificates', { data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent: csr } } })).data;
  } catch (e) {
    console.error(String(e.message));
    console.error(
      '\nIf this says you already have the maximum number of certificates, revoke an unused Distribution certificate at https://developer.apple.com/account/resources/certificates/list and re-run.'
    );
    process.exit(1);
  }
  const certDer = path.join(tmp, 'cert.cer');
  const certPem = path.join(tmp, 'cert.pem');
  fs.writeFileSync(certDer, Buffer.from(cert.attributes.certificateContent, 'base64'));
  execFileSync('openssl', ['x509', '-inform', 'DER', '-in', certDer, '-out', certPem]);
  const p12Password = crypto.randomBytes(18).toString('base64url');
  const p12 = path.join(tmp, 'dist.p12');
  // SHA1/3DES PBE keeps the .p12 readable by node-forge (EAS) and macOS keychain.
  execFileSync('openssl', [
    'pkcs12', '-export', '-inkey', keyPem, '-in', certPem, '-out', p12, '-passout', `pass:${p12Password}`,
    '-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-3DES', '-macalg', 'sha1', '-name', `${appJson.expo.name} Distribution`,
  ]);

  // 3. App Store provisioning profile
  console.log('Creating App Store provisioning profile…');
  const profile = (
    await asc('POST', '/v1/profiles', {
      data: {
        type: 'profiles',
        attributes: { name: `${BUNDLE_ID} AppStore ${new Date().toISOString().slice(0, 10)} ${crypto.randomBytes(2).toString('hex')}`, profileType: 'IOS_APP_STORE' },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id: bundle.id } },
          certificates: { data: [{ type: 'certificates', id: cert.id }] },
        },
      },
    })
  ).data;

  fs.mkdirSync(path.dirname(ENC_PATH), { recursive: true });
  fs.writeFileSync(
    ENC_PATH,
    encrypt({
      bundleId: BUNDLE_ID,
      certificateId: cert.id,
      certificateExpires: cert.attributes.expirationDate,
      profileId: profile.id,
      profileExpires: profile.attributes.expirationDate,
      p12: fs.readFileSync(p12).toString('base64'),
      p12Password,
      mobileprovision: profile.attributes.profileContent,
    }) + '\n'
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`Saved encrypted credentials to credentials/ios.enc (certificate expires ${cert.attributes.expirationDate}).`);
}

function restore() {
  need('ASC_KEY_P8');
  const c = decrypt(fs.readFileSync(ENC_PATH, 'utf8'));
  const dir = path.join(root, 'credentials', 'ios');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist.p12'), Buffer.from(c.p12, 'base64'));
  fs.writeFileSync(path.join(dir, 'profile.mobileprovision'), Buffer.from(c.mobileprovision, 'base64'));
  fs.writeFileSync(
    path.join(root, 'credentials.json'),
    JSON.stringify(
      {
        ios: {
          provisioningProfilePath: 'credentials/ios/profile.mobileprovision',
          distributionCertificate: { path: 'credentials/ios/dist.p12', password: c.p12Password },
        },
      },
      null,
      2
    )
  );
  console.log(`Restored signing credentials (profile expires ${c.profileExpires}).`);
}

async function appId() {
  need('ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8');
  const apps = (await asc('GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=5`)).data;
  const app = apps.find((a) => a.attributes.bundleId === BUNDLE_ID);
  if (!app) {
    console.error(
      `No App Store Connect app uses ${BUNDLE_ID} yet. Create it once at https://appstoreconnect.apple.com/apps (＋ → New App, platform iOS, bundle ID ${BUNDLE_ID}, any SKU), then re-run this workflow.`
    );
    process.exit(1);
  }
  process.stdout.write(app.id);
}

const cmd = process.argv[2];
const run = { bootstrap, restore, 'app-id': appId }[cmd];
if (!run) {
  console.error('usage: ios-credentials.mjs bootstrap|restore|app-id');
  process.exit(1);
}
await run();
