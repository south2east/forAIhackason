import Groq from "groq-sdk";
import { Spot, WalkAdvice, CourseStop } from "./types";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
const MODEL = "llama-3.3-70b-versatile";

const WALK_SPEED_M_PER_MIN = 70; // 平均的な徒歩速度(信号待ち等込みでやや控えめに設定)

/**
 * JSONのみを返すようLLMに指示し、コードフェンス等が混じった場合に備えて安全にパースする
 */
function safeParseJson<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
  return JSON.parse(cleaned) as T;
}

/**
 * 悩みの内容とスコア(0〜1)から、散歩のアドバイス(長さ・属性)を生成する
 */
export async function planWalk(
  worryText: string,
  worryScore: number
): Promise<WalkAdvice> {
  const prompt = `あなたは心優しいウォーキングセラピストです。
ユーザーが声で話した「悩み」と、声の特徴から推定した「悩みの大きさスコア(0〜1、1が最も大きい)」が与えられます。
これに基づいて、適切な散歩プランをJSON形式のみで出力してください。説明文やコードフェンスは一切含めないでください。

悩みの内容: 「${worryText}」
悩みの大きさスコア: ${worryScore.toFixed(2)}

出力JSON形式:
{
  "durationMinutes": 数値(10〜90の範囲。悩みが大きいほど長め、または短く集中できる散歩など適切に判断),
  "placeAttributes": ["属性1", "属性2", ...] (例: "公園", "緑が多い", "静かなカフェ", "川沿い", "人通りが少ない" など2〜4個),
  "reasoning": "このプランを薦める理由を日本語で2〜3文程度"
}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
    max_tokens: 400,
  });

  const text = completion.choices[0]?.message?.content ?? "{}";
  const parsed = safeParseJson<{
    durationMinutes: number;
    placeAttributes: string[];
    reasoning: string;
  }>(text);

  const durationMinutes = Math.min(90, Math.max(10, parsed.durationMinutes ?? 30));

  // 往復を想定し、半径 = (総距離の半分) / 2 程度に抑える(コースが現在地周辺に収まるように)
  const totalDistance = durationMinutes * WALK_SPEED_M_PER_MIN;
  const radiusMeters = Math.round(totalDistance / 3);

  return {
    durationMinutes,
    radiusMeters,
    placeAttributes: parsed.placeAttributes ?? [],
    reasoning: parsed.reasoning ?? "",
  };
}

/**
 * 悩み・アドバイス・候補スポット一覧から、順序付きの散歩コースを選定する
 */
export async function chooseCourse(
  worryText: string,
  advice: WalkAdvice,
  candidates: Spot[]
): Promise<{ stops: CourseStop[]; summary: string }> {
  const candidateList = candidates
    .map(
      (s, i) =>
        `${i}: ${s.name} | カテゴリ: ${s.types.slice(0, 3).join(",")} | 評価: ${
          s.rating ?? "?"
        }(${s.userRatingCount}件) | 住所: ${s.address}`
    )
    .join("\n");

  const prompt = `あなたは心優しいウォーキングセラピストです。
以下の情報をもとに、ユーザーに最適な散歩コースを考えてください。

悩みの内容: 「${worryText}」
散歩プラン: ${advice.durationMinutes}分程度、属性: ${advice.placeAttributes.join("、")}
プランの理由: ${advice.reasoning}

候補スポット一覧(インデックス: 情報):
${candidateList}

上記の候補から、悩みの内容や雰囲気に合いそうな2〜5件を選び、訪れる順番を考えて、JSON形式のみで出力してください。
説明文やコードフェンスは一切含めないでください。インデックスは必ず上記リストに存在するものを使ってください。

出力JSON形式:
{
  "stops": [
    { "index": 候補のインデックス番号, "reason": "この場所を選んだ理由(1文)" }
  ],
  "summary": "コース全体の一言まとめ・ユーザーへの優しいメッセージ(2〜3文)"
}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 600,
  });

  const text = completion.choices[0]?.message?.content ?? "{}";
  const parsed = safeParseJson<{
    stops: { index: number; reason: string }[];
    summary: string;
  }>(text);

  const stops: CourseStop[] = (parsed.stops ?? [])
    .map((s) => {
      const spot = candidates[s.index];
      if (!spot) return null;
      return {
        placeId: spot.id,
        name: spot.name,
        lat: spot.lat,
        lng: spot.lng,
        reason: s.reason ?? "",
      };
    })
    .filter((s): s is CourseStop => s !== null);

  return { stops, summary: parsed.summary ?? "" };
}
