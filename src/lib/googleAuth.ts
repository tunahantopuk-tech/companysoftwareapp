/**
 * Firebase servis hesabıyla Google erişim jetonu üretir.
 *
 * NEDEN `firebase-admin` YOK: paket ~50 MB; Vercel sunucusuz fonksiyonunda
 * soğuk başlangıcı ciddi biçimde uzatıyor. Bize gereken yalnızca Firestore ve
 * Realtime Database'in REST uçları — onlar için tek ihtiyaç bir OAuth2 jetonu.
 * Jetonu servis hesabının anahtarıyla imzalanmış bir JWT karşılığında alıyoruz
 * (Web Crypto ile, ek bağımlılık olmadan).
 *
 * Gerekli ortam değişkeni (Vercel → Settings → Environment Variables):
 *   FIREBASE_SERVICE_ACCOUNT — Firebase Console'dan indirilen servis hesabı
 *                              JSON dosyasının TAMAMI (tek satır olması gerekmez)
 */

import { env } from './adminAuth';

export const PROJECT_ID = 'ifilm-app-6c7f0';
export const RTDB_URL =
  'https://ifilm-app-6c7f0-default-rtdb.europe-west1.firebasedatabase.app';

type ServisHesabi = { client_email: string; private_key: string; project_id?: string };

export function servisHesabi(): ServisHesabi | null {
  return servisHesabiTani().hesap;
}

/**
 * Neden çalışmadığını AYIRT EDEN sürüm.
 * "tanımlı değil" ile "tanımlı ama JSON bozuk" aynı mesajı verince
 * hangisi olduğunu anlamak mümkün olmuyordu.
 */
export function servisHesabiTani(): { hesap: ServisHesabi | null; sebep: string } {
  const ham = env('FIREBASE_SERVICE_ACCOUNT');
  if (!ham) {
    return {
      hesap: null,
      sebep:
        'FIREBASE_SERVICE_ACCOUNT ortam değişkeni sunucuya HİÇ ULAŞMADI. ' +
        'Vercel → Settings → Environments → Production → Environment Variables ' +
        'altında bu isimle bir kayıt var mı ve kaydettikten SONRA Redeploy ' +
        'yaptın mı? (Ortam değişkeni ancak yeni bir deploy ile devreye girer.)',
    };
  }

  // Elle yapıştırılırken en sık görülen iki kaza:
  //  (a) dosyanın ilk satırı olan tek başına "{" atlanıyor
  //  (b) son satırdaki "}" atlanıyor
  // Anahtar gizli olduğu için içeriği ekranda görüp düzeltmek zor; bu yüzden
  // burada onarmayı deniyoruz. Onarım işe yaramazsa gerçek hata raporlanır.
  const metin = ham.trim();
  const adaylar = [metin];
  if (!metin.startsWith('{')) adaylar.push('{' + metin);
  if (!metin.endsWith('}')) adaylar.push(metin + '}');
  if (!metin.startsWith('{') && !metin.endsWith('}')) adaylar.push('{' + metin + '}');

  let j: ServisHesabi | null = null;
  let sonHata: any = null;
  for (const aday of adaylar) {
    try { j = JSON.parse(aday) as ServisHesabi; break; } catch (e) { sonHata = e; }
  }

  try {
    if (!j) throw sonHata;
  } catch (e: any) {
    return {
      hesap: null,
      sebep:
        `Değişken TANIMLI (${ham.length} karakter) ama JSON olarak çözümlenemedi: ` +
        `${e?.message || e}. İndirdiğin .json dosyasının TAMAMINI, "{" ile başlayıp ` +
        `"}" ile biten hâliyle yapıştırdığından emin ol.`,
    };
  }

  if (!j.client_email || !j.private_key) {
    return {
      hesap: null,
      sebep:
        'JSON çözümlendi ama içinde client_email veya private_key yok. ' +
        'Yanlış dosya yapıştırılmış olabilir (bu, Firebase → Proje ayarları → ' +
        'Hizmet hesapları\'ndan inen anahtar dosyası olmalı).',
    };
  }

  // Vercel'e yapıştırırken satır sonları çoğu zaman "\n" metnine dönüşüyor.
  j.private_key = j.private_key.replace(/\\n/g, '\n');
  return { hesap: j, sebep: '' };
}

/** Jeton ~1 saat geçerli; sıcak fonksiyonda yeniden üretmemek için tutuyoruz. */
let onbellek: { token: string; bitis: number } | null = null;

function b64url(veri: ArrayBuffer | string): string {
  const bytes =
    typeof veri === 'string' ? new TextEncoder().encode(veri) : new Uint8Array(veri);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const govde = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const ham = atob(govde);
  const buf = new Uint8Array(ham.length);
  for (let i = 0; i < ham.length; i++) buf[i] = ham.charCodeAt(i);
  return buf.buffer;
}

const KAPSAM = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

/** Erişim jetonu döndürür; servis hesabı tanımlı değilse null. */
export async function erisimJetonu(): Promise<string | null> {
  const sa = servisHesabi();
  if (!sa) return null;

  const simdi = Math.floor(Date.now() / 1000);
  if (onbellek && onbellek.bitis - 60 > simdi) return onbellek.token;

  const baslik = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const govde = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: KAPSAM,
      aud: 'https://oauth2.googleapis.com/token',
      iat: simdi,
      exp: simdi + 3600,
    })
  );

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const imza = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${baslik}.${govde}`)
  );
  const jwt = `${baslik}.${govde}.${b64url(imza)}`;

  const yanit = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!yanit.ok) return null;

  const { access_token, expires_in } = (await yanit.json()) as {
    access_token: string;
    expires_in: number;
  };
  onbellek = { token: access_token, bitis: simdi + (expires_in || 3600) };
  return access_token;
}

// ── Firestore REST yardımcıları ────────────────────────────────────────────
//
// Firestore değerleri "typed value" biçiminde döner:
//   { stringValue: "..." } / { integerValue: "42" } / { booleanValue: true } …
// Panelde düz JSON istiyoruz, iki yönlü çeviriyoruz.

export function fsDegerOku(v: any): any {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsDegerOku);
  if ('mapValue' in v) return fsBelgeOku(v.mapValue.fields || {});
  return null;
}

export function fsBelgeOku(fields: Record<string, any>): Record<string, any> {
  const o: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) o[k] = fsDegerOku(v);
  return o;
}

export function fsDegerYaz(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  return { stringValue: String(v) };
}
