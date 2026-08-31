/**
 * Screenshot the voice command centre.
 *
 * Not an assertion suite — a way to LOOK at the surface while working on it,
 * in an isolated app (its own userData and HERMES_HOME) so it never touches a
 * running instance. Writes PNGs next to the other artifacts.
 *
 *   npm exec playwright test e2e/home-shot.spec.ts --reporter=list
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import { type MockBackendFixture, setupMockBackend } from './fixtures'
import { test } from './test'

const OUT = process.env.HOME_SHOT_DIR || '/tmp/partner-shots'

let fixture: MockBackendFixture | null = null

test.beforeAll(async () => {
  fixture = await setupMockBackend()

  // NOT waitForAppReady: that waits for the chat composer, and the voice
  // command centre deliberately has no text input. Wait for its own greeting.
  await fixture.page.waitForSelector('text=/Good (morning|afternoon|evening)/', { timeout: 60_000 })
})

test.afterAll(async () => {
  await fixture?.cleanup()
})

test('home surface', async () => {
  const { page } = fixture!

  fs.mkdirSync(OUT, { recursive: true })

  // The orb's GL context and the starfield both need a moment before they
  // have painted anything worth looking at.
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(OUT, 'home-idle.png') })

  // And the surface mid-conversation, which is where most of the design work
  // is. Clicking the orb starts it; the greeting is spoken first.
  await page.getByRole('button', { name: /talk|start/i }).first().click()
  await page.waitForTimeout(3500)
  await page.screenshot({ path: path.join(OUT, 'home-voice.png') })
})
