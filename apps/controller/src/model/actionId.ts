export function createActionId(): string {
  const host: { readonly randomUUID?: () => string } = globalThis.crypto;
  const randomUUID = host.randomUUID;
  if (randomUUID !== undefined) return randomUUID.call(globalThis.crypto);

  // `randomUUID` is secure-context only, and players reach the controller over
  // plain http on a LAN address, where `getRandomValues` is all that is left.
  // The server validates `actionId` as a UUID, so the v4 layout is mandatory.
  const bytes = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  const hex = bytes
    .map((byte, index) => {
      if (index === 6) return ((byte & 0x0f) | 0x40).toString(16).padStart(2, "0");
      if (index === 8) return ((byte & 0x3f) | 0x80).toString(16).padStart(2, "0");
      return byte.toString(16).padStart(2, "0");
    })
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
