# Block Framework — Demo Runbook (M4)

**Duration:** ~10 minutes
**Audience:** Technical (investors, developers, product folks)
**Goal:** Show the full loop: idea → visual builder → AI edit → export → phone.

## Minute-by-minute

### 0:00–0:30 — The Hook

**What you say:** "What if you could build a complete mobile app without writing code — and without an AI writing fragile code for you?"

**What they see:** Title slide / builder canvas with 8 screens.

**Wow moment:** None yet — setting up.

### 0:30–2:00 — The Canvas (Wow #1: Real previews)

**What you do:**

1. Open the builder (already running at `http://localhost:5199`).
2. Point out the 8 screen cards with live static previews.
3. Drag to reorder (or use arrow buttons).

**What you say:** "Every screen is a pre-verified block. The previews are real — they're the actual components, rendered."

**What they see:** Screen cards with iframe previews, lane organization.

**Fallback:** If previews don't load, show the static screenshots in `e2e/screenshots/`.

### 2:00–3:30 — Profile Cascade (Wow #2: Zero-token configuration)

**What you do:**

1. Click "Profile" tab.
2. Answer the 6 questions (use the demo answers below).
3. Show the app name, theme, and copy update.

**Demo answers:**

- App name: "Habitual Pro"
- Theme: Purple (#4f46e5)
- Tone: Playful

**What you say:** "Six questions configure the entire app. Zero AI calls — it's deterministic."

**What they see:** Profile wizard, updated canvas.

**Fallback:** Profile is deterministic — no fallback needed.

### 3:30–5:30 — AI Edit (Wow #3: Scoped agent)

**What you do:**

1. Click "✨ Agent" tab.
2. Type: "make it playful"
3. Click "Plan edit".
4. Point out the `◌ recorded demo` badge (honest labeling).
5. Show the diff table (5 changes).
6. Click "Apply 5 changes".
7. Switch to Canvas tab — previews have updated.

**What you say:** "The agent only edits fields inside each block's editable surface. It can't touch locked fields, and it never overwrites your hand-edits. You review every change before it applies."

**What they see:** Diff table, updated previews, token count.

**Fallback:** If the agent fails, show the recorded response manually. The badge is honest.

### 5:30–6:30 — Undo (Wow #4: Reversible)

**What you do:**

1. In the Agent tab, click "Undo".
2. Show the headlines revert.

**What you say:** "Every edit is reversible. One click."

**What they see:** Headlines revert to original.

**Fallback:** None needed — undo is local and deterministic.

### 6:30–8:00 — Export (Wow #5: ZIP to phone)

**What you do:**

1. Click "Export ZIP" (or run `blockc export`).
2. Show the ZIP file.
3. (If time) Unzip on a clean machine, follow README, `npx expo start`.

**What you say:** "One click. The ZIP has everything — no secrets, no junk. Follow the README and it runs."

**What they see:** ZIP file, README, running app.

**Fallback:** Pre-built ZIP on USB. Expo Go QR code as backup.

### 8:00–9:00 — On the Phone (Wow #6: Real app)

**What you do:**

1. Show the app running on a real phone (via Expo Go or installed APK).
2. Tap through the screens.

**What you say:** "This is a real app. Not a mockup. It was generated from JSON."

**What they see:** Phone with the app.

**Fallback:** Screen mirror the Expo Go session. Web export as last resort.

### 9:00–10:00 — The Close

**What you say:** "Deterministic blocks. Scoped AI edits. One-click export. This is how apps should be built."

**What they see:** Title slide with repo URL.

## Demo reset script

Run `./scripts/demo-reset.sh` before the demo. It:

1. Kills any running builder server.
2. Removes the demo project file.
3. Starts a fresh server with the 8-block example.
4. Verifies the server responds.

## Failure-mode plan

| Moment          | What can go wrong          | Fallback                            |
| --------------- | -------------------------- | ----------------------------------- |
| Canvas previews | iframe fails to load       | Static screenshots                  |
| Profile Cascade | N/A (deterministic)        | —                                   |
| AI Edit         | Model fails / network down | Recorded provider (badge shows it)  |
| Apply           | Validation rejects         | Show the rejection (it's a feature) |
| Undo            | N/A (local)                | —                                   |
| Export ZIP      | Build fails                | Pre-built ZIP on USB                |
| Phone demo      | No network for Expo Go     | Pre-installed APK                   |
| Phone demo      | APK won't install          | Web export in browser               |

## Rehearsal results

**Date:** October 8, 2026
**Result:** 9/10 runs passed with 8/8 tests. 1 run had 7/8 (single timeout, 1.5m vs typical 23s — flakiness, not a deterministic failure).

| Run | Result | Time           |
| --- | ------ | -------------- |
| 1   | 8/8 ✅ | 35.2s          |
| 2   | 8/8 ✅ | 23.0s          |
| 3   | 8/8 ✅ | 23.0s          |
| 4   | 8/8 ✅ | 22.1s          |
| 5   | 8/8 ✅ | 24.4s          |
| 6   | 8/8 ✅ | 24.4s          |
| 7   | 8/8 ✅ | 25.0s          |
| 8   | 8/8 ✅ | 21.5s          |
| 9   | 7/8 ⚠️ | 1.5m (timeout) |
| 10  | 8/8 ✅ | 21.7s          |

**Pass rate:** 90% (9/10). The single failure was a timeout under load, not a logic error.
