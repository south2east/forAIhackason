import { NextRequest, NextResponse } from "next/server";
import { geocodeStation, searchNearbySpots } from "@/lib/google";
import { summarizeSpots } from "@/lib/groq";
import { embedTexts, embedQuery, cosineSimilarity } from "@/lib/cohere";
import { SearchRequestBody, Spot } from "@/lib/types";

export const maxDuration = 60; // Vercel Pro想定。Hobbyの場合は10に制限されます。

export async function POST(req: NextRequest) {
  try {
    const body: SearchRequestBody = await req.json();
    const {
      station,
      theme,
      radius = 1000,
      maxCandidates = 20,
      topN = 5,
    } = body;

    if (!station || !theme) {
      return NextResponse.json(
        { error: "station と theme は必須です" },
        { status: 400 }
      );
    }

    // 1. 駅名 -> 座標
    const { lat, lng, formattedAddress } = await geocodeStation(station);

    // 2. 周辺スポット検索
    let spots: Spot[] = await searchNearbySpots(
      lat,
      lng,
      radius,
      maxCandidates
    );

    if (spots.length === 0) {
      return NextResponse.json({
        station: { name: station, lat, lng, formattedAddress },
        spots: [],
      });
    }

    // 3. 口コミ数でソート(降順)
    spots = spots.sort((a, b) => b.userRatingCount - a.userRatingCount);

    // 4. LLM(Groq)で各スポットの一言まとめを生成(並列)
    spots = await summarizeSpots(spots);

    // 5. スポットをベクトル化(要約文をベースに)
    const textsToEmbed = spots.map(
      (s) => `${s.name}: ${s.summary || s.types.join(", ")}`
    );
    const spotEmbeddings = await embedTexts(textsToEmbed);

    // 6. テーマをベクトル化し、コサイン類似度を計算
    const themeEmbedding = await embedQuery(theme);
    spots = spots.map((s, i) => ({
      ...s,
      similarity: cosineSimilarity(spotEmbeddings[i], themeEmbedding),
    }));

    // 7. 類似度で降順ソートし上位N件を抽出
    const topSpots = spots
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      .slice(0, topN);

    return NextResponse.json({
      station: { name: station, lat, lng, formattedAddress },
      spots: topSpots,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message ?? "検索中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
