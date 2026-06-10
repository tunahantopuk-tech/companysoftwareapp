import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const { title, description, projectName, platform } = await request.json();

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return new Response(JSON.stringify({ error: 'API key eksik. .env dosyasına ANTHROPIC_API_KEY ekleyin.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Sen bir yazılım geliştirme asistanısın. Aşağıdaki görev için Claude Code'un anlayacağı, uygulamaya hazır, detaylı bir prompt hazırla.

Proje: ${projectName}
Platform: ${platform || 'Mobil/Web'}
Görev Başlığı: ${title}
Kısa Açıklama: ${description}

Promptu şu formatta hazırla:
- Ne yapılması gerektiğini net ve teknik olarak açıkla
- Hangi dosyalar/ekranlar etkilenecek
- Dikkat edilmesi gereken edge case'ler
- Varsa UI/UX beklentileri
- Kod kalitesi gereksinimleri

Sadece promptu yaz, başka açıklama ekleme. Türkçe yaz.`,
      },
    ],
  });

  const prompt = (message.content[0] as { type: string; text: string }).text;

  return new Response(JSON.stringify({ prompt }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
