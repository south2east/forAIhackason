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

// ---- 散歩コース機能 ----

export interface WalkPlanRequestBody {
  lat: number;
  lng: number;
  worryText: string;
  worryScore: number; // 0〜1
}

export interface WalkAdvice {
  durationMinutes: number;
  radiusMeters: number;
  placeAttributes: string[]; // 例: ["公園", "静かなカフェ", "自然"]
  reasoning: string; // LLMの一言コメント
}

export interface CourseStop {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  reason: string; // この場所を選んだ理由(LLM生成)
}

export interface WalkCourse {
  stops: CourseStop[];
  summary: string; // コース全体の一言まとめ
  polyline?: string; // Routes APIから取得したエンコード済みポリライン
  distanceMeters?: number;
  durationSeconds?: number;
}

export interface WalkPlanResponse {
  advice: WalkAdvice;
  course: WalkCourse;
  candidateCount: number;
}
