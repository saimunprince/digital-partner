/**
 * Screenshot the Settings overlay, for looking at it while working on it.
 * See home-shot.spec.ts.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import { type MockBackendFixture, setupMockBackend } from './fixtures'
import { test } from './test'

const OUT = process.env.HOME_SHOT_DIR || '/tmp/partner-shots'

let fixture: MockBackendFixture | null = null

test.beforeAll(async () => {
  fixture = await setupMockBackend()
  await fixture.page.waitForSelector('text=/Good (morning|afternoon|evening)/', { timeout: 60_000 })
})

test.afterAll(async () => {
  await fixture?.cleanup()
})

test('settings overlay', async () => {
  const { page } = fixture!

  fs.mkdirSync(OUT, { recursive: true })

  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Voice', exact: true }).first().click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(OUT, 'settings.png') })

  // Geometry, so the layout can be inspected without an image.
  const boxes = await page.evaluate(() => {
    const seen: Record<string, unknown>[] = []

    document.querySelectorAll('nav, section, aside, [class*="Overlay"], main').forEach(el => {
      const r = el.getBoundingClientRect()

      if (r.height > 40 && r.width > 40) {
        seen.push({
          cls: (el.className || '').toString().slice(0, 70),
          h: Math.round(r.height),
          tag: el.tagName,
          top: Math.round(r.top),
          w: Math.round(r.width)
        })
      }
    })

    return seen
  })

  // eslint-disable-next-line no-console -- diagnostic spec, not an assertion
  console.log(JSON.stringify(boxes, null, 1))
})
