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
