export interface RandomSource {
  fill(array: Uint8Array<ArrayBuffer>): void;
}

const browserRandomSource: RandomSource = {
  fill(array) {
    globalThis.crypto.getRandomValues(array);
  }
};

export function createActionId(randomSource: RandomSource = browserRandomSource): string {
  const bytes = new Uint8Array(new ArrayBuffer(16));
  randomSource.fill(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join("")
  ].join("-");
}
