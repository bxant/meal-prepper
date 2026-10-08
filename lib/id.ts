/** Local-only unique id generator (no accounts, no network, no dependencies). */
export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
