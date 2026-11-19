import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2'; // 384 dimensions, runs locally
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AiService {
  private extractor?: Promise<any>;

  constructor(private config: ConfigService) {}

  /** Loads the embedding model once. The first call downloads it (~25-90 MB). */
  private getExtractor() {
    if (!this.extractor) {
      this.extractor = import('@huggingface/transformers')
        .then(({ pipeline }) =>
          // cast avoids a "union type too complex" TypeScript error
          (pipeline as any)('feature-extraction', EMBED_MODEL),
        )
        .catch((err: unknown) => {
          this.extractor = undefined; // allow a retry
          throw err;
        });
    }
    return this.extractor;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const extractor = await this.getExtractor();
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 16) {
      const tensor = await extractor(texts.slice(i, i + 16), {
        pooling: 'mean',
        normalize: true,
      });
      out.push(...(tensor.tolist() as number[][]));
    }
    return out;
  }

  async generate(prompt: string, system?: string): Promise<string> {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.getOrThrow<string>('GROQ_API_KEY')}`,
      },
      body: JSON.stringify({
        model: this.config.get<string>('GROQ_MODEL') ?? 'openai/gpt-oss-120b',
        temperature: 0.3,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Groq request failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content?.trim() ?? '';
  }

  /** Streams tokens from Groq. Yields { token } pieces and, at the end, { usage }. */
  async *streamChat(
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<{ token?: string; usage?: number }> {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.getOrThrow<string>('GROQ_API_KEY')}`,
      },
      body: JSON.stringify({
        model: this.config.get<string>('GROQ_MODEL') ?? 'openai/gpt-oss-120b',
        temperature: 0.2,
        stream: true,
        messages,
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Groq request failed: ${res.status} ${await res.text()}`);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const token = json.choices?.[0]?.delta?.content;
          if (token) yield { token };
          const total =
            json.x_groq?.usage?.total_tokens ?? json.usage?.total_tokens;
          if (total) yield { usage: total };
        } catch {
          // ignore partial or non-JSON lines
        }
      }
    }
  }
}
