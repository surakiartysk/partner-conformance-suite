// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { Home } from '../src/components/Home'
import type { Route } from '../src/route'
import { NOW, session } from './fixtures'

afterEach(cleanup)

function show(withSession: boolean) {
  const went: Route[] = []
  let started = 0
  render(
    <Home
      session={withSession ? session() : null}
      starting={false}
      problem={null}
      onStart={() => started++}
      onNavigate={(to) => went.push(to)}
      now={NOW}
    />,
  )
  return { went, started: () => started }
}

describe('what the buttons on Home do', () => {
  it('starts a session when there is none, and goes nowhere else', async () => {
    const { went, started } = show(false)
    await userEvent.click(screen.getByRole('button', { name: 'Try it →' }))
    expect(started()).toBe(1)
    expect(went).toEqual([])
  })

  it('goes on to Run, without starting a session, when there is one', async () => {
    const { went, started } = show(true)
    await userEvent.click(screen.getByRole('button', { name: 'Continue to Run →' }))
    expect(went).toEqual([{ page: 'run' }])
    expect(started()).toBe(0)
  })

  it('starts another session only when asked to, and not to Run', async () => {
    const { went, started } = show(true)
    await userEvent.click(screen.getByRole('button', { name: 'Start a new session instead' }))
    expect(started()).toBe(1)
    expect(went).toEqual([])
  })

  it('goes to the connection from its link, as a navigation within the page', async () => {
    const { went } = show(true)
    await userEvent.click(screen.getByRole('link', { name: 'See the connection' }))
    expect(went).toEqual([{ page: 'connection' }])
  })
})
