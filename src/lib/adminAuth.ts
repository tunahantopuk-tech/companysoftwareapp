/**
 * Admin oturum doğrulama — SUNUCU tarafı.
 *
 * ⚠️ NEDEN VAR: Eski panel girişi `src/pages/admin/index.astro` içinde
 *    `username === 'admin' && password === 'admin123'` şeklinde TARAYICI
 *    JavaScript'indeydi. Sayfanın kaynağına bakan herkes şifreyi görüyordu.
 *    Panele yazma yetkisi (banner yayınlama, oyuncu verisi değiştirme,
 *    ileride ban) eklenmeden önce bunun kapatılması şarttı.
 *
 * ŞİMDİ: şifre yalnızca Vercel ortam değişkeninde durur, doğrulama sunucuda
 * yapılır, tarayıcıya yalnızca imzalı ve httpOnly bir çerez döner. Çerez
 * JavaScript'ten okunamaz ve içeriği kurcalanamaz (HMAC imzası).
 *
 * Gerekli ortam değişkenleri (Vercel → Settings → Environment Variables):
 *   ADMIN_PASSWORD  — panele giriş şifresi
 *   ADMIN_SECRET    — çerez imzalama anahtarı (uzun, rastgele bir dize)
 */

export const COOKIE_NAME = 'cs_admin';
const OTURUM_SURESI_SN = 60 * 60 * 8; // 8 saat

/**
 * Ortam değişkenini iki kaynaktan da okur.
 * Astro build sırasında `import.meta.env`, Vercel çalışma anında `process.env`
 * kullanabiliyor; ikisini de denemek "girdim ama çalışmıyor" durumunu önler.
 */
export function env(ad: string): string | undefined {
  const a = (import.meta as any).env?.[ad];
  if (a) return a as string;
  try {
    return (globalThis as any).process?.env?.[ad];
  } catch {
    return undefined;
  }
}

function secret(): string {
  const s = env('ADMIN_SECRET');
  if (!s) throw new Error('ADMIN_SECRET tanımlı değil');
  return s;
}

async function imzala(veri: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(veri));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Zamanlama saldırısına kapalı karşılaştırma. */
function esitMi(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let fark = 0;
  for (let i = 0; i < a.length; i++) fark |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return fark === 0;
}

/** Giriş başarılıysa çerez değeri üretir: "<bitiş>.<imza>" */
export async function oturumOlustur(): Promise<string> {
  const bitis = Math.floor(Date.now() / 1000) + OTURUM_SURESI_SN;
  const imza = await imzala(String(bitis));
  return `${bitis}.${imza}`;
}

/** Çerezi doğrular. Süresi geçmiş veya imzası bozuksa false. */
export async function oturumGecerliMi(cerez: string | undefined): Promise<boolean> {
  if (!cerez) return false;
  const [bitisStr, imza] = cerez.split('.');
  if (!bitisStr || !imza) return false;
  const bitis = Number(bitisStr);
  if (!Number.isFinite(bitis) || bitis < Math.floor(Date.now() / 1000)) return false;
  return esitMi(await imzala(bitisStr), imza);
}

/** İsteğin admin oturumu var mı? API route'larında ilk satır olarak kullanılır. */
export async function istekYetkiliMi(request: Request): Promise<boolean> {
  const ham = request.headers.get('cookie') || '';
  const parca = ham
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  return oturumGecerliMi(parca?.slice(COOKIE_NAME.length + 1));
}

/** Yetkisiz istek için standart yanıt. */
export function yetkisiz(): Response {
  return new Response(JSON.stringify({ error: 'Yetkisiz' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function cerezBasligi(deger: string, sil = false): string {
  const ortak = `${COOKIE_NAME}=${sil ? '' : deger}; Path=/; HttpOnly; SameSite=Strict; Secure`;
  return sil ? `${ortak}; Max-Age=0` : `${ortak}; Max-Age=${OTURUM_SURESI_SN}`;
}
