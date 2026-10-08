import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Starts the whole thing the way a visitor meets it: the API Worker, the reference
 * partner behind its service binding, and the page the API Worker serves, on a
 * database that begins empty every time.
 *
 * Empty every time because a session start is limited to five an hour for one
 * address (decision 21), and a database that remembered would run out of them.
 * The secrets are made here if they are not already in the two `.dev.vars` files,
 * which git ignores: they are for a server on this machine and nothing else.
 */
const root = join(import.meta.dirname, '..', '..', '..')
const port = process.env.E2E_PORT ?? '8791'
const state = '../e2e/.state'

const api = join(root, 'packages/api/.dev.vars')
const partner = join(root, 'packages/partner/.dev.vars')
if (!existsSync(api) || !existsSync(partner)) {
  const token = randomBytes(16).toString('hex')
  writeFileSync(api, `PROVISION_TOKEN=${token}\nSECRET_KEY=${randomBytes(32).toString('base64')}\n`)
  writeFileSync(partner, `PROVISION_TOKEN=${token}\n`)
}

rmSync(join(root, 'packages/e2e/.state'), { recursive: true, force: true })

function run(args, cwd = root) {
  const result = spawnSync('pnpm', args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(['build:ui'])
const wrangler = ['--filter', '@conformance/api', 'exec', 'wrangler']
run([...wrangler, 'd1', 'migrations', 'apply', 'conformance-api', '--local', '--persist-to', state])
run([
  ...wrangler,
  'd1',
  'migrations',
  'apply',
  'points-partner',
  '--local',
  '-c',
  '../partner/wrangler.toml',
  '--persist-to',
  state,
])

const PARTNER_ORIGIN = 'https://points-partner.example'

const server = spawn(
  'pnpm',
  [
    ...wrangler,
    'dev',
    '-c',
    'wrangler.toml',
    '-c',
    '../partner/wrangler.toml',
    '--port',
    port,
    '--persist-to',
    state,
    // The address the page shows is part of what is tested, so it is fixed here
    // and does not follow the origin the deployment is configured with.
    '--var',
    `PARTNER_ORIGIN:${PARTNER_ORIGIN}`,
  ],
  { cwd: root, stdio: 'inherit' },
)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal))
server.on('exit', (code) => process.exit(code ?? 0))
