import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export const maxDuration = 30;

/**
 * フォームデータで音声ファイルを受け取り、Groq Whisperでテキスト化して返す。
 * リクエスト: multipart/form-data, フィールド名 "audio"
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: "audio フィールド(音声ファイル)が必要です" },
        { status: 400 }
      );
    }

    // groq-sdkはNode.jsのFile-like objectを期待するため変換
    const file = new File([audioFile], "audio.webm", {
      type: audioFile.type || "audio/webm",
    });

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
      language: "ja",
      response_format: "json",
    });

    return NextResponse.json({ text: transcription.text });
  } catch (err: any) {
    console.error("transcribe error:", err);
    return NextResponse.json(
      { error: err.message ?? "音声のテキスト化に失敗しました" },
      { status: 500 }
    );
  }
}
