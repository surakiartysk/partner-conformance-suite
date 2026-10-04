/**
 * The reference partner's versions, each reached under its own path prefix.
 *
 * `correct` implements the spec. The others each carry exactly one bug, so a
 * red case points at one cause. A closed list: anything else is a 404, and the
 * suite builds the URL from this list rather than from what a browser sends.
 */
export const VARIANTS = ['correct'] as const

export type Variant = (typeof VARIANTS)[number]

export function isVariant(value: string): value is Variant {
  return (VARIANTS as readonly string[]).includes(value)
}
