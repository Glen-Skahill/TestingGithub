# Open questions for Glen

Answers to any of these change the content or the app. Reply in the session, or edit `js/seed.js` directly.

## Blockers I worked around
1. **The Google Sheet could not be read.** The build environment's network policy denies `docs.google.com`. The Teach pillar therefore has two generic series slots and a first task that says "paste the series plan from the Sheet". Either paste the rows into a message, or allow `docs.google.com` in the environment's network settings and I will import it properly (series names, episode lists, any steps the Sheet already defines).
2. **A new repository could not be created.** The GitHub App this session uses is not allowed to create repositories. The app lives on branch `claude/walk-in-light-app-gr3i7l` of `TestingGithub`. The README has the three commands to move it to a `walk-in-light` repo once you create one (empty, public, so GitHub Pages is free).

## Direction
3. **The story draft.** Nocturne, the Veil, Helios, the Lantern, Mara, Vale, Teodor: keep, change, or start over? Two alternate directions are in `docs/STORY_CONCEPT.md`.
4. **How explicit is the faith?** Allegorical (never named), in-world church with real Scripture, or the hybrid the draft assumes?
5. **Channel structure.** One channel with playlists, or a separate channel for the reviews? The Foundation pillar has the trade-offs.
6. **The two educational series.** What are they about, who are they for, and are they meant to be in-world (Lamplighter's Workshop) or plain?
7. **Review targets.** Which anime and films first? The seed lists twenty candidates; your own list wins.
8. **Your real weekly hours**, split into deep blocks and scraps, and which day is off. This tunes the task sizes and the suggested cadence.

## App
9. **Reminders.** Right now: a calendar event with an alert, or an iOS Reminder. Real push notifications on an iPhone web app need a small push server (free tiers exist, e.g. a Cloudflare Worker, but it is a second thing to maintain). Want that, or is the calendar approach enough?
10. **A fourth pillar, "Foundation".** I added it because brand, accounts and workflow are prerequisites for all three. Keep it, or fold it into Home?
11. **Aesthetic.** Current: deep night, magenta, cyan, holy gold, pixel fonts, scanlines, a pixel cross and stained-glass verse card. Too much glow (there is a Calm toggle), wrong imagery, anything missing?
12. **Repo visibility.** Pages on a private repo costs money; the code contains nothing personal, your data never leaves the phone. OK to keep public?
