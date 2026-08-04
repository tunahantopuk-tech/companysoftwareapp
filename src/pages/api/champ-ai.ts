import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';

// The Champ Manager — AI proxy.
// iOS uygulaması Anthropic anahtarını taşımaz; anahtar yalnızca burada durur.
// Sözleşme (AIAnalysisService.swift ile birebir):
//   istek : { prompt: string, maxTokens: number, mode?: string }
//   yanıt : { content: string }
export const prerender = false;

const MODEL_FAST = 'claude-haiku-4-5-20251001';
const MODEL_SMART = 'claude-sonnet-5';

// İstemciden gelen prompt'lar çıktı biçimini kendileri belirtiyor
// ("Sadece JSON döndür: ..."). Sistem mesajı bu yüzden biçime karışmaz,
// yalnızca rol ve dil disiplinini kurar.
const SYSTEM = `Sen "The Champ Manager" adlı Türkçe futbol menajerlik oyununun içerik motorusun.
Championship Manager geleneğinde, metin ve istatistik ağırlıklı bir oyun.

KURALLAR:
- Her zaman Türkçe yaz. Doğal, akıcı, futbol diline hâkim bir üslup kullan.
- Sana verilen oyuncu/takım isimlerini kullan; isim uydurma.
- Sana verilen verilerle çelişme; bilmediğin şeyi uydurma.
- Tekrara düşme; aynı kalıbı arka arkaya kullanma.
- Abartılı klişelerden kaçın ("efsanevi", "tarihi" gibi sözcükleri her cümlede kullanma).

BİÇİM:
- İstek belirli bir çıktı biçimi istiyorsa (örn. "Sadece JSON döndür") TAM OLARAK ona uy.
- JSON istendiyse ham JSON döndür: markdown kod bloğu (\`\`\`), açıklama, önsöz EKLEME.
- İstenen öğe sayısı belirtilmişse tam o sayıda öğe döndür.`;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Model seçimi: sık ve kısa çağrılar hızlı modele, zengin/seyrek olanlar
// güçlü modele. mode gelmezse token bütçesine göre makul bir varsayılan.
function modelFor(mode: unknown, maxTokens: number): string {
  switch (mode) {
    case 'scout':          // seyrek, nitelikli metin
    case 'takimRaporu':
    case 'tavsiyeOnbir':
      return MODEL_SMART;
    case 'macAnlatimi':    // maç başına bir kez, uzun ama hız önemli
    case 'brifing':
      return MODEL_FAST;
    default:
      return maxTokens >= 700 ? MODEL_FAST : MODEL_SMART;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const secret = request.headers.get('x-champ-secret');
  const expected = import.meta.env.CHAMP_SHARED_SECRET;
  if (!expected || secret !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return json({ error: 'ANTHROPIC_API_KEY eksik' }, 500);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Geçersiz JSON gövdesi' }, 400);
  }

  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return json({ error: 'prompt bos olamaz' }, 400);
  }
  // Kaçak maliyet koruması
  if (prompt.length > 12_000) {
    return json({ error: 'prompt cok uzun' }, 413);
  }

  const requested = Number(body?.maxTokens);
  const maxTokens = Number.isFinite(requested)
    ? Math.min(2000, Math.max(64, Math.floor(requested)))
    : 500;

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: modelFor(body?.mode, maxTokens),
      max_tokens: maxTokens,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
      .trim();

    // iOS tarafı { content: string } bekliyor
    return json({ content }, 200);
  } catch (err) {
    return json({ error: 'Anthropic hatasi', detail: String(err) }, 502);
  }
};
