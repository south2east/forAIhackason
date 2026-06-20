import { CohereClient } from "cohere-ai";

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY! });

const EMBED_MODEL = "embed-multilingual-v3.0";

/**
 * Cohere SDKのバージョン差異を吸収するヘルパー。
 * embeddingTypesを指定すると { float: number[][] } 形式、
 * 指定しない/古いバージョンだと number[][] 形式で返ることがあるため両対応する。
 */
function extractFloatEmbeddings(res: any): number[][] {
  const embeddings = res?.embeddings;
  if (!embeddings) {
    throw new Error("Cohere APIから embeddings が返されませんでした");
  }
  if (Array.isArray(embeddings)) {
    return embeddings as number[][];
  }
  if (Array.isArray(embeddings.float)) {
    return embeddings.float as number[][];
  }
  throw new Error(
    `Cohere APIのレスポンス形式が想定外です: ${JSON.stringify(embeddings).slice(0, 200)}`
  );
}

/**
 * 複数テキストをまとめてベクトル化する (検索対象スポット用)
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await cohere.embed({
    texts,
    model: EMBED_MODEL,
    inputType: "search_document",
    embeddingTypes: ["float"],
  });
  return extractFloatEmbeddings(res);
}

/**
 * 検索クエリ(テーマ)をベクトル化する
 */
export async function embedQuery(text: string): Promise<number[]> {
  const res = await cohere.embed({
    texts: [text],
    model: EMBED_MODEL,
    inputType: "search_query",
    embeddingTypes: ["float"],
  });
  const embeddings = extractFloatEmbeddings(res);
  return embeddings[0];
}

/**
 * コサイン類似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
