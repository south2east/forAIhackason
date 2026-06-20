"use client";

import { useState, useRef, useCallback } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";
import {
  extractAudioFeatures,
  scoreFromFeatures,
  AudioFeatures,
} from "@/lib/audioFeatures";
import { decodePolyline } from "@/lib/polyline";
import { WalkPlanResponse } from "@/lib/types";

type Stage = "idle" | "baseline" | "worry" | "processing" | "done";

/** 地図上にRoutes APIのポリラインを描画するコンポーネント */
function RoutePolyline({ encoded }: { encoded: string }) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  if (map && !polylineRef.current && encoded) {
    const path = decodePolyline(encoded);
    polylineRef.current = new google.maps.Polyline({
      path,
      strokeColor: "#E2542D",
      strokeOpacity: 0.9,
      strokeWeight: 4,
      map,
    });
  }

  return null;
}

function useRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.start();
    mediaRecorderRef.current = recorder;
  }, []);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        resolve(new Blob());
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        recorder.stream.getTracks().forEach((t) => t.stop());
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  return { start, stop };
}

export default function WalkPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [baselineFeatures, setBaselineFeatures] = useState<AudioFeatures | null>(null);
  const [worryScore, setWorryScore] = useState<number | null>(null);
  const [worryText, setWorryText] = useState<string>("");
  const [result, setResult] = useState<WalkPlanResponse | null>(null);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const recorder = useRecorder();

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const handleStartRecording = async () => {
    setError(null);
    try {
      await recorder.start();
      setIsRecording(true);
    } catch (e: any) {
      setError("マイクへのアクセスが許可されていません: " + e.message);
    }
  };

  const handleStopBaseline = async () => {
    setIsRecording(false);
    const blob = await recorder.stop();
    try {
      const features = await extractAudioFeatures(blob);
      setBaselineFeatures(features);
      setStage("worry");
    } catch (e: any) {
      setError("音声の解析に失敗しました: " + e.message);
    }
  };

  const handleStopWorry = async () => {
    setIsRecording(false);
    setStage("processing");
    const blob = await recorder.stop();

    try {
      // 1. 特徴量抽出 & スコアリング
      const worryFeatures = await extractAudioFeatures(blob);
      const score = baselineFeatures
        ? scoreFromFeatures(baselineFeatures, worryFeatures)
        : 0.5;
      setWorryScore(score);

      // 2. Whisperでテキスト化
      const formData = new FormData();
      formData.append("audio", blob, "worry.webm");
      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });
      const transcribeData = await transcribeRes.json();
      if (!transcribeRes.ok) throw new Error(transcribeData.error);
      setWorryText(transcribeData.text);

      // 3. 現在地取得
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCurrentPos({ lat, lng });

      // 4. 散歩プラン生成
      const planRes = await fetch("/api/walk-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat,
          lng,
          worryText: transcribeData.text,
          worryScore: score,
        }),
      });
      const planData = await planRes.json();
      if (!planRes.ok) throw new Error(planData.error);

      setResult(planData);
      setStage("done");
    } catch (e: any) {
      setError(e.message ?? "処理中にエラーが発生しました");
      setStage("idle");
    }
  };

  const reset = () => {
    setStage("idle");
    setError(null);
    setBaselineFeatures(null);
    setWorryScore(null);
    setWorryText("");
    setResult(null);
    setCurrentPos(null);
  };

  return (
    <main className="min-h-screen bg-[#F4F1EA] text-[#1A1F36]">
      <header className="border-b-4 border-[#1A1F36] bg-[#1A1F36] px-6 py-5">
        <h1 className="mx-auto max-w-2xl font-serif text-2xl font-bold text-white">
          声で見つける、あなたのための散歩
        </h1>
      </header>

      <section className="mx-auto max-w-2xl px-6 py-10">
        {error && (
          <div className="mb-6 rounded-md border border-[#E2542D]/40 bg-[#E2542D]/10 p-4 font-mono text-sm text-[#E2542D]">
            {error}
          </div>
        )}

        {stage === "idle" && (
          <div className="rounded-md border border-[#1A1F36]/15 bg-white p-6">
            <h2 className="font-serif text-lg font-bold">ステップ1: 普段の声を録音</h2>
            <p className="mt-2 text-sm text-[#3F4566]">
              まず、声のクセを基準にするため「今日の調子はいかがですか」と
              普段通りのトーンで話してください。
            </p>
            <button
              onClick={async () => {
                await handleStartRecording();
                setStage("baseline");
              }}
              className="mt-4 rounded-sm bg-[#1A1F36] px-6 py-3 font-bold text-white"
            >
              録音開始
            </button>
          </div>
        )}

        {stage === "baseline" && (
          <div className="rounded-md border border-[#1A1F36]/15 bg-white p-6">
            <h2 className="font-serif text-lg font-bold">録音中…</h2>
            <p className="mt-2 text-sm text-[#3F4566]">
              「今日の調子はいかがですか」を話し終えたら停止してください。
            </p>
            <button
              onClick={handleStopBaseline}
              className="mt-4 rounded-sm bg-[#E2542D] px-6 py-3 font-bold text-white"
            >
              停止してベースライン確定
            </button>
          </div>
        )}

        {stage === "worry" && (
          <div className="rounded-md border border-[#1A1F36]/15 bg-white p-6">
            <h2 className="font-serif text-lg font-bold">ステップ2: 今の悩みを話す</h2>
            <p className="mt-2 text-sm text-[#3F4566]">
              今感じていること、悩んでいることを自由に話してください。
            </p>
            <button
              onClick={async () => {
                await handleStartRecording();
              }}
              className="mt-4 rounded-sm bg-[#1A1F36] px-6 py-3 font-bold text-white"
            >
              録音開始
            </button>
            {isRecording && (
              <button
                onClick={handleStopWorry}
                className="ml-3 mt-4 rounded-sm bg-[#E2542D] px-6 py-3 font-bold text-white"
              >
                停止して送信
              </button>
            )}
          </div>
        )}

        {stage === "processing" && (
          <div className="rounded-md border border-[#1A1F36]/15 bg-white p-6">
            <p className="font-mono text-sm">解析中… 散歩コースを考えています</p>
          </div>
        )}

        {stage === "done" && result && (
          <div className="space-y-6">
            <div className="rounded-md border border-[#1A1F36]/15 bg-white p-6">
              <p className="font-mono text-xs text-[#6B7094]">
                悩みの大きさスコア: {worryScore?.toFixed(2)} / 1.00
              </p>
              <p className="mt-1 text-sm italic text-[#3F4566]">「{worryText}」</p>
              <p className="mt-4 text-sm">{result.advice.reasoning}</p>
              <p className="mt-2 font-mono text-xs text-[#6B7094]">
                推奨散歩時間: 約{result.advice.durationMinutes}分 / 属性:{" "}
                {result.advice.placeAttributes.join("、")}
              </p>
            </div>

            <div className="rounded-md border border-[#1A1F36]/15 bg-white p-6">
              <h3 className="font-serif text-lg font-bold">おすすめコース</h3>
              <p className="mt-2 text-sm text-[#3F4566]">{result.course.summary}</p>
              <ol className="mt-4 space-y-3">
                {result.course.stops.map((s, i) => (
                  <li key={s.placeId} className="flex gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#1A1F36] font-mono text-xs text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-bold">{s.name}</p>
                      <p className="text-sm text-[#3F4566]">{s.reason}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {result.course.distanceMeters && (
                <p className="mt-3 font-mono text-xs text-[#6B7094]">
                  実測距離: 約{Math.round(result.course.distanceMeters / 100) / 10}km ・
                  徒歩時間: 約{Math.round((result.course.durationSeconds ?? 0) / 60)}分
                </p>
              )}
            </div>

            {currentPos && mapsKey && (
              <div className="h-96 overflow-hidden rounded-md border border-[#1A1F36]/15">
                <APIProvider apiKey={mapsKey}>
                  <Map
                    defaultCenter={currentPos}
                    defaultZoom={15}
                    mapId="walk-course-map"
                  >
                    <AdvancedMarker position={currentPos}>
                      <Pin background={"#1A1F36"} borderColor={"#1A1F36"} glyphColor={"#fff"} />
                    </AdvancedMarker>
                    {result.course.stops.map((s, i) => (
                      <AdvancedMarker key={s.placeId} position={{ lat: s.lat, lng: s.lng }}>
                        <Pin background={"#E2542D"} borderColor={"#C8431F"} glyphColor={"#fff"}>
                          <span>{i + 1}</span>
                        </Pin>
                      </AdvancedMarker>
                    ))}
                    {result.course.polyline && (
                      <RoutePolyline encoded={result.course.polyline} />
                    )}
                  </Map>
                </APIProvider>
              </div>
            )}

            <button
              onClick={reset}
              className="rounded-sm border border-[#1A1F36]/30 px-6 py-3 font-bold"
            >
              もう一度試す
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
