import type { APIRoute } from 'astro';
import { oturumOlustur, cerezBasligi, istekYetkiliMi, env } from '../../lib/adminAuth';

export const prerender = false;

/** POST { password } → imzalı httpOnly oturum çerezi */
export const POST: APIRoute = async ({ request }) => {
  const beklenen = env('ADMIN_PASSWORD');
  if (!beklenen || !env('ADMIN_SECRET')) {
    return new Response(
      JSON.stringify({ error: 'Sunucu yapılandırılmamış: ADMIN_PASSWORD / ADMIN_SECRET eksik.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let sifre = '';
  try {
    sifre = ((await request.json()) as { password?: string }).password ?? '';
  } catch {
    return new Response(JSON.stringify({ error: 'Geçersiz istek' }), { status: 400 });
  }

  // Kaba kuvvet denemelerini yavaşlat (sabit gecikme).
  await new Promise((r) => setTimeout(r, 400));

  if (sifre !== beklenen) {
    return new Response(JSON.stringify({ error: 'Şifre hatalı' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cerezBasligi(await oturumOlustur()),
    },
  });
};

/** GET → oturum geçerli mi (panel sayfaları açılışta sorar) */
export const GET: APIRoute = async ({ request }) => {
  const yetkili = await istekYetkiliMi(request);
  return new Response(JSON.stringify({ authenticated: yetkili }), {
    status: yetkili ? 200 : 401,
    headers: { 'Content-Type': 'application/json' },
  });
};

/** DELETE → çıkış */
export const DELETE: APIRoute = async () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cerezBasligi('', true) },
  });
