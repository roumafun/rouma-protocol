# Roadmap

Phases are ordered, not dated. A phase is marked done only when its exit check passes, and dates are added when a source
states them.

## Phase 0: the board and its register (done)

- Static site on Robinhood Chain context, deployable from `dist/`.
- Register with `stated`, `absent` and `unconfirmed` records.
- Contract slot, social icons, address matching, fee-flow slots.
- Gate suite with mutation harness, run against absent and stated branches.

Exit check: build and gates exit 0.

## Phase 1: brand and presence (done)

- Real palette sampled from the brand files, with the file and pixel of each colour recorded.
- Real logo and a favicon traced from its pixel grid.
- X and GitHub records moved to `stated` after client confirmation.

Exit check: palette literals live only in the tokens file; the gates confirm the records and links.

## Phase 2: contract and parameters

- Contract address stated, then verified on chain before the slot goes live.
- Fee proportions stated, then shown in the intro panel and flow diagram.
- Launch window stated.

Exit check: each figure is a `stated` record with a source and a date.

## Phase 3: live board

- Listings and activity read from chain data and stated as records.
- Sorting and search over real rows.
- Per-token pages.

Exit check: every number on a token page traces to a record or to a chain read.

## Phase 4: agents and staking

- Agent reports attached to listed tokens.
- Staking surface, if the parameters in phase 2 call for one.

Exit check: reviewed design, security review, and a stated source for every parameter.

## Out of scope for now

Custody, price advice, and any promise of return.
