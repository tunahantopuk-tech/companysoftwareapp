import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';

// FiTT — Koç (Claude). Goggins system prompt + güvenlik sınırları burada tutulur.
// Model: kısa/motivasyon → Haiku; plan/analiz → Sonnet.
export const prerender = false;

const MODEL_FAST = 'claude-haiku-4-5-20251001';
const MODEL_SMART = 'claude-sonnet-5';

const SYSTEM_BASE = `Sen sert, tavizsiz ama sınırlarını bilen bir kişisel antrenör ve diyetisyensin.
Türkçe konuşursun. Tonun David Goggins gibi: doğrudan, sert, bahane kabul etmeyen,
disiplin ve tutarlılık üzerine baskı yapan.

KİŞİLİK KURALLARI:
- Sertliğin HEDEFİ: tembellik, bahaneler, atlanan hedefler, tutarsızlık.
- Sertliğin HEDEFİ ASLA: kişinin değeri, vücudu, görünümü değildir. Aşağılama,
  vücut utandırma, hakaret YOK. "Bahaneye acıma, insana saygı."
- Kısa, vurucu, spesifik ol; verilere dayan. Klişe değil.
- Zafer varsa hakkını ver ama rehavete izin verme.

GÜVENLİK SINIRLARI (tartışılmaz):
- Haftada 0.5-1 kg'dan hızlı kilo kaybı önerme/teşvik etme.
- Günlük kaloriyi kişinin güvenli tabanının altına indirme.
- Aşırı/riskli diyet, öğün atlama zorlaması, "aç kal" tarzı tavsiye YASAK.
- Tıbbi/klinik tavsiye vermezsin. Sağlık sorunu, ağrı, aşırı yorgunluk ya da anormal
  kilo değişimi işareti görürsen: tonu yumuşat, kullanıcıyı doktora/diyetisyene yönlendir.
- Asla teşhis koyma.

FORMAT:
- Motivasyon/nudge: 1-3 cümle, sert ve net.
- Öğün/antrenman planı: madde madde, uygulanabilir, kaloriyle.
- Haftalık rapor: kısa karne + gelecek hafta için net hedef.`;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function contextBlock(ctx: any): string {
  if (!ctx) return '';
  const lines = [
    'VERİ BAĞLAMI (bu kullanıcıya özel, güncel):',
    `- Ad: ${ctx.name || '-'}`,
    `- Başlangıç/hedef/güncel kilo: ${ctx.startWeight}/${ctx.targetWeight}/${ctx.currentWeight} kg`,
    `- Günlük kalori hedefi: ${ctx.dailyCalorieTarget} kcal`,
    `- Bugün: alınan ${ctx.consumedToday ?? 0} kcal, yakılan ${ctx.burnedToday ?? 0} kcal, adım ${ctx.steps ?? 0}`,
    `- Seri (streak): ${ctx.streak ?? 0} gün`,
  ];
  if (ctx.recentSummary) lines.push(`- ${ctx.recentSummary}`);
  return lines.join('\n');
}

function planFor(mode: string): { model: string; max_tokens: number; instruction: string | null } {
  switch (mode) {
    case 'motivation':
      return { model: MODEL_FAST, max_tokens: 300, instruction: 'Kullanıcıya günün sabah motivasyon mesajını ver. 1-3 cümle, sert ve net, verilerine dayan.' };
    case 'nudge':
      return { model: MODEL_FAST, max_tokens: 200, instruction: 'Kullanıcı bugün hedefinin gerisinde. Kısa, sert bir uyarı ver. 1-2 cümle.' };
    case 'meal':
      return { model: MODEL_SMART, max_tokens: 700, instruction: 'Kullanıcıya bugünkü kalori hedefine ve makrolarına uygun bir öğün önerisi ver. Madde madde, kaloriyle, uygulanabilir.' };
    case 'workout':
      return { model: MODEL_SMART, max_tokens: 700, instruction: 'Kullanıcıya bugün için uygun bir antrenman öner. Madde madde, süre/set ile, seviyesine uygun.' };
    case 'report':
      return { model: MODEL_SMART, max_tokens: 700, instruction: 'Kullanıcının haftalık karnesini çıkar ve gelecek hafta için tek net hedef ver. Verilerine dayan, sert ama adil.' };
    case 'chat':
    default:
      return { model: MODEL_FAST, max_tokens: 500, instruction: null };
  }
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

  const { mode, context, messages } = await request.json();
  const plan = planFor(mode);
  const system = `${SYSTEM_BASE}\n\n${contextBlock(context)}`;

  const msgs =
    mode === 'chat' && Array.isArray(messages) && messages.length
      ? messages
          .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
          .map((m: any) => ({ role: m.role, content: String(m.content) }))
      : [{ role: 'user' as const, content: plan.instruction || 'Kısa bir motivasyon ver.' }];

  if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'user') {
    msgs.push({ role: 'user', content: 'Devam et.' });
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: plan.model,
      max_tokens: plan.max_tokens,
      system,
      messages: msgs,
    });

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
      .trim();

    return json({ text }, 200);
  } catch (err) {
    return json({ error: 'Anthropic hatası', detail: String(err) }, 502);
  }
};
