import { Spot } from "./types";

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY!;

/**
 * 駅名(地名)を緯度経度に変換する (Geocoding API)
 */
export async function geocodeStation(
  station: string
): Promise<{ lat: number; lng: number; formattedAddress: string }> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", `${station}駅`);
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "jp");
  url.searchParams.set("key", GOOGLE_API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Geocoding API error: ${res.status}`);
  }
  const data = await res.json();

  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(
      `駅が見つかりませんでした: ${station} (status: ${data.status})`
    );
  }

  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
  };
}

/**
 * 散歩コース用: 現在地周辺のスポットを複数カテゴリにわたって収集する。
 * Places API Nearby Searchは1回の呼び出しでmaxResultCount<=20の制限があるため、
 * カテゴリ群を分割して複数回呼び出し、重複を除去して合算する。
 */
export async function searchWalkableSpots(
  lat: number,
  lng: number,
  radius: number
): Promise<Spot[]> {
  const typeGroups: string[][] = [
    ["cafe", "restaurant", "bakery"],
    ["park", "tourist_attraction", "museum"],
    ["convenience_store", "book_store", "florist"],
  ];

  const url = "https://places.googleapis.com/v1/places:searchNearby";
  const seen = new Map<string, Spot>();

  await Promise.all(
    typeGroups.map(async (includedTypes) => {
      const body = {
        languageCode: "ja",
        regionCode: "JP",
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius,
          },
        },
        includedTypes,
        rankPreference: "DISTANCE",
      };

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_API_KEY,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          console.error(`searchWalkableSpots error for ${includedTypes}:`, await res.text());
          return;
        }

        const data = await res.json();
        const places = data.places ?? [];
        for (const p of places) {
          if (!p.id || seen.has(p.id)) continue;
          seen.set(p.id, {
            id: p.id,
            name: p.displayName?.text ?? "(名称不明)",
            address: p.formattedAddress ?? "",
            rating: p.rating ?? null,
            userRatingCount: p.userRatingCount ?? 0,
            lat: p.location?.latitude,
            lng: p.location?.longitude,
            types: p.types ?? [],
          });
        }
      } catch (e) {
        console.error(`searchWalkableSpots fetch failed for ${includedTypes}:`, e);
      }
    })
  );

  return Array.from(seen.values()).slice(0, 50);
}

/**
 * Routes API (WALK) で、現在地 → 経由スポット群 → 現在地(往復)の徒歩ルートを計算する。
 * 戻り値: エンコード済みポリライン、距離(m)、所要時間(秒)
 */
export async function computeWalkingRoute(
  origin: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[]
): Promise<{ polyline: string; distanceMeters: number; durationSeconds: number }> {
  const url = "https://routes.googleapis.com/directions/v2:computeRoutes";

  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } }, // 往復(現在地に戻る)
    intermediates: waypoints.map((w) => ({
      location: { latLng: { latitude: w.lat, longitude: w.lng } },
    })),
    travelMode: "WALK",
    languageCode: "ja",
    units: "METRIC",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Routes API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) {
    throw new Error("Routes APIからルートが返されませんでした");
  }

  const durationSeconds = parseInt(
    String(route.duration ?? "0s").replace("s", ""),
    10
  );

  return {
    polyline: route.polyline?.encodedPolyline ?? "",
    distanceMeters: route.distanceMeters ?? 0,
    durationSeconds,
  };
}

/**
 * 指定座標周辺のスポットを検索する (Places API New - Nearby Search)
 */
export async function searchNearbySpots(
  lat: number,
  lng: number,
  radius: number,
  maxResultCount: number
): Promise<Spot[]> {
  const url = "https://places.googleapis.com/v1/places:searchNearby";

  const body = {
    languageCode: "ja",
    regionCode: "JP",
    maxResultCount: Math.min(maxResultCount, 20), // Places APIの上限は20
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius,
      },
    },
    // 観光・飲食・カフェなどを中心に。必要に応じて調整可能。
    includedTypes: [
      "tourist_attraction",
      "restaurant",
      "cafe",
      "park",
      "museum",
      "shopping_mall",
      "bar",
    ],
    rankPreference: "POPULARITY",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Places API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const places = data.places ?? [];

  const spots: Spot[] = places.map((p: any) => ({
    id: p.id,
    name: p.displayName?.text ?? "(名称不明)",
    address: p.formattedAddress ?? "",
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? 0,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    types: p.types ?? [],
  }));

  return spots;
}
