import Groq from "groq-sdk";
import { Spot } from "./types";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

const MODEL = "llama-3.1-8b-instant";

/**
 * 1スポットの一言まとめを生成する
 */
async function summarizeSpot(spot: Spot): Promise<string> {
  const prompt = `以下のスポット情報を見て、どんな場所か一言(30文字程度の日本語)でまとめてください。説明文以外は出力しないでください。

名前: ${spot.name}
住所: ${spot.address}
評価: ${spot.rating ?? "不明"} (口コミ${spot.userRatingCount}件)
カテゴリ: ${spot.types.join(", ")}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 60,
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * 複数スポットを並列で要約する(Vercelのタイムアウト対策)
 */
export async function summarizeSpots(spots: Spot[]): Promise<Spot[]> {
  const results = await Promise.all(
    spots.map(async (spot) => {
      try {
        const summary = await summarizeSpot(spot);
        return { ...spot, summary };
      } catch (e) {
        console.error(`summarize failed for ${spot.name}`, e);
        return { ...spot, summary: "" };
      }
    })
  );
  return results;
}
