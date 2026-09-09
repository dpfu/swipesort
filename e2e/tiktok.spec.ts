import { expect, test, type Page } from '@playwright/test'

const first = 'https://www.tiktok.com/@scout2015/video/6718335390845095173'
const second = 'https://www.tiktok.com/@example/video/6718335390845095174'

async function readSessions(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('swipesort'); r.onsuccess = () => resolve(r.result)
    })
    const data = await new Promise<unknown[]>((resolve) => {
      const r = db.transaction('sessions').objectStore('sessions').getAll()
      r.onsuccess = () => resolve(r.result)
    })
    db.close(); return data
  })
}

async function mockPlayers(page: Page, fail = false) {
  // Only the external player is stubbed. The real app, gestures, storage, and ZIP run normally.
  await page.route('https://www.tiktok.com/player/v1/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<html><body style="margin:0;background:#151515;color:white"><button style="padding:20px" onclick="this.textContent='Playing'">Play video</button><script>
      parent.postMessage({'x-tiktok-player':true,type:'${fail ? 'onPlayerError' : 'onPlayerReady'}',value:{errorCode:1001}},'*');
      </script></body></html>`,
  }))
}

async function addLinks(page: Page, text: string) {
  await page.getByText('Add TikTok links', { exact: true }).click()
  await page.getByLabel('TikTok video URLs').fill(text)
  await page.getByRole('button', { name: 'Add TikTok videos' }).click()
}

test('TikTok batch: validation, dedupe, touch swipe, resume, correction, replay and ZIP', async ({ page }, testInfo) => {
  await mockPlayers(page)
  await page.goto('/')
  await expect(page.getByLabel('Project name')).toBeVisible()
  await addLinks(page, `${first}\nhttps://example.com`)
  await expect(page.getByRole('alert')).toContainText('Line 2:')
  await expect(page.getByRole('button', { name: 'Start sorting' })).toBeDisabled()
  await page.getByLabel('TikTok video URLs').fill(`${first}?tracking=yes\n${second}\n${first}`)
  await page.getByRole('button', { name: 'Add TikTok videos' }).click()
  await expect(page.getByText('2 cards ready to sort')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('duplicate')
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByLabel('TikTok video URLs').fill(first)
  await page.getByRole('button', { name: 'Add TikTok videos' }).click()
  await expect(page.getByRole('status')).toContainText('already in this project')
  await page.reload()
  await expect(page.getByText('2 cards ready to sort')).toBeVisible()
  await page.getByRole('button', { name: 'Start sorting' }).click()
  await expect(page.locator('iframe')).toHaveAttribute('src', /player\/v1\/6718335390845095173\?/)
  // The iframe is interactive, not covered by a swipe-catching overlay.
  await page.frameLocator('iframe').getByRole('button', { name: 'Play video' }).click()
  await expect(page.frameLocator('iframe').getByRole('button', { name: 'Playing' })).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  // Real touch events on the dedicated handle, at a narrow mobile viewport.
  await page.setViewportSize({ width: 320, height: 700 })
  const handle = await page.getByTestId('tiktok-swipe-handle').boundingBox()
  if (!handle) throw new Error('Missing TikTok swipe handle')
  const client = await page.context().newCDPSession(page)
  const x = handle.x + handle.width / 2
  const y = handle.y + handle.height / 2
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let delta = 15; delta <= 135; delta += 15) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - delta, y }] })
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.locator('iframe')).toHaveAttribute('src', /player\/v1\/6718335390845095174\?/)
  await page.reload()
  await expect(page.locator('iframe')).toHaveAttribute('src', /player\/v1\/6718335390845095174\?/)
  await page.getByRole('button', { name: 'Undo last' }).click()
  await expect(page.locator('iframe')).toHaveAttribute('src', /player\/v1\/6718335390845095173\?/)
  await page.getByRole('button', { name: 'Sort into Category A' }).click()
  await expect(page.locator('iframe')).toHaveAttribute('src', /player\/v1\/6718335390845095174\?/)
  await page.getByRole('button', { name: 'Sort into Category B' }).click()
  await page.getByRole('button', { name: 'Review result' }).click()
  await page.getByRole('button', { name: 'Move TikTok @scout2015 · 5173 to Category B' }).click()
  await expect.poll(async () => JSON.stringify(await readSessions(page))).toContain('"corrections":[{')
  const before = await readSessions(page)
  await page.getByRole('button', { name: 'Replay original choices' }).click()
  await expect(page.locator('.ss-replay-card iframe')).toHaveAttribute('src', /6718335390845095173/)
  await page.getByRole('button', { name: 'Next choice' }).click()
  await page.getByRole('button', { name: 'Next choice' }).click()
  // The first assignment was undone, so replay retains both original attempts.
  await page.getByRole('button', { name: 'Next choice' }).click()
  await expect(page.locator('.ss-replay-card iframe')).toHaveAttribute('src', /6718335390845095174/)
  expect(await readSessions(page)).toEqual(before)
  await page.getByRole('button', { name: 'Back to result' }).click()
  await page.getByRole('button', { name: 'Setup', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloadPromise
  const zip = testInfo.outputPath('tiktok-project.zip')
  await download.saveAs(zip)
  await page.getByRole('button', { name: 'New project', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start sorting' })).toBeDisabled()
  await page.locator('input[accept=".zip,application/zip"]').setInputFiles(zip)
  await expect(page.getByText('2 cards ready to sort')).toBeVisible()
  expect(await readSessions(page)).toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('unavailable TikTok remains sortable and provides retry and source link', async ({ page }) => {
  await mockPlayers(page, true)
  await page.goto('/')
  await addLinks(page, first)
  await page.getByRole('button', { name: 'Start sorting' }).click()
  await expect(page.getByText(/TikTok could not play/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Open original/ })).toHaveAttribute('href', first)
  await page.getByRole('button', { name: 'Retry video' }).click()
  await expect(page.getByText(/TikTok could not play/)).toBeVisible()
  await page.getByRole('button', { name: 'Sort into Category A' }).click()
  await expect(page.getByRole('heading', { name: 'Every card has a place.' })).toBeVisible()
})


for (const viewport of [{ width: 320, height: 568 }, { width: 393, height: 650 }, { width: 844, height: 390 }]) {
  test(`video fits without crop or overlapping controls at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mockPlayers(page)
    await page.goto('/')
    await addLinks(page, first)
    await page.getByRole('button', { name: 'Start sorting' }).click()
    const frame = page.locator('iframe')
    await expect(frame).toHaveAttribute('src', /autoplay=1/)
    await expect(page.getByRole('button', { name: 'Sort into Category A' })).toHaveCount(1)
    await expect(page.locator('.ss-swipe-card__caption')).toHaveCount(0)
    const rect = await frame.boundingBox()
    const dock = await page.locator('.ss-sort__controls').boundingBox()
    const header = await page.locator('.ss-sort__header').boundingBox()
    expect(rect).not.toBeNull()
    expect(dock).not.toBeNull()
    expect(header).not.toBeNull()
    if (!rect || !dock || !header) return
    expect(rect.width / rect.height).toBeCloseTo(9 / 16, 2)
    expect(rect.height).toBeGreaterThan(viewport.height - 140)
    expect(rect.y).toBeGreaterThanOrEqual(header.y + header.height)
    expect(rect.y + rect.height).toBeLessThanOrEqual(dock.y)
    expect(dock.y + dock.height).toBeLessThanOrEqual(viewport.height)
    for (const button of await page.locator('main button').all()) {
      const box = await button.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }
    // HUD cannot intercept native player actions or accidentally sort a card.
    await page.frameLocator('iframe').getByRole('button', { name: 'Play video' }).click()
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)
  })
}
