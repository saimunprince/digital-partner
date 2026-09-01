# Pulling Hermes

This product is a fork. Hermes is the engine underneath it, and it keeps
moving — pulling from it should be routine, not an event.

```bash
git fetch upstream
git merge upstream/main
```

```
origin    saimunprince/digital-partner    this product
upstream  NousResearch/hermes-agent       the engine
```

`docs/DIGITAL-PARTNER.md` is the companion: what the product is, what was
changed to build it, and what is still open.

## What conflicts, and what should

Most merges are clean. When one is not, the conflict is almost always in a file
where the product deliberately differs from upstream. **Those conflicts are the
point** — they are the places a decision was made, and each merge is a chance to
confirm it still holds. Do not "fix" them by taking upstream's side without
reading what was there.

| Where | The product's choice | Why |
|---|---|---|
| `themes/context.tsx` | dark is the default mode, not the OS | the palette, the presence orb and the surface depth are composed for a dark ground; the orb needs a separate rendering path to read on a light one |
| `themes/presets.ts` | Horizon is the default skin | the product's identity |
| `contrib/controller.tsx` | two title-bar cluster buttons | the other tools live in the nav rail |
| `shell/nav-sidebar.tsx` | every route in the rail | upstream has no rail |
| `quick-entry-app.tsx`, `plugins-settings.tsx`, `skills/index.tsx` | strings run through `interpolateBrand()` | copy hardcoded outside the i18n catalogue, where runtime branding never reaches |
| `electron/quit-guard.ts`, `electron/renderer-load-error-page.ts` | `MAIN_BRAND.productName` | same, on the main-process side |
| `session/hooks/use-session-actions/index.ts` | `desktopSessionCreateParams` is exported | the voice command centre mints the same params a new chat does |

When one of those conflicts, take upstream's wording and keep the wrapper.
The point is never the sentence — it is that the product's name appears in it.

Everything else — connection scoping, browser gestures, context menus,
whatever upstream reworked — take upstream's side and move on.

## What must NOT conflict

The five locale files (`i18n/{en,ja,zh,zh-hant,ar}.ts`) and `i18n/types.ts` are
**upstream's, byte for byte**. They used to carry about a thousand lines of our
edits and conflicted on every single pull for no design reason. If a merge ever
reports a conflict in one of them, something has been written there that should
not have been.

The product's MARK is its own too. `BRAND.markAsset` points at
`public/onyx-mark.svg` — the reactor the assistant is drawn as on Home. Left
unset it falls back to the engine's `nous-girl.jpg`, which is the clearest tell
in the whole interface that this is somebody else's product.

Tests must read `BRAND.productName` / `MAIN_BRAND.productName`, never the
literal name. Nine of them hardcoded it and broke on a rename they had nothing
to do with.

The product's strings live in `i18n/partner/` — files upstream does not have,
so they cannot conflict. Its type lives beside them, composed into the app's
shape as `AppTranslations` rather than added to upstream's `Translations`.

The product's NAME is applied at runtime (`i18n/brand-interpolate.ts`) from a
deny-list of engine phrases — `Hermes Cloud`, `Hermes Agent`, `Hermes CLI` and
`Hermes path` keep their real names, because that is what a user would type,
search for, install, or read in a log. That list is short on purpose:
"Hermes backend", "Hermes gateway" and "Hermes runtime" are **not** on it —
those are the product describing its own parts, and telling someone their
"Hermes backend" is out of date shows them the name the product exists to
replace. Everything else that says Hermes is the product talking about
itself and takes the product's name. It is a deny-list
because the allow-list that came before it went stale the moment upstream added
a string, and the failure mode was the engine's name showing up in the product.

## After a merge

```bash
cd apps/desktop && npm install && npm run typecheck && npm run lint && npm run test
./scripts/run_tests.sh tests/
./digital-partner.sh --restart
```

The restart is not optional. The desktop runs the engine from THIS checkout
(`HERMES_DESKTOP_HERMES_ROOT` in `digital-partner.sh`), and Hermes refuses to
serve when the code it started from no longer matches the code on disk.
