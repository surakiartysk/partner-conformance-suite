import { expect, test } from '@playwright/test'

/**
 * Last, because it uses up the five session starts an hour that one address gets.
 * The server's database starts empty each time, so this does not leave the next
 * run short.
 */
test('a sixth session from one address is refused, and the page says so', async ({
  browser,
  playwright,
  baseURL,
}) => {
  // Their own cookie jar: a session started through the page's would be the page's session.
  const api = await playwright.request.newContext({ baseURL })
  const context = await browser.newContext()
  const page = await context.newPage()
  const statuses: number[] = []
  // The journey made one; the limit is five.
  for (let i = 0; i < 6; i++) {
    const response = await api.post('/api/sessions')
    statuses.push(response.status())
    if (response.status() === 429) break
  }
  expect(statuses.at(-1)).toBe(429)
  expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(5)

  await page.goto('/')
  await page.getByRole('button', { name: 'Try it →' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Too many sessions have been started from this address')
  await expect(alert).toContainText('60 min')
  await context.close()
  await api.dispose()
})
