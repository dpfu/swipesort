import { expect, test, type Locator, type Page } from '@playwright/test'
import path from 'node:path'

const DEMO_TITLES = [
  'Blue hour',
  'Soft horizon',
  'Signal',
  'Open window',
  'After rain',
  'Warm current',
] as const

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function startDemo(
  page: Page,
  categories: readonly [string, string] = ['Archive', 'Keep'],
) {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Make two choices feel clear.' }),
  ).toBeVisible()

  await page.getByLabel('Project name').fill('Field notes')
  await page.getByLabel('Swipe left').fill(categories[0])
  await page.getByLabel('Swipe right').fill(categories[1])
  await page.getByRole('button', { name: 'Try demo set' }).click()

  await expect(page.getByText('6 cards in this sort')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start sorting' })).toBeEnabled()
  await page.getByRole('button', { name: 'Start sorting' }).click()
  await expectActiveCard(page, DEMO_TITLES[0], 1)
}

async function expectActiveCard(
  page: Page,
  title: string,
  ordinal: number,
  total = DEMO_TITLES.length,
) {
  await expect(page.getByTestId('swipe-card')).toHaveAttribute(
    'aria-label',
    `Sort ${title}`,
  )
  await expect(page.getByRole('progressbar', { name: 'Sorting progress' })).toHaveAttribute(
    'aria-valuenow',
    String(ordinal - 1),
  )
  await expect(page.getByRole('progressbar', { name: 'Sorting progress' })).toHaveAttribute(
    'aria-valuemax',
    String(total),
  )
}

async function dragActiveCard(page: Page, deltaX: number) {
  const card = page.getByTestId('swipe-card')
  const box = await card.boundingBox()
  if (!box) throw new Error('The active swipe card has no bounding box')

  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + deltaX, startY, { steps: 12 })
  return card
}

async function translatedX(card: Locator) {
  return card.evaluate((element) => {
    const transform = getComputedStyle(element).transform
    return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41
  })
}

async function swipe(page: Page, direction: 'left' | 'right') {
  const card = await dragActiveCard(page, direction === 'left' ? -150 : 150)
  await expect
    .poll(() => translatedX(card), { message: `card follows the ${direction} drag` })
    [direction === 'left' ? 'toBeLessThan' : 'toBeGreaterThan'](
      direction === 'left' ? -90 : 90,
    )
  await page.mouse.up()
}

async function storedSessions(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('swipesort')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const sessions = await new Promise<unknown[]>((resolve, reject) => {
      const request = database
        .transaction('sessions', 'readonly')
        .objectStore('sessions')
        .getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    database.close()
    return sessions
  })
}

test('mobile golden path: gesture feedback, undo, correction, and read-only replay', async ({
  page,
}) => {
  await startDemo(page)

  const card = await dragActiveCard(page, 42)
  await expect
    .poll(() => translatedX(card), { message: 'card follows a sub-threshold drag' })
    .toBeGreaterThan(24)
  await expect
    .poll(
      () =>
        page
          .locator('.ss-destination--right')
          .evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity)),
      { message: 'right category becomes visible while dragging' },
    )
    .toBeGreaterThan(0.2)
  await page.mouse.up()

  await expect
    .poll(async () => Math.abs(await translatedX(card)), {
      message: 'an undecided gesture springs back to the center',
    })
    .toBeLessThan(1)
  await expectActiveCard(page, DEMO_TITLES[0], 1)

  await swipe(page, 'left')
  await expectActiveCard(page, DEMO_TITLES[1], 2)
  await swipe(page, 'right')
  await expectActiveCard(page, DEMO_TITLES[2], 3)

  await page.getByRole('button', { name: 'Undo last' }).click()
  await expectActiveCard(page, DEMO_TITLES[1], 2)

  await page.getByRole('button', { name: 'Sort into Keep' }).click()
  await expectActiveCard(page, DEMO_TITLES[2], 3)
  await page.keyboard.press('ArrowLeft')
  await expectActiveCard(page, DEMO_TITLES[3], 4)
  await page.getByRole('button', { name: 'Sort into Keep' }).click()
  await expectActiveCard(page, DEMO_TITLES[4], 5)
  await page.getByRole('button', { name: 'Sort into Archive' }).click()
  await expectActiveCard(page, DEMO_TITLES[5], 6)
  await page.getByRole('button', { name: 'Sort into Keep' }).click()

  await expect(
    page.getByRole('heading', { name: 'The result, still open to correction.' }),
  ).toBeVisible()
  const archiveTab = page.getByRole('tab').filter({ hasText: 'Archive' })
  const keepTab = page.getByRole('tab').filter({ hasText: 'Keep' })
  await expect(archiveTab).toContainText('3')
  await expect(keepTab).toContainText('3')

  await page.getByRole('button', { name: 'Move Blue hour to Keep' }).click()
  await expect(archiveTab).toContainText('2')
  await expect(keepTab).toContainText('4')
  await expect
    .poll(async () => {
      const sessions = (await storedSessions(page)) as Array<{
        corrections?: unknown[]
      }>
      return sessions[0]?.corrections?.length ?? 0
    })
    .toBe(1)
  const sessionBeforeReplay = await storedSessions(page)

  await page.setViewportSize({ width: 320, height: 700 })
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true)

  await page.getByRole('button', { name: 'Replay session' }).click()
  await expect(page.getByRole('heading', { name: 'Replay' })).toBeVisible()
  await expect(page.getByText('Read-only · corrections are not shown here')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true)

  const replayPosition = page.getByLabel('Replay position')
  const replayCard = page.locator('.ss-replay-card')
  await expect(replayPosition).toHaveValue('0')
  await expect(replayCard).toContainText('Blue hour')
  await expect(replayCard).toContainText('Ready to begin')

  await page.getByRole('button', { name: 'Next replay step' }).click()
  await expect(replayPosition).toHaveValue('1')
  await expect(replayCard).toContainText('Blue hour')
  await expect(replayCard).toContainText('Archive')

  await page.getByRole('button', { name: 'Play replay' }).click()
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible()
  await expect
    .poll(async () => Number(await replayPosition.inputValue()))
    .toBeGreaterThan(1)
  await page.getByRole('button', { name: 'Pause replay' }).click()

  const lastReplayStep = await replayPosition.getAttribute('max')
  if (!lastReplayStep) throw new Error('Replay position has no maximum')
  await replayPosition.fill(lastReplayStep)
  await expect(replayCard).toContainText('Warm current')
  await expect(replayCard).toContainText('Keep')
  await page.getByRole('button', { name: 'Previous replay step' }).click()
  await expect(replayCard).toContainText('After rain')

  await page.getByRole('button', { name: 'Back to results' }).click()
  await expect(archiveTab).toContainText('2')
  await expect(keepTab).toContainText('4')
  await expect.poll(() => storedSessions(page)).toEqual(sessionBeforeReplay)
})

test('an in-progress sort resumes on the exact card after reload', async ({ page }) => {
  await startDemo(page, ['No', 'Yes'])

  await page.getByRole('button', { name: 'Sort into No' }).click()
  await expectActiveCard(page, DEMO_TITLES[1], 2)
  await page.getByRole('button', { name: 'Sort into Yes' }).click()
  await expectActiveCard(page, DEMO_TITLES[2], 3)

  await page.addInitScript(() => {
    const state = window as typeof window & {
      __swipeSortFalseCompletionSeen?: boolean
    }
    state.__swipeSortFalseCompletionSeen = false
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        const inspect = () => {
          if (document.body?.textContent?.includes('Every card has a place.')) {
            state.__swipeSortFalseCompletionSeen = true
          }
        }
        new MutationObserver(inspect).observe(document.body, {
          childList: true,
          subtree: true,
        })
        inspect()
      },
      { once: true },
    )
  })
  await page.reload()
  await expectActiveCard(page, DEMO_TITLES[2], 3)
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & {
          __swipeSortFalseCompletionSeen?: boolean
        }).__swipeSortFalseCompletionSeen,
    ),
  ).toBe(false)
  await expect(page.getByRole('button', { name: 'Undo last' })).toBeEnabled()

  await page.getByRole('button', { name: 'Leave sort' }).click()
  await expect(
    page.getByRole('heading', { name: 'Make two choices feel clear.' }),
  ).toBeVisible()
  await expect(page.getByText('2 of 6 cards placed')).toBeVisible()
  await page.getByRole('button', { name: 'Resume sorting' }).click()
  await expectActiveCard(page, DEMO_TITLES[2], 3)

  await page.getByRole('button', { name: 'Undo last' }).click()
  await expectActiveCard(page, DEMO_TITLES[1], 2)
  await page.reload()
  await expectActiveCard(page, DEMO_TITLES[1], 2)
})

test('a local image can be added and sorted without the demo set', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Project name').fill('One image')
  await page.getByLabel('Swipe left').fill('Later')
  await page.getByLabel('Swipe right').fill('Use')
  await page
    .locator('input[type="file"][accept="image/*,video/*"]')
    .setInputFiles({
      name: 'portrait-sample.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    })

  await expect(page.getByText('1 card in this sort')).toBeVisible()
  await expect(page.getByText('portrait-sample', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start sorting' }).click()
  await expectActiveCard(page, 'portrait-sample', 1, 1)
  await page.getByRole('button', { name: 'Sort into Use' }).click()

  await expect(
    page.getByRole('heading', { name: 'The result, still open to correction.' }),
  ).toBeVisible()
  await expect(page.getByRole('tab').filter({ hasText: 'Use' })).toContainText('1')
})

test('a portrait video remains playable in results and replay', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Project name').fill('One video')
  await page.getByLabel('Swipe left').fill('Later')
  await page.getByLabel('Swipe right').fill('Use')
  await page
    .locator('input[type="file"][accept="image/*,video/*"]')
    .setInputFiles(path.join(process.cwd(), 'e2e/fixtures/portrait-sample.webm'))

  await expect(page.getByText('1 card in this sort')).toBeVisible()
  await expect(page.getByText('portrait-sample', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start sorting' }).click()
  await expectActiveCard(page, 'portrait-sample', 1, 1)
  await expect(page.locator('.ss-swipe-card video')).toBeVisible()
  await page.getByRole('button', { name: 'Sort into Use' }).click()

  await expect(
    page.getByRole('heading', { name: 'The result, still open to correction.' }),
  ).toBeVisible()
  const resultVideo = page.locator('.ss-result-card video')
  await page.getByRole('tab').filter({ hasText: 'Use' }).click()
  await expect(resultVideo).toBeVisible()
  expect(await resultVideo.evaluate((video) => (video as HTMLVideoElement).controls)).toBe(true)

  await page.getByRole('button', { name: 'Replay session' }).click()
  const replayVideo = page.locator('.ss-replay-card video')
  await expect(replayVideo).toBeVisible()
  expect(await replayVideo.evaluate((video) => (video as HTMLVideoElement).controls)).toBe(true)
  await page.getByRole('button', { name: 'Play replay' }).click()
  await expect
    .poll(() => replayVideo.evaluate((video) => !(video as HTMLVideoElement).paused))
    .toBe(true)
})
