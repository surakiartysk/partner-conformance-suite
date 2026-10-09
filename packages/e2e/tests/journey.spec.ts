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
  await page.getByRole('button', { name: 'Try it' }).click()
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
  // The lanes do not begin against the buttons above them.
  const buttons = (await page.getByRole('button', { name: 'Open the result' }).boundingBox())!
  const lanes = (await page.locator('.lanes').boundingBox())!
  expect(
    lanes.y - (buttons.y + buttons.height),
    'space between the buttons and the lanes',
  ).toBeGreaterThanOrEqual(12)
  // Every status is whole, inside its lane: three lanes side by side once cut them off.
  const clipped = await page.locator('.lane .row .st').evaluateAll((badges) =>
    badges
      .filter((badge) => {
        const lane = badge.closest('.lane')!.getBoundingClientRect()
        return badge.getBoundingClientRect().right > lane.right - 1
      })
      .map((badge) => badge.textContent),
  )
  expect(clipped, 'statuses cut off at the edge of their lane').toEqual([])
  await expect(page.getByText('✕ 1 failed')).toBeVisible()
  await expect(page.locator('.note', { hasText: 'Points given back.' })).toBeVisible()
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
  // Expected is laid out line for line with Actual: what this step does not check (type, memberId,
  // points of the earn answer) is said, in words, beside it, and is not marked red.
  await expect(act.locator('.matcher', { hasText: 'not checked' })).toHaveCount(3)
  await expect(act.locator('.ln.bad .matcher', { hasText: 'not checked' })).toHaveCount(0)
  const panes = await act
    .locator('.two .json')
    .evaluateAll((pres) => pres.map((p) => p.querySelectorAll('.ln').length))
  expect(panes[0], 'both panes have the same number of lines').toBe(panes[1])
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
  await page.getByRole('button', { name: 'Run again' }).click()
  // The radio itself is drawn as nothing; what a visitor presses is its label.
  await page.locator('label.vopt', { hasText: /^correct/ }).click()
  await expect(page.getByRole('radio', { name: /^correct/ })).toBeChecked()
  await page.getByRole('button', { name: 'Run 20 cases' }).click()
  await expect(page.getByRole('heading', { name: 'All 20 cases passed' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.locator('.note', { hasText: 'Points given back.' })).toBeVisible()
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
  await expect(page.locator('.note', { hasText: 'Points given back.' })).toBeVisible()
})

test('before a run both choices are on the screen side by side, and the run bar is within reach', async () => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/run')
  const versions = (await page.getByRole('heading', { name: 'Partner version' }).boundingBox())!
  const cases = (await page.getByRole('heading', { name: 'Cases' }).boundingBox())!
  expect(cases.x, 'the cases sit to the right of the versions').toBeGreaterThan(versions.x + 300)
  expect(Math.abs(cases.y - versions.y), 'and level with them').toBeLessThan(8)
  const bar = (await page.locator('.run-bar').boundingBox())!
  expect(bar.y + bar.height, 'the run bar is on the screen without scrolling').toBeLessThanOrEqual(
    800,
  )
  const tall = await page
    .locator('.vgrid .vopt')
    .evaluateAll((chips) =>
      chips.filter((c) => c.getBoundingClientRect().height > 46).map((c) => c.textContent),
    )
  expect(tall, 'version names that wrap onto a second line').toEqual([])
  const form = (await page.locator('form.run-form').boundingBox())!
  expect(form.height, 'the whole form is shorter than it was').toBeLessThan(800)
})

test('each page has its own title, and moving to it puts the focus on its heading', async () => {
  await page.goto('/run')
  await expect(page).toHaveTitle('Run · Partner conformance suite')
  await page.getByRole('link', { name: 'History' }).click()
  await expect(page).toHaveTitle('History · Partner conformance suite')
  await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeFocused()
  await page.getByRole('link', { name: 'Connection' }).click()
  await expect(page).toHaveTitle('Connection · Partner conformance suite')
  await expect(page.getByRole('heading', { name: 'Connection', level: 1 })).toBeFocused()
})

test('when a run ends it is said, for someone who cannot see the page', async () => {
  await page.goto('/run')
  const status = page.locator('.sr-only[role="status"]')
  await expect(status).toHaveText('')
  await page.getByRole('button', { name: 'None' }).click()
  await page.getByRole('button', { name: 'Show the earn cases' }).click()
  await page
    .getByRole('checkbox', { name: /Earning twice with one reference adds the points once/ })
    .check()
  await page.getByRole('button', { name: 'Run 1 case' }).click()
  await expect(status).toHaveText(/^1 of 1 case did not pass\. Points given back\./, {
    timeout: 60_000,
  })
  // Said, and not drawn: once it has words in it, it is still no wider than a pixel.
  const said = (await status.boundingBox())!
  expect(said.width, 'what is only said is not drawn').toBeLessThanOrEqual(1)
})

test('the page says it is a demo, on the page and beside the sample partner, and links to how it works', async () => {
  await page.goto('/run')
  await expect(
    page.getByText('Demo: this site tests a built-in sample partner, not your API.'),
  ).toBeVisible()
  await expect(page.locator('.demo-chip')).toHaveText('Demo')
  await expect(page.getByText('not your system')).toBeVisible()
  await expect(page.getByText(/Planted bugs, one in each/)).toBeVisible()
})

test('the way back to the last run is on the Run page, and opens it', async () => {
  await page.goto('/run')
  const link = page.locator('.last-run a')
  await expect(link).toBeVisible()
  await expect(page.locator('.last-run')).toContainText(
    'Every run is kept for this session under History',
  )
  await link.click()
  await expect(page).toHaveURL(/\/runs\/run_[0-9a-f]+$/)
})

test('how it works shows the run as a picture and as steps, and the spec it links to can be read', async () => {
  await page.goto('/')
  await page.getByRole('link', { name: 'How it works', exact: true }).first().click()
  await expect(page).toHaveTitle('How it works · Partner conformance suite')
  await expect(page.getByRole('heading', { name: 'How it works', level: 1 })).toBeFocused()
  const diagram = page.locator('svg.dg')
  await expect(diagram).toBeVisible()
  expect(
    (await diagram.boundingBox())!.width,
    'the picture uses the width of the page',
  ).toBeGreaterThan(500)
  await expect(page.locator('.steps li')).toHaveCount(4)
  const spec = await page.request.get('/openapi.yaml')
  expect(spec.status()).toBe(200)
  expect(spec.headers()['content-type']).toContain('text/plain')
  expect(await spec.text()).toMatch(/^openapi: 3\.1\.0/)
})

test('on a phone how it works leaves the picture out and keeps the steps, and nothing scrolls sideways', async ({
  browser,
}) => {
  const phone = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
    storageState: await context.storageState(),
  })
  const small = await phone.newPage()
  await small.goto('/how-it-works')
  await expect(small.getByRole('heading', { name: 'How it works', level: 1 })).toBeVisible()
  await expect(small.locator('svg.dg')).toBeHidden()
  await expect(small.locator('.steps li')).toHaveCount(4)
  expect(
    await small.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0)
  await phone.close()
})

test('the version select on the Connection page draws its own arrow, with room for it', async () => {
  await page.goto('/connection')
  const select = page.locator('select').first()
  const style = await select.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      appearance: cs.appearance,
      pad: parseFloat(cs.paddingRight),
      image: cs.backgroundImage,
    }
  })
  expect(style.appearance).toBe('none')
  expect(style.pad).toBeGreaterThanOrEqual(28)
  expect(style.image).toContain('linear-gradient')
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
    .locator('.vopt, .gname, .crow, .fold')
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

/** Every group of cases unfolded, so what is checked is the whole form and not only its folded face. */
async function openEveryGroup() {
  // Pressing one changes which are still closed, so the first of those is pressed until none is.
  const closed = page.locator('.fold[aria-expanded="false"]')
  while ((await closed.count()) > 0) await closed.first().click()
}

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious accessibility violations on any page, in ${scheme} mode`, async () => {
    await page.emulateMedia({ colorScheme: scheme })
    const pages = [
      '/',
      '/connection',
      '/how-it-works',
      '/run',
      '/history',
      resultUrl,
      `${resultUrl}/cases/earn/adds-points`,
    ]
    for (const path of pages) {
      await page.goto(path)
      await expect(page.locator('h1').first()).toBeVisible()
      if (path === '/run') await openEveryGroup()
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
