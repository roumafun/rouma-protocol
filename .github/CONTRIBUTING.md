# Contributing to Rouma

Thanks for helping. The project is small and strict about one thing: the register.

## Ground rules

1. **Every outside fact is a register record.** Add it to `src/register.json` with a state, a date and, if stated, a source.
2. **Store URLs, derive handles.** Never write a link for a record that is not stated.
3. **Never reject hex.** Address-shaped input is matched against the stated registry.
4. **Colour literals live in `src/tokens.json` only.** Everything else uses custom properties.
5. **No `ch` units,** and tap targets stay at least 44 by 44 on touch screens.
6. **Respect reduced motion.** Any new animation needs a rule inside the `prefers-reduced-motion` block.

## Workflow

1. Fork and branch from the default branch.
2. Make a focused change.
3. Run both commands. They must exit 0.

```bash
npm run build
```

```bash
npm run gates
```

4. Open a pull request. Describe what changed and, for any new fact, name the source.

## Writing style

Plain sentences, original wording. Do not copy text from other sites. The copy check compares word pairs against a reference
corpus and will fail on shared phrases.

## Reporting problems

Bugs and ideas go in issues. For anything security related, read [SECURITY.md](SECURITY.md) first and do not open a public
issue.
