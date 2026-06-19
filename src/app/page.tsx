"use client";

import { useState } from "react";
import { APIProvider, Map, AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
import { Spot } from "@/lib/types";

interface StationInfo {
  name: string;
  lat: number;
  lng: number;
  formattedAddress: string;
}

export default function Home() {
  const [station, setStation] = useState("");
  const [theme, setTheme] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stationInfo, setStationInfo] = useState<StationInfo | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);

  const handleSearch = async () => {
    if (!station.trim() || !theme.trim()) {
      setError("駅名とテーマの両方を入力してください");
      return;
    }
    setLoading(true);
    setError(null);
    setSpots([]);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ station, theme }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "検索に失敗しました");
      setStationInfo(data.station);
      setSpots(data.spots);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  return (
    <main className="min-h-screen bg-[#F4F1EA] text-[#1A1F36]">
      {/* 駅看板風ヘッダー */}
      <header className="border-b-4 border-[#1A1F36] bg-[#1A1F36]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <div className="flex items-baseline gap-3">
            <span className="rounded-sm bg-[#E2542D] px-2 py-1 font-mono text-xs font-bold text-white">
              テーマ別
            </span>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-white">
              駅前スポット探索
            </h1>
          </div>
          <span className="hidden font-mono text-xs text-[#9AA3C2] sm:block">
            Maps × Places × LLM
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-10">
        {/* 検索パネル */}
        <div className="rounded-md border border-[#1A1F36]/15 bg-white p-6 shadow-sm">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-[#6B7094]">
                01 / 駅名
              </span>
              <input
                value={station}
                onChange={(e) => setStation(e.target.value)}
                placeholder="例: 渋谷"
                className="w-full border-b-2 border-[#1A1F36]/30 bg-transparent py-2 text-lg outline-none focus:border-[#E2542D]"
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-[#6B7094]">
                02 / テーマ
              </span>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="例: 静かに読書できるカフェ"
                className="w-full border-b-2 border-[#1A1F36]/30 bg-transparent py-2 text-lg outline-none focus:border-[#E2542D]"
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </label>
          </div>

          <button
            onClick={handleSearch}
            disabled={loading}
            className="mt-6 w-full rounded-sm bg-[#E2542D] py-3 font-bold text-white transition hover:bg-[#C8431F] disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {loading ? "検索中…" : "スポットを探す"}
          </button>

          {error && (
            <p className="mt-3 font-mono text-sm text-[#E2542D]">{error}</p>
          )}
        </div>

        {/* 地図 */}
        {stationInfo && mapsKey && (
          <div className="mt-8 h-80 overflow-hidden rounded-md border border-[#1A1F36]/15">
            <APIProvider apiKey={mapsKey}>
              <Map
                defaultCenter={{ lat: stationInfo.lat, lng: stationInfo.lng }}
                defaultZoom={15}
                mapId="spot-finder-map"
              >
                <AdvancedMarker
                  position={{ lat: stationInfo.lat, lng: stationInfo.lng }}
                >
                  <Pin background={"#1A1F36"} borderColor={"#1A1F36"} glyphColor={"#fff"} />
                </AdvancedMarker>
                {spots.map((s) => (
                  <AdvancedMarker key={s.id} position={{ lat: s.lat, lng: s.lng }}>
                    <Pin background={"#E2542D"} borderColor={"#C8431F"} glyphColor={"#fff"} />
                  </AdvancedMarker>
                ))}
              </Map>
            </APIProvider>
          </div>
        )}

        {/* 結果リスト */}
        {spots.length > 0 && (
          <ol className="mt-10 space-y-4">
            {spots.map((s, i) => (
              <li
                key={s.id}
                className="flex gap-4 rounded-md border border-[#1A1F36]/15 bg-white p-5"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#1A1F36] font-mono text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-serif text-lg font-bold">{s.name}</h2>
                    <span className="font-mono text-xs text-[#6B7094]">
                      類似度 {(s.similarity ?? 0).toFixed(3)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#3F4566]">{s.summary}</p>
                  <p className="mt-2 font-mono text-xs text-[#6B7094]">
                    ★ {s.rating ?? "—"} ({s.userRatingCount}件の口コミ) · {s.address}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
