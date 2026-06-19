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
