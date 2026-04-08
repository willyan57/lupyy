/**
 * Tipos que não devem aparecer na central de notificações.
 * Crush silencioso não deve alertar o destinatário (nem push nem in-app).
 */
export const NOTIFICATION_TYPES_SUPPRESSED_IN_INBOX = new Set([
  "silent_crush",
  "mystery_interest", // legado / “alguém interessado” sem ser crush normal
]);

export function filterInboxNotifications<T extends { type: string }>(items: T[]): T[] {
  return items.filter((n) => !NOTIFICATION_TYPES_SUPPRESSED_IN_INBOX.has(n.type));
}
