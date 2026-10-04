export interface Bindings {
  DB: D1Database
  /** The reference partner. Every request to a partner goes through this. */
  PARTNER: Fetcher
  PARTNER_ORIGIN: string
  PROVISION_TOKEN?: string
  SECRET_KEY?: string
}

export interface Session {
  id: string
  tenant: string
  secret: string
  member_a: string
  member_b: string
  secret_revealed_at: number | null
  created_at: number
  expires_at: number
}

export interface Env {
  Bindings: Bindings
  Variables: { session: Session }
}
