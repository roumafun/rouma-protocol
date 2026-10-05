# Tokenomics

Status as of 2026-10-05: **no tokenomics figures have been stated.** This page records the structure and what is still open.
It will gain numbers only when a source states them, and each number will carry that source and date.

## Principle

Rouma publishes no supply, price, allocation, fee percentage or return that is not a `stated` record in the register. A blank
is more useful than a guess.

## Structure

A fee is taken on each trade of a listed token. The design splits that fee across four lanes:

| Lane    | Purpose                                         | Share      |
| ------- | ----------------------------------------------- | ---------- |
| Compute | pays for the agent attached to the token        | not stated |
| Holders | returned to holders of the token                | not stated |
| Makers  | goes to the party that launched the token       | not stated |
| Stakers | goes to participants who stake                  | not stated |
| Total   | combined take on a trade                        | not stated |

The site shows these as slots with a dash and a date, in the intro panel and in the fee-flow diagram.

## Token contract

Not stated. The slot at the top of the site stays inert until it is. See the [architecture](architecture.md) for how the slot
and the address check work.

## Open questions

- Which proportions apply to each lane, and whether they differ per token.
- Whether staking applies to a protocol token, a listed token, or both.
- Whether any share is burned or buffered.
- Who states each figure, and where the statement is kept.

## Updating this page

1. Add or change the record in `src/register.json` with its source and date.
2. Run the build and the gates.
3. Update the matching row above with the value, source and date in the same change.
