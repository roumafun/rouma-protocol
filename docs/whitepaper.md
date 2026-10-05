# Rouma whitepaper

Version 0.1, October 2026. A working draft: it describes intent and method, and it leaves out any figure that has not been
stated.

## 1. Summary

Rouma is a launch board protocol on Robinhood Chain. It gives new tokens a place to be listed, compared and followed, and it
holds itself to one editorial rule: a number is published only after a named source has stated it. Everything unstated is
shown as unstated, with the date it was last checked.

## 2. Problem

Launch venues tend to blur three things together: what a project has promised, what the chain shows, and what the venue
would like visitors to believe. Visitors cannot tell a measured figure from a placeholder, and a contract address pasted into
a chat can look as authoritative as one published by the team.

## 3. Approach

### 3.1 A register before a roadmap

Rouma keeps a register of every external fact the site displays. Each record carries:

- a state: `stated`, `absent` or `unconfirmed`;
- a source, required whenever the state is `stated`;
- a date, always.

Pages are built from the register. A record that is not `stated` cannot produce a link, a copy button or a figure. It
produces a marked, dated slot instead.

### 3.2 One address, one slot

The contract address has a single slot at the top of the page, always visible. While the address is absent the slot is inert.
When it is stated the slot shows the full address and copies it on click. Nothing else on the page can introduce an address:
the build refuses any address-shaped string that is not a stated record.

### 3.3 Matching instead of rejecting

Visitors paste addresses. The board does not reject an input for being hexadecimal; it checks the input against the stated
registry and answers one of three ways: it matches a stated record, it looks like an address but is not in the registry, or
there is nothing stated yet to match against.

### 3.4 Agents on the board

Each listed token is intended to carry an automated agent that reads the market and reports what it finds. A share of trading
fees is meant to pay for the agent's compute, with further shares going to holders, makers and stakers. The proportions are
not stated yet and are therefore not published; see [tokenomics](tokenomics.md).

## 4. Chain

Rouma targets Robinhood Chain, chain id 4663 (`0x1237`), RPC `https://rpc.mainnet.chain.robinhood.com`. The source is a client
statement dated 2026-09-02, given at batch level.

## 5. Verification

Every release is built twice in checks: once with the real register and once with a register in which every record is stated.
The checks cover the link rule, the contract slot, the social icons, address matching, palette discipline and copy. A mutation
harness then breaks each rule on purpose and confirms the checks notice.

## 6. Risks and limits

- A stated record is only as good as its source. The register records the source; it does not audit it.
- The board reports; it does not recommend. Nothing in this repository is financial advice.
- Unstated parameters may change when they are stated. Documents here will be revised at that point and dated.

## 7. Status

The site and its checks exist. The contract address, fee proportions, launch window and board data are absent as of
2026-10-05.
