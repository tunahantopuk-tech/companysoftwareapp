import type { APIRoute } from 'astro';
import { istekYetkiliMi, yetkisiz } from '../../lib/adminAuth';
import {
  erisimJetonu,

  servisHesabiTani,
  PROJECT_ID,
  RTDB_URL,
  fsBelgeOku,
  fsDegerYaz,
} from '../../lib/googleAuth';

export const prerender = false;

/**
 * Futboxo kullanıcı yönetimi — çevrimiçi sayısı, oyuncu arama, ban, isim değiştirme.
 *
 * Firestore koleksiyonu: `futboxo_users` (belge kimliği = uid)
 * Realtime Database:     `/online/<uid>` → { username, ts }  (oyun yazar,
 *                        bağlantı kopunca onDisconnect ile kendini siler)
 *
 * Servis hesabı yoksa uçlar 503 döner ve panel "salt-okunur" uyarısı gösterir —
 * çökmez.
 */

const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function json(veri: unknown, status = 200) {
  return new Response(JSON.stringify(veri), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Belgeyi panelin beklediği düz biçime indirger. */
function oyuncuyaCevir(doc: any) {
  const f = fsBelgeOku(doc.fields || {});
  return {
    uid: String(doc.name || '').split('/').pop(),
    username: f.username ?? '',
    avatarId: f.avatarId ?? '',
    coins: f.coins ?? 0,
    totalPoints: f.totalPoints ?? 0,
    rankPoints: f.rankPoints ?? 0,
    isGuest: f.isGuest ?? false,
    banned: f.banned === true,
    banReason: f.banReason ?? '',
    createdAt: f.createdAt ?? null,
    lastLoginDate: f.lastLoginDate ?? null,
    updateTime: doc.updateTime ?? null,
  };
}

/** Çevrimiçi oyuncular — RTDB `/online` düğümü. */
async function cevrimiciler(token: string) {
  const r = await fetch(`${RTDB_URL}/online.json?access_token=${token}`, {
    cache: 'no-store',
  });
  if (!r.ok) return { sayi: 0, liste: [] as any[], hata: `RTDB ${r.status}` };

  const veri = (await r.json()) as Record<string, any> | null;
  if (!veri) return { sayi: 0, liste: [] as any[] };

  // Oyun bağlantı kopunca düğümü siliyor; yine de çökme/uçak modu gibi
  // durumlarda artık kayıt kalabiliyor — 5 dakikadan eskiyi saymıyoruz.
  const sinir = Date.now() - 5 * 60 * 1000;
  const liste = Object.entries(veri)
    .map(([uid, v]: [string, any]) => ({
      uid,
      username: v?.username ?? '',
      ts: Number(v?.ts ?? 0),
    }))
    .filter((x) => x.ts >= sinir)
    .sort((a, b) => b.ts - a.ts);

  return { sayi: liste.length, liste };
}

/**
 * GET ?q=arama       → isme göre oyuncu ara (en fazla 40)
 * GET ?mod=online    → çevrimiçi liste + sayı
 * GET ?mod=ozet      → toplam oyuncu + çevrimiçi + banlı sayısı
 */
export const GET: APIRoute = async ({ request, url }) => {
  if (!(await istekYetkiliMi(request))) return yetkisiz();

  const tani = servisHesabiTani();
  if (!tani.hesap) return json({ hazir: false, hata: tani.sebep }, 503);

  const token = await erisimJetonu();
  if (!token) return json({ hazir: false, hata: 'Google jetonu alınamadı' }, 502);

  const mod = url.searchParams.get('mod') || '';

  if (mod === 'online') return json({ hazir: true, ...(await cevrimiciler(token)) });

  if (mod === 'ozet') {
    const on = await cevrimiciler(token);
    // Toplam ve banlı sayısı için sayım toplaması (belgeleri indirmeden).
    const say = async (filtre: any) => {
      const r = await fetch(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runAggregationQuery`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            structuredAggregationQuery: {
              aggregations: [{ count: {}, alias: 'n' }],
              structuredQuery: {
                from: [{ collectionId: 'futboxo_users' }],
                ...(filtre ? { where: filtre } : {}),
              },
            },
          }),
        }
      );
      if (!r.ok) return null;
      const j = (await r.json()) as any[];
      return Number(j?.[0]?.result?.aggregateFields?.n?.integerValue ?? 0);
    };
    return json({
      hazir: true,
      toplam: await say(null),
      banli: await say({
        fieldFilter: {
          field: { fieldPath: 'banned' },
          op: 'EQUAL',
          value: { booleanValue: true },
        },
      }),
      cevrimici: on.sayi,
    });
  }

  const q = (url.searchParams.get('q') || '').trim();

  // Firestore'da "içinde geçen" araması yok; önek araması yapıyoruz
  // (username >= q ve username < q+). Panel ayrıca gelen listeyi
  // istemci tarafında süzüyor.
  const structuredQuery: any = {
    from: [{ collectionId: 'futboxo_users' }],
    limit: 40,
  };
  if (q) {
    structuredQuery.where = {
      compositeFilter: {
        op: 'AND',
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: 'username' },
              op: 'GREATER_THAN_OR_EQUAL',
              value: { stringValue: q },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: 'username' },
              op: 'LESS_THAN',
              value: { stringValue: q + '' },
            },
          },
        ],
      },
    };
    structuredQuery.orderBy = [{ field: { fieldPath: 'username' } }];
  } else {
    // Arama yoksa en yüksek puanlıları göster.
    structuredQuery.orderBy = [
      { field: { fieldPath: 'totalPoints' }, direction: 'DESCENDING' },
    ];
  }

  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!r.ok) {
    return json({ hazir: true, hata: `Firestore ${r.status}`, detay: (await r.text()).slice(0, 300) }, 502);
  }

  const satirlar = (await r.json()) as any[];
  const oyuncular = satirlar.filter((s) => s.document).map((s) => oyuncuyaCevir(s.document));

  const on = await cevrimiciler(token);
  const onSet = new Set(on.liste.map((x) => x.uid));
  return json({
    hazir: true,
    cevrimici: on.sayi,
    oyuncular: oyuncular.map((o) => ({ ...o, online: onSet.has(o.uid!) })),
  });
};

/**
 * POST { uid, islem: "ban" | "unban" | "rename", sebep?, yeniAd? }
 */
export const POST: APIRoute = async ({ request }) => {
  if (!(await istekYetkiliMi(request))) return yetkisiz();

  const taniPost = servisHesabiTani();
  if (!taniPost.hesap) return json({ hata: taniPost.sebep }, 503);
  const token = await erisimJetonu();
  if (!token) return json({ hata: 'Google jetonu alınamadı' }, 502);

  let g: { uid?: string; islem?: string; sebep?: string; yeniAd?: string };
  try {
    g = await request.json();
  } catch {
    return json({ hata: 'Geçersiz istek' }, 400);
  }
  if (!g.uid) return json({ hata: 'uid gerekli' }, 400);

  let alanlar: Record<string, any>;
  switch (g.islem) {
    case 'ban':
      alanlar = { banned: true, banReason: (g.sebep || '').slice(0, 200) };
      break;
    case 'unban':
      alanlar = { banned: false, banReason: '' };
      break;
    case 'rename': {
      const ad = (g.yeniAd || '').trim();
      if (ad.length < 3 || ad.length > 20) {
        return json({ hata: 'İsim 3-20 karakter olmalı' }, 400);
      }
      alanlar = { username: ad };
      break;
    }
    default:
      return json({ hata: 'Bilinmeyen işlem' }, 400);
  }

  const maske = Object.keys(alanlar)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(alanlar)) fields[k] = fsDegerYaz(v);

  const r = await fetch(`${FS}/futboxo_users/${encodeURIComponent(g.uid)}?${maske}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) {
    return json({ hata: `Firestore ${r.status}`, detay: (await r.text()).slice(0, 300) }, 502);
  }

  // Ban ise oyuncuyu çevrimiçi listesinden de düşür (oyun bir sonraki
  // açılışta zaten engellenecek, ama sayaç hemen doğru olsun).
  if (g.islem === 'ban') {
    await fetch(`${RTDB_URL}/online/${encodeURIComponent(g.uid)}.json?access_token=${token}`, {
      method: 'DELETE',
    }).catch(() => {});
  }

  return json({ ok: true, oyuncu: oyuncuyaCevir(await r.json()) });
};
