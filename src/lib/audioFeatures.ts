/**
 * クライアント側で録音した音声(Blob)から、
 * 音量(RMS)・基本周波数(ピッチ)・スペクトル重心(声色)を抽出するユーティリティ。
 *
 * 注意: これは厳密な音声心理学モデルではなく、
 * 「ベースラインからの相対的なズレ」を見るためのシンプルなヒューリスティックです。
 */

export interface AudioFeatures {
  rms: number; // 平均音量 (0〜1程度)
  pitchHz: number; // 推定基本周波数
  spectralCentroid: number; // スペクトル重心 (Hz) - 声色の明るさ/こもり具合の指標
  durationSec: number;
}

/**
 * BlobをAudioBufferにデコードする
 */
async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } finally {
    ctx.close();
  }
}

/**
 * 自己相関法によるシンプルなピッチ検出
 */
function detectPitch(samples: Float32Array, sampleRate: number): number {
  const minFreq = 70; // 人の声の下限くらい
  const maxFreq = 400;
  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.floor(sampleRate / minFreq);

  let bestLag = -1;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    for (let i = 0; i < samples.length - lag; i++) {
      correlation += samples[i] * samples[i + lag];
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag <= 0) return 0;
  return sampleRate / bestLag;
}

/**
 * FFT(簡易DFT)によるスペクトル重心の計算
 * パフォーマンスのため、ダウンサンプリングしたフレームに対して計算する
 */
function computeSpectralCentroid(samples: Float32Array, sampleRate: number): number {
  const N = 1024;
  const frame = samples.slice(0, Math.min(N, samples.length));
  const magnitudes: number[] = [];

  // 簡易DFT(N=1024程度なら許容範囲)
  for (let k = 0; k < frame.length / 2; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < frame.length; n++) {
      const angle = (-2 * Math.PI * k * n) / frame.length;
      re += frame[n] * Math.cos(angle);
      im += frame[n] * Math.sin(angle);
    }
    magnitudes.push(Math.sqrt(re * re + im * im));
  }

  let weightedSum = 0;
  let magnitudeSum = 0;
  for (let k = 0; k < magnitudes.length; k++) {
    const freq = (k * sampleRate) / frame.length;
    weightedSum += freq * magnitudes[k];
    magnitudeSum += magnitudes[k];
  }

  if (magnitudeSum === 0) return 0;
  return weightedSum / magnitudeSum;
}

/**
 * 録音したBlobから特徴量を抽出するメイン関数
 */
export async function extractAudioFeatures(blob: Blob): Promise<AudioFeatures> {
  const audioBuffer = await decodeAudioBlob(blob);
  const samples = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // RMS(音量)
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sumSquares / samples.length);

  // ピッチ・スペクトル重心は、無音区間を避けるため中央付近のフレームを使う
  const midStart = Math.floor(samples.length / 2 - sampleRate / 2);
  const midEnd = Math.floor(samples.length / 2 + sampleRate / 2);
  const midFrame = samples.slice(Math.max(0, midStart), Math.max(0, midEnd));

  const pitchHz = detectPitch(midFrame, sampleRate);
  const spectralCentroid = computeSpectralCentroid(midFrame, sampleRate);

  return {
    rms,
    pitchHz,
    spectralCentroid,
    durationSec: audioBuffer.duration,
  };
}

/**
 * ベースライン(普段の声)と悩み発話の特徴量から、0〜1の「悩みの大きさスコア」を算出する。
 *
 * 考え方:
 * - 声が小さくなる/大きくなる(極端な変化) → volumeDeviation
 * - ピッチが上がる(緊張・不安) → pitchShift
 * - スペクトル重心が変化する(声がこもる/かすれる) → centroidShift
 * 上記を正規化して重み付き合成し、0〜1にクリップする。
 */
export function scoreFromFeatures(
  baseline: AudioFeatures,
  worry: AudioFeatures
): number {
  const volumeDeviation = baseline.rms > 0
    ? Math.abs(worry.rms - baseline.rms) / baseline.rms
    : 0;

  const pitchShift = baseline.pitchHz > 0
    ? Math.abs(worry.pitchHz - baseline.pitchHz) / baseline.pitchHz
    : 0;

  const centroidShift = baseline.spectralCentroid > 0
    ? Math.abs(worry.spectralCentroid - baseline.spectralCentroid) / baseline.spectralCentroid
    : 0;

  // 重み付き合成(経験的な重み。今後チューニング可能)
  const raw =
    0.4 * clip01(volumeDeviation) +
    0.4 * clip01(pitchShift) +
    0.2 * clip01(centroidShift);

  return clip01(raw);
}

function clip01(x: number): number {
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
