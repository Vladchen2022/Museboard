export function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
