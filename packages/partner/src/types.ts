import type { Behaviour } from './variants'

export interface Bindings {
  DB: D1Database
  /** Guards POST /_provision. Unset means provisioning is off. */
  PROVISION_TOKEN?: string
}

export interface Tenant {
  id: string
  secret: string
}

export interface Variables {
  behaviour: Behaviour
  tenant: Tenant
  /** The body exactly as received — what the signature covers. */
  rawBody: string
}

export interface Env {
  Bindings: Bindings
  Variables: Variables
}
