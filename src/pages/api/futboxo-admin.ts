import type { APIRoute } from 'astro';
import { istekYetkiliMi, yetkisiz, env } from '../../lib/adminAuth';

export const prerender = false;

/**
 * Futboxo yönetim API'si — `public/futboxo/` altındaki yapılandırma dosyalarını
 * okur ve GitHub üzerinden günceller.
 *
 * NEDEN GITHUB: site statik (Astro + Vercel). Çalışma anında `public/` yazılamaz.
 * Dosyayı GitHub'a commit'lemek Vercel'de otomatik yeniden yayına yol açar
 * (~1 dk). Karşılığında: CDN hızı korunur, her değişiklik git geçmişinde durur
 * (yani ayrıca denetim kaydı tutmaya gerek kalmaz) ve yanlış bir değişiklik
 * tek komutla geri alınabilir.
 *
 * Gerekli ortam değişkeni:
 *   GITHUB_TOKEN — repo'ya yazma yetkisi olan Personal Access Token
 *   (yoksa API yalnızca OKUR; panel JSON'u kopyalaman için gösterir)
 */

const REPO = 'tunahantopuk-tech/companysoftwareapp';
const IZINLI: Record<string, string> = {
  config: 'public/futboxo/config.json',
  patch: 'public/futboxo/players-patch.json',
};

function json(veri: unknown, status = 200) {
  return new Response(JSON.stringify(veri), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function ghFetch(yol: string, init?: RequestInit) {
  const token = env('GITHUB_TOKEN');
  return fetch(`https://api.github.com/repos/${REPO}/contents/${yol}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'futboxo-admin',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
}

/** GET ?dosya=config|patch → dosyanın güncel içeriği */
export const GET: APIRoute = async ({ request, url }) => {
  if (!(await istekYetkiliMi(request))) return yetkisiz();

  const anahtar = url.searchParams.get('dosya') || 'config';
  const yol = IZINLI[anahtar];
  if (!yol) return json({ error: 'Bilinmeyen dosya' }, 400);

  // Canlı siteden oku — GitHub token'ı olmadan da çalışır.
  const canli = await fetch(`https://www.companysoftware.app/futboxo/${yol.split('/').pop()}`, {
    cache: 'no-store',
  });
  if (!canli.ok) return json({ error: 'Dosya okunamadı' }, 502);

  return json({
    dosya: anahtar,
    icerik: await canli.json(),
    yazilabilir: Boolean(env('GITHUB_TOKEN')),
  });
};

/** POST { dosya, icerik, mesaj } → GitHub'a commit'ler */
export const POST: APIRoute = async ({ request }) => {
  if (!(await istekYetkiliMi(request))) return yetkisiz();

  const token = env('GITHUB_TOKEN');
  if (!token) {
    return json(
      {
        error:
          'GITHUB_TOKEN tanımlı değil. Panel şu an salt-okunur. ' +
          'Değişikliği kaydetmek için JSON\'u kopyalayıp dosyaya elle yapıştırabilirsin.',
      },
      503
    );
  }

  let govde: { dosya?: string; icerik?: unknown; mesaj?: string };
  try {
    govde = await request.json();
  } catch {
    return json({ error: 'Geçersiz istek' }, 400);
  }

  const yol = IZINLI[govde.dosya || ''];
  if (!yol) return json({ error: 'Bilinmeyen dosya' }, 400);
  if (govde.icerik === undefined) return json({ error: 'İçerik boş' }, 400);

  // Mevcut dosyanın sha'sı gerekiyor (GitHub üzerine yazma için şart).
  const mevcut = await ghFetch(yol);
  if (!mevcut.ok) return json({ error: `GitHub okuma hatası (${mevcut.status})` }, 502);
  const { sha } = (await mevcut.json()) as { sha: string };

  const metin = JSON.stringify(govde.icerik, null, 1) + '\n';
  const b64 = Buffer.from(metin, 'utf-8').toString('base64');

  const yaz = await ghFetch(yol, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: govde.mesaj || `Futboxo: ${govde.dosya} güncellendi (admin panel)`,
      content: b64,
      sha,
      branch: 'main',
    }),
  });

  if (!yaz.ok) {
    const hata = await yaz.text();
    return json({ error: `GitHub yazma hatası (${yaz.status})`, detay: hata.slice(0, 300) }, 502);
  }

  const sonuc = (await yaz.json()) as { commit?: { sha?: string } };
  return json({
    ok: true,
    commit: sonuc.commit?.sha?.slice(0, 7) ?? '',
    not: 'Değişiklik yayına alınıyor — yaklaşık 1 dakika sürer.',
  });
};
