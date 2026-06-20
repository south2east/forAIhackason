import { NextRequest, NextResponse } from "next/server";
import { searchWalkableSpots, computeWalkingRoute } from "@/lib/google";
import { planWalk, chooseCourse } from "@/lib/groqWalk";
import { WalkPlanRequestBody, WalkPlanResponse } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body: WalkPlanRequestBody = await req.json();
    const { lat, lng, worryText, worryScore } = body;

    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !worryText ||
      typeof worryScore !== "number"
    ) {
      return NextResponse.json(
        { error: "lat, lng, worryText, worryScore は必須です" },
        { status: 400 }
      );
    }

    // 1. LLM①: 悩み内容+スコア → 散歩プラン(長さ・属性)
    const advice = await planWalk(worryText, worryScore);

    // 2. 現在地周辺のスポットを多めに収集(最大50件)
    const candidates = await searchWalkableSpots(lat, lng, advice.radiusMeters);

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "周辺にスポットが見つかりませんでした。半径を広げてみてください。" },
        { status: 404 }
      );
    }

    // 3. LLM②: 悩み+プラン+候補スポット → 順序付きコース選定
    const { stops, summary } = await chooseCourse(worryText, advice, candidates);

    if (stops.length === 0) {
      return NextResponse.json(
        { error: "コースを選定できませんでした。もう一度試してください。" },
        { status: 500 }
      );
    }

    // 4. Routes APIで実際の徒歩ルート(往復)を計算
    let polyline: string | undefined;
    let distanceMeters: number | undefined;
    let durationSeconds: number | undefined;

    try {
      const route = await computeWalkingRoute(
        { lat, lng },
        stops.map((s) => ({ lat: s.lat, lng: s.lng }))
      );
      polyline = route.polyline;
      distanceMeters = route.distanceMeters;
      durationSeconds = route.durationSeconds;
    } catch (e) {
      console.error("computeWalkingRoute failed:", e);
      // ルート計算に失敗してもスポット情報自体は返す(地図上はピンのみ表示にフォールバック)
    }

    const response: WalkPlanResponse = {
      advice,
      course: { stops, summary, polyline, distanceMeters, durationSeconds },
      candidateCount: candidates.length,
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("walk-plan error:", err);
    return NextResponse.json(
      { error: err.message ?? "散歩プランの生成中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
