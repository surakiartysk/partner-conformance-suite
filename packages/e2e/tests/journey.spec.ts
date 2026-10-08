import AxeBuilder from '@axe-core/playwright'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

/**
 * A visitor's path through the page, in a real browser, against the real Workers
 * and the real reference partner. What these catch is what the unit tests cannot
 * see: a layout, a policy refusing a font, a button below the fold.
 *
 * They run in order and share one session, because a session start is limited to
 * five an hour for one address.
 */
test.describe.configure({ mode: 'serial' })

let context: BrowserContext
let page: Page
let resultUrl = ''

/** Everything the browser complained about, across the whole path. */
const complaints: string[] = []

// The page asks whether there is a session before there is one, and the API says 401
// (decision 21). That one line in the console is expected and nothing else is.
const EXPECTED = /Failed to load resource: the server responded with a status of 401/

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext()
  page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error' && !EXPECTED.test(message.text()))
      complaints.push(message.text())
  })
  page.on('pageerror', (error) => complaints.push(`page error: ${error.message}`))
})

test.afterAll(async () => {
  await context.close()
})

test('the way in leads to a session and its connection', async () => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Partner conformance suite' })).toBeVisible()
  await page.getByRole('button', { name: 'Try it →' }).click()
  await expect(page).toHaveURL(/\/connection$/)
  await expect(page.getByRole('heading', { name: 'Connection' })).toBeVisible()
})

test('the connection shows the partner and both members at 1,000, and the secret once', async () => {
  await expect(page.locator('[aria-label="Address"]')).toContainText(
    /^https:\/\/points-partner\.example\/correct\/t-/,
  )
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(2)
  for (const row of await rows.all()) await expect(row).toContainText('1,000')

  await page.getByRole('button', { name: 'Show the secret once' }).click()
  await expect(page.locator('[aria-label="Signing secret"]')).toContainText(/^whsec_/)

  await page.reload()
  await expect(page.getByText('It has been shown once.')).toBeVisible()
  await expect(page.getByText(/whsec_/)).toHaveCount(0)
})

test('a version that is wrong in one way is found, and the run ends', async () => {
  await page.getByRole('link', { name: 'Run', exact: true }).click()
  await expect(page.getByRole('radio', { name: /double-earn/ })).toBeChecked()
  await page.getByRole('button', { name: 'Run 20 cases' }).click()
  await expect(page.getByRole('button', { name: 'Open the result' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('heading', { name: '1 of 20 cases did not pass' })).toBeVisible()
  await expect(page.getByText('✓ 19 passed')).toBeVisible()
  await expect(page.getByText('✕ 1 failed')).toBeVisible()
  await expect(page.getByText('Points given back.')).toBeVisible()
})

test('the result shows what did not match, with the request and the answer beside what was expected', async () => {
  await page.getByRole('button', { name: 'Open the result' }).click()
  await expect(page).toHaveURL(/\/runs\/run_[0-9a-f]+$/)
  resultUrl = page.url()

  const detail = page.getByRole('article')
  await expect(
    detail.getByRole('heading', { name: 'Earning twice with one reference adds the points once' }),
  ).toBeVisible()
  await expect(detail.getByText(/Act · repeat: transactionId should be/)).toBeVisible()
  await expect(
    detail.getByText(/Act · repeat: balance should be balance at start \+ 100/),
  ).toBeVisible()
  // The act step is open, with the request it sent, Expected and Actual side by side, and the
  // lines that disagreed marked. The setup above it is closed.
  const act = detail.locator('.step', { hasText: 'Act · repeat' })
  await expect(act.getByText('Request body')).toBeVisible()
  await expect(act.getByRole('heading', { name: 'Expected' })).toBeVisible()
  await expect(act.getByRole('heading', { name: 'Actual' })).toBeVisible()
  await expect(act.locator('.ln.bad').first()).toBeVisible()
  await expect(act.locator('.matcher', { hasText: 'balance at start + 100' })).toBeVisible()
  await expect(detail.locator('details.setup')).not.toHaveAttribute('open', '')

  // The list of cases is a list of lines, not a column of single letters: each is as wide
  // as the list itself. (It once was not, and no unit test could see it.)
  const items = page.getByRole('navigation', { name: 'Cases' }).locator('.it')
  expect(await items.count()).toBe(20)
  for (const item of await items.all()) {
    expect((await item.boundingBox())!.width).toBeGreaterThan(250)
  }

  await expect(page.getByRole('heading', { name: /What was wrong with double-earn/ })).toBeVisible()
  await expect(page.getByText('The other 19 cases pass a partner with this bug.')).toBeVisible()
})

test('the right version passes everything, and says so', async () => {
  await page.getByRole('button', { name: 'Run another version' }).click()
  await page.getByRole('radio', { name: /^correct/ }).check()
  await page.getByRole('button', { name: 'Run 20 cases' }).click()
  await expect(page.getByRole('heading', { name: 'All 20 cases passed' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByText('Points given back.')).toBeVisible()
})

test('the history lists both runs, newest first, and opens one', async () => {
  await page.getByRole('link', { name: 'History' }).click()
  const rows = page.locator('.run-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('correct')
  await expect(rows.nth(0)).toContainText('All 20 passed')
  await expect(rows.nth(1)).toContainText('double-earn')
  await expect(rows.nth(1)).toContainText('1 failed')

  await rows.nth(1).click()
  await expect(page).toHaveURL(resultUrl)
  await expect(page.getByRole('heading', { name: '1 of 20 cases did not pass' })).toBeVisible()
})

test('a case can be opened by its address, and survives a reload', async () => {
  const caseUrl = `${resultUrl}/cases/earn/adds-points`
  await page.goto(caseUrl)
  await expect(page.getByRole('article').getByRole('heading', { level: 2 })).toHaveText(
    'Earning adds exactly the points earned',
  )
  await expect(page.getByText('Everything this case checks matched.')).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(caseUrl)
  await expect(page.getByRole('article').getByRole('heading', { level: 2 })).toHaveText(
    'Earning adds exactly the points earned',
  )
})

test('a page that does not exist says so', async () => {
  await page.goto('/nowhere')
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
})

test('one case can be picked, and only that case is run', async () => {
  await page.getByRole('link', { name: 'Run', exact: true }).click()
  await page.getByRole('button', { name: 'None' }).click()
  await expect(page.getByText('0 of 20 chosen')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run 0 cases' })).toBeDisabled()

  // The groups start folded: no case is on the page until its group is opened.
  await expect(page.getByText('Earning twice with one reference adds the points once')).toHaveCount(
    0,
  )
  await page.getByRole('button', { name: 'Show the earn cases' }).click()
  await page
    .getByRole('checkbox', { name: /Earning twice with one reference adds the points once/ })
    .check()
  await page.getByRole('button', { name: 'Hide the earn cases' }).click()
  await expect(page.getByText('1 of 4')).toBeVisible() // earn, folded, still says what is chosen
  await expect(page.getByText('1 of 20 chosen')).toBeVisible()
  // Its group is partly chosen, which the box shows as neither on nor off.
  const group = page.getByRole('checkbox', { name: /^earn\b/ })
  expect(await group.evaluate((box: HTMLInputElement) => box.indeterminate)).toBe(true)

  await page.getByRole('button', { name: 'Run 1 case' }).click()
  await expect(page.getByRole('button', { name: 'Open the result' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByText('✕ 1 failed')).toBeVisible()
  await expect(page.getByText(/Passed/)).toHaveCount(0)
  await expect(page.getByText(/Failed/).first()).toBeVisible()
  await expect(page.getByText('Points given back.')).toBeVisible()
})

test('on a phone nothing scrolls sideways, and the Run button is on the screen and big enough to press', async ({
  browser,
}) => {
  // A touch screen, so the page's rule for fingers applies; a narrow window with a mouse is not one.
  const phone = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
    storageState: await context.storageState(),
  })
  const small = await phone.newPage()
  small.on('console', (message) => {
    if (message.type() === 'error' && !EXPECTED.test(message.text()))
      complaints.push(message.text())
  })
  for (const path of [
    '/',
    '/connection',
    '/run',
    '/history',
    resultUrl,
    `${resultUrl}/cases/earn/adds-points`,
  ]) {
    await small.goto(path)
    await expect(small.locator('h1').first()).toBeVisible()
    const wide = await small.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(wide, `${path} is wider than the screen by ${wide}px`).toBeLessThanOrEqual(0)
  }
  await small.goto('/run')
  const button = small.getByRole('button', { name: /^Run \d+ cases$/ })
  await expect(button).toBeVisible()
  const box = (await button.boundingBox())!
  expect(box.y + box.height, 'the button is below the fold').toBeLessThanOrEqual(812)
  expect(box.height).toBeGreaterThanOrEqual(44)
  // And everything a finger has to hit: versions, groups, cases and the buttons that fold them.
  for (const fold of await small.locator('.fold').all()) await fold.click()
  const heights = await small
    .locator('.opt, .fold')
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height))
  expect(heights.length).toBeGreaterThan(40)
  expect(Math.min(...heights), 'a row is too small to press').toBeGreaterThanOrEqual(44)
  const widths = await small
    .locator('.fold')
    .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().width))
  expect(widths).toHaveLength(5)
  expect(Math.min(...widths), 'a fold button is too narrow to press').toBeGreaterThanOrEqual(44)
  await phone.close()
})

test('with a mouse the controls are 40 px, and a narrow window does not make them 44', async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/run')
  const box = (await page.getByRole('button', { name: /^Run \d+ cases$/ }).boundingBox())!
  expect(box.height).toBe(40)
  await page.setViewportSize({ width: 1280, height: 800 })
})

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious accessibility violations on any page, in ${scheme} mode`, async () => {
    await page.emulateMedia({ colorScheme: scheme })
    const pages = [
      '/',
      '/connection',
      '/run',
      '/history',
      resultUrl,
      `${resultUrl}/cases/earn/adds-points`,
    ]
    for (const path of pages) {
      await page.goto(path)
      await expect(page.locator('h1').first()).toBeVisible()
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(
        serious.map(
          (v) => `${v.id}: ${v.help} (${v.nodes.length} nodes, e.g. ${v.nodes[0]?.target})`,
        ),
        `${path} in ${scheme} mode`,
      ).toEqual([])
    }
  })
}

test('the browser complained about nothing along the way', () => {
  expect(complaints).toEqual([])
})
