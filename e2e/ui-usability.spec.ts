import { expect, test, type Page } from '@playwright/test'

const DEMO_TITLES = [
  'Blue hour',
  'Soft horizon',
  'Signal',
  'Open window',
  'After rain',
  'Warm current',
] as const

type FailureWindow = Window & {
  __swipeSortFailNextSessionWrite?: boolean
}

async function startDemo(page: Page) {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Set up your sort.' }),
  ).toBeVisible()

  await page.getByLabel('Project name').fill('Field notes')
  await page.getByLabel('Swipe left').fill('Archive')
  await page.getByLabel('Swipe right').fill('Keep')
  await page.getByRole('button', { name: 'Try demo set' }).click()

  await expect(page.getByText('6 cards ready to sort')).toBeVisible()
  await page.getByRole('button', { name: 'Start sorting' }).click()
  await expectActiveCard(page, DEMO_TITLES[0])
}

async function expectActiveCard(page: Page, title: string) {
  await expect(page.getByTestId('swipe-card')).toHaveAttribute(
    'aria-label',
    `Sort ${title}`,
  )
}

async function expectMobileSurface(page: Page, context: string) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      { message: `${context} must not overflow horizontally` },
    )
    .toBe(true)

  const undersizedButtons = await page.locator('button:visible').evaluateAll(
    (buttons) =>
      buttons.flatMap((button) => {
        const bounds = button.getBoundingClientRect()
        if (bounds.width >= 44 && bounds.height >= 44) return []

        const name =
          button.getAttribute('aria-label') ??
          button.textContent?.replace(/\s+/g, ' ').trim() ??
          'Unnamed button'
        return [
          {
            name,
            width: Math.round(bounds.width * 10) / 10,
            height: Math.round(bounds.height * 10) / 10,
          },
        ]
      }),
  )

  expect(
    undersizedButtons,
    `${context} buttons must provide a 44×44 CSS-pixel hit target`,
  ).toEqual([])
}

async function completeSort(page: Page) {
  const progress = page.getByRole('progressbar', { name: 'Cards sorted' })
  await expect(progress).toHaveAttribute('aria-valuenow', '0')
  await expect(progress).toHaveAttribute(
    'aria-valuetext',
    `0 of ${DEMO_TITLES.length} cards sorted`,
  )

  for (let index = 0; index < DEMO_TITLES.length - 1; index += 1) {
    await page.getByRole('button', { name: 'Sort into Keep' }).click()
    await expectActiveCard(page, DEMO_TITLES[index + 1])
    await expect(progress).toHaveAttribute('aria-valuenow', String(index + 1))
    await expect(progress).toHaveAttribute(
      'aria-valuetext',
      `${index + 1} of ${DEMO_TITLES.length} cards sorted`,
    )
  }

  await page.getByRole('button', { name: 'Sort into Keep' }).click()
  const completion = page.getByRole('heading', {
    name: 'Every card has a place.',
  })
  await expect(completion).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review result' })).toBeFocused()
  await page.waitForTimeout(600)
  await expect(completion).toBeVisible()
}

async function installSessionWriteFailure(page: Page) {
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put

    Object.defineProperty(IDBObjectStore.prototype, 'put', {
      configurable: true,
      writable: true,
      value(
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ): IDBRequest<IDBValidKey> {
        const state = window as FailureWindow
        if (this.name === 'sessions' && state.__swipeSortFailNextSessionWrite) {
          state.__swipeSortFailNextSessionWrite = false
          throw new DOMException(
            'Injected session write failure',
            'UnknownError',
          )
        }
        return key === undefined
          ? originalPut.call(this, value)
          : originalPut.call(this, value, key)
      },
    })
  })
}

async function failNextSessionWrite(page: Page) {
  await page.evaluate(() => {
    ;(window as FailureWindow).__swipeSortFailNextSessionWrite = true
  })
}

for (const viewport of [
  { width: 320, height: 700 },
  { width: 390, height: 844 },
] as const) {
  test(`mobile UI stays usable through the full flow at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'Set up your sort.' }),
    ).toBeVisible()
    await expectMobileSurface(page, `${viewport.width}px empty setup`)

    await page.getByLabel('Project name').fill('Field notes')
    await page.getByLabel('Swipe left').fill('Archive')
    await page.getByLabel('Swipe right').fill('Keep')
    await page.getByRole('button', { name: 'Try demo set' }).click()
    await expect(page.getByText('6 cards ready to sort')).toBeVisible()
    await expectMobileSurface(page, `${viewport.width}px populated setup`)

    await page.getByRole('button', { name: 'Start sorting' }).click()
    await expectActiveCard(page, DEMO_TITLES[0])
    await expectMobileSurface(page, `${viewport.width}px sort`)

    await completeSort(page)
    await expectMobileSurface(page, `${viewport.width}px completion`)
    await page.getByRole('button', { name: 'Review result' }).click()

    await expect(
      page.getByRole('heading', { name: 'Review your result.' }),
    ).toBeVisible()
    await expectMobileSurface(page, `${viewport.width}px result`)

    if (viewport.width === 390) {
      await page.getByRole('tab', { name: /Keep 6/ }).click()
      await page
        .getByRole('button', { name: 'Move Blue hour to Archive' })
        .click()

      const moveStatus = page.getByRole('status')
      await expect(moveStatus).toContainText('Blue hour moved to Archive.')
      await expect
        .poll(() =>
          page.evaluate(() => {
            const notice = document.querySelector('.appNotice')
            const actions = document.querySelector('.ss-results__footer')
            if (!(notice instanceof HTMLElement) || !(actions instanceof HTMLElement)) {
              return false
            }
            const noticeRect = notice.getBoundingClientRect()
            const actionsRect = actions.getBoundingClientRect()
            return noticeRect.bottom <= actionsRect.top
          }),
        )
        .toBe(true)
      await page.waitForTimeout(4400)
      await expect(moveStatus).toBeVisible()
      await moveStatus.getByRole('button', { name: 'Undo' }).click()
      await expect(moveStatus).toContainText('Blue hour moved to Keep.')
      await expect(page.getByRole('tab', { name: /Keep 6/ })).toBeVisible()
    }

    const replay = page.getByRole('button', {
      name: 'Replay original choices',
      exact: true,
    })
    await expect(replay).toHaveCount(1)
    await replay.click()

    await expect(page.getByRole('heading', { name: 'Replay' })).toBeVisible()
    await expect(
      page.getByText(
        'Original choices only. Result corrections aren’t included.',
      ),
    ).toBeVisible()
    await expect(page.getByText('Ready · 6 choices')).toBeVisible()
    await expectMobileSurface(page, `${viewport.width}px replay`)
    await expect
      .poll(() =>
        page.getByRole('button', { name: 'Back to result' }).evaluate(
          (button) => button.getBoundingClientRect().bottom <= window.innerHeight,
        ),
      )
      .toBe(true)

    await page.getByRole('button', { name: 'Next choice' }).click()
    await expect(page.getByText('Choice 1 of 6')).toBeVisible()
    await page.getByRole('button', { name: 'Back to result' }).click()
    await expect(
      page.getByRole('heading', { name: 'Review your result.' }),
    ).toBeVisible()
  })
}

test('a failed local save is visible on the sorting screen and changes nothing', async ({
  page,
}) => {
  await installSessionWriteFailure(page)
  await startDemo(page)
  await failNextSessionWrite(page)

  await page.getByRole('button', { name: 'Sort into Keep' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText(/Couldn.t save your choice/i)
  await expect(alert).toContainText(/card was not moved/i)
  await expectActiveCard(page, DEMO_TITLES[0])
  await expect(
    page.getByRole('progressbar', { name: 'Cards sorted' }),
  ).toHaveAttribute('aria-valuenow', '0')

  await page.getByRole('button', { name: 'Sort into Keep' }).click()
  await expectActiveCard(page, DEMO_TITLES[1])
  await expect(alert).toBeHidden()
})
