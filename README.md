# Rouma

Rouma is a launch board protocol on Robinhood Chain. Tokens appear on the board, each one is tracked as it trades, and every
figure on the page is shown only once someone has stated it. Until then the slot stays marked and dated.

- Site: rouma.fun
- X: https://x.com/rouma_fun
- Source: https://github.com/RoumaFun/rouma-protocol

## Chain

| Field    | Value                                    |
| -------- | ---------------------------------------- |
| Network  | Robinhood Chain                          |
| Chain id | 4663 (`0x1237`)                          |
| RPC      | https://rpc.mainnet.chain.robinhood.com  |

Source: client statement, 2026-09-02, batch level.

## The register

Every outside fact on the site is one record with a state: `stated`, `absent` or `unconfirmed`. Records that are not
`stated` render inert and dated. Links are stored as URLs and handles are derived from them, so there is never an `href` for
an unstated record. The contract address follows the same rule: the slot at the top of the page is inert until the address is
stated, then becomes click-to-copy.

Address-shaped input in the search box is matched against the stated registry. It is never rejected only because it is hex.

## Repository layout

```
src/        page source: styles, client script, gate logic, tokens, register
src/assets/ logo sizes, touch icon and the traced logo grid (generated from brand/)
tools/      build, gates, brand pipeline (Python), local server, measurement helper
docs/       whitepaper, tokenomics, roadmap, architecture
brand/      logo files
reference/  mood imagery and measurement notes
dist/       static output, the folder that gets deployed
```

## Brand pipeline

Colours, logo sizes and the favicon grid are generated from the real files in `brand/` and `reference/`. Every colour in
`src/tokens.json` records the file and pixel it came from. The transparent logo hides pure black under alpha 0, so it is
resized premultiplied to avoid a dark fringe. The favicon is traced from the logo's pixel grid.

This step needs Python 3 with the packages in `requirements.txt`. The generated files are committed, so a normal build does
not need Python.

```bash
pip install -r requirements.txt
```

```bash
npm run brand
```

```bash
npm run brand:verify
```

## Build and check

Requires Node 20 or newer. There are no runtime dependencies.

```bash
npm run build
```

```bash
npm run gates
```

`npm run build` writes the static site to `dist/`. `npm run gates` checks the register, link rule, contract slot, social
icons, address matching, palette provenance, logo, favicon, copy, motion and units, then runs a mutation harness against both the absent and stated
branches.

To preview locally:

```bash
npm run serve
```

## Deploy

Drag the contents of `dist/` to the host. Nothing else is needed.

## Contributing and security

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) and [.github/SECURITY.md](.github/SECURITY.md).

## Docs

- [Whitepaper](docs/whitepaper.md)
- [Tokenomics](docs/tokenomics.md)
- [Roadmap](docs/roadmap.md)
- [Architecture](docs/architecture.md)

## License

MIT. See [LICENSE](LICENSE).
