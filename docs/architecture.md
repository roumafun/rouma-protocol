# Architecture

Rouma is a static site generated at build time from a register. There is no server and no runtime dependency.

```
src/register.json ──┐
src/tokens.json  ───┼─> tools/build.mjs ──> dist/
src/styles.css   ───┤        │
src/app.js, gate.js ┘   tools/render.mjs (HTML from the register)
```

## Register

`src/register.json` holds one record per outside fact:

```json
{ "label": "X", "kind": "url", "state": "absent", "url": null, "source": null, "dated": "2026-10-05" }
```

- `state` is `stated`, `absent` or `unconfirmed`.
- `source` is required when stated.
- Values of records that are not stated are removed from the JSON embedded in the page, so a candidate value never reaches the
  page source.

## Rendering

`tools/render.mjs` turns the register into HTML. For every record it decides between a live form (link, copy button, figure)
and an inert form (a dash or a marked slot with the date). A link is built from a stored URL and the handle is derived from it.

## Contract slot

The slot sits above the header, inside the sticky area. Stated: a button showing the full address, a copy button and a status
region that announces "copied". Not stated: a non-interactive line with the date.

## Address matching

`src/gate.js` is shared by the browser and the checks. `checkInput` answers one of:

| Result        | Meaning                                                    |
| ------------- | ---------------------------------------------------------- |
| `match`       | equals a stated address record, case-insensitive           |
| `unmatched`   | address-shaped, not in the stated registry                 |
| `no-registry` | address-shaped, and no address has been stated yet         |
| `partial`     | `0x` followed by fewer than 40 hex characters              |
| `text`        | anything else, used to filter board rows                   |
| `empty`       | nothing typed                                              |

Hex input is never rejected as such.

## Styling

`src/tokens.json` is the only file with colour literals. It lists swatches, each a real pixel of the brand artwork with its file,
coordinate and hash, and maps them to roles for the light and dark themes. The build turns it into `tokens.css` and into the
favicon. The logo sizes and the traced logo grid in `src/assets/` come from `tools/make_brand.py`. All other
CSS reads custom properties. Motion is limited to a short blink and a one-second clock tick, and a
`prefers-reduced-motion` block disables both.

## Checks

`tools/gates.mjs` builds three variants (real register, all stated, unconfirmed) and runs the same checks on each: files,
favicon, palette, register shape, link rule, contract slot, social icons, address rule, address matching, dating, copy, motion,
units, hooks and touch targets. A mutation harness then applies deliberate breakages and requires the right check to fail.
Mutation targets are located by record id and current state at run time, never by literal text.

## Output

`dist/` contains `index.html`, `styles.css`, `tokens.css`, `app.js`, `gate.js` and `favicon.svg`. It is the only folder that is
deployed.
