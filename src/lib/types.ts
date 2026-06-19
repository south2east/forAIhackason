export interface Spot {
  id: string;
  name: string;
  address: string;
  rating: number | null;
  userRatingCount: number;
  lat: number;
  lng: number;
  types: string[];
  summary?: string;
  similarity?: number;
}

export interface SearchRequestBody {
  station: string;
  theme: string;
  radius?: number; // meters
  maxCandidates?: number; // Places APIから取得する件数
  topN?: number; // 最終的に返す件数
}
