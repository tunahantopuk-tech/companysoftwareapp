import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';

// FiTT — Öğün fotoğrafı → kalori/makro tahmini (Claude vision).
// Anahtar env'de (ANTHROPIC_API_KEY). Uygulama erişimi FITT_SHARED_SECRET ile korunur.
export const prerender = false;

const SYSTEM = `Sen bir diyetisyensin. Sana bir yemek fotoğrafı verilir; görseldeki porsiyonu
tahmin edip kalori ve makro değerlerini gerçekçi biçimde hesaplarsın.
- Türkçe, kısa bir yemek adı ver.
- Değerler görünen porsiyon içindir; abartma, mantıklı ol.
- Emin değilsen confidence "low" ver.
- Görselde yemek yoksa calories=0 ver ve note alanında belirt.`;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Metinden ilk geçerli JSON nesnesini çıkarır (model bazen metne sarar).
function extractJson(text: string): any | null {
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const secret = request.headers.get('x-fitt-secret');
  const expected = import.meta.env.FITT_SHARED_SECRET;
  if (!expected || secret !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return json({ error: 'ANTHROPIC_API_KEY eksik' }, 500);
  }

  const { image, media_type, meal_type } = await request.json();
  if (!image) return json({ error: 'image alanı gerekli (base64)' }, 400);

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image },
            },
            {
              type: 'text',
              text:
                `Bu ${meal_type || 'öğün'} fotoğrafındaki yemeği analiz et. ` +
                `SADECE şu şemada geçerli JSON döndür, başka hiçbir metin ekleme: ` +
                `{"name": string, "calories": number, "protein_g": number, ` +
                `"carbs_g": number, "fat_g": number, ` +
                `"confidence": "low"|"medium"|"high", "note": string}`,
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text') as { text: string } | undefined;
    const parsed = extractJson(textBlock?.text || '');
    if (!parsed) return json({ error: 'Yanıt çözümlenemedi', raw: textBlock?.text || '' }, 502);
    return json(parsed, 200);
  } catch (err) {
    return json({ error: 'Anthropic hatası', detail: String(err) }, 502);
  }
};
