/** Points as a person reads them: 1,100. */
export const points = (value: number) => value.toLocaleString('en-US')

/**
 * How long until a session ends, rounded down to the minute: "23 h 41 min",
 * "12 min", or "ended".
 */
export function timeLeft(expiresAt: string, now: number = Date.now()): string {
  const minutes = Math.floor((Date.parse(expiresAt) - now) / 60_000)
  if (!(minutes > 0)) return 'ended'
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`
}

/**
 * How long ago something was, in the largest unit that fits: "just now", "5 min ago",
 * "3 h ago", "2 d ago". A time in the future, or one that cannot be read, is "just now"
 * rather than a negative number.
 */
export function ago(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000)
  if (!(minutes >= 1)) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}
