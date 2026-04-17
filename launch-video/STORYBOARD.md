# Rakshak Launch Video — Storyboard

**Total duration:** 22.0s · **Resolution:** 1920×1080 · **FPS:** 30

Timeline:

```
│ Act I — Silence        │ Act II — Mechanism                 │ Act III — Hand-off   │
├─────────────────────────┼─────────────────────────────────────┼───────────────────────┤
│ 0.0s ─────────── 6.0s  │ 6.0s ────────────────── 16.0s       │ 16.0s ──────── 22.0s │
```

Each scene below is one HyperFrames sub-composition. Root `index.html` sequences them with 0.5s cross-fades between acts (inside the scene duration — do not add black gaps).

---

## Scene 1 · `act1-silence` · 0.0 – 6.0s (6.0s)

**Purpose:** A dramatic micro-story, not a legal argument. Pull the viewer into the **emotional shape** of reporting harassment inside a compromised channel — the courage it takes, the act of sending, and the silence that follows. Universal enough that every viewer projects their own story onto it; specific enough that the emptiness at the end hits. No names, no counts, no sector, no law citation yet.

**Frame at hero moment (t ≈ 4.8s):**

```
                                                                          
   She wrote it down.                                                     
                                                                          
   She almost didn't send it.                                             
                                                                          
   Then she did.                                                          
                                                                          
                                                                          
                                                                          
                       —  silence  —                                      
                                                                          
```

The final frame of Act I is almost empty. The three lines from the story have dimmed or left. Only the italic word *silence* remains, centred, low-contrast — held in stillness for 1.2s before the crossfade.

**Elements & timing:**

| Element | Type | Enter | Content | Style |
|---|---|---|---|---|
| `#line-1` | Fraunces 96px | 0.5s, `power3.out`, 0.7s dur | "She wrote it down." | ink on canvas |
| — | HOLD | 1.2 – 2.0s | beat of stillness | — |
| `#line-2` | Fraunces 96px | 2.0s, 0.7s dur | "She almost didn't send it." | ink |
| — | HOLD | 2.7 – 3.4s | the hesitation is the drama | — |
| `#line-3` | Fraunces 96px, color `saffron` | 3.4s, 0.6s dur | "Then she did." | saffron |
| — | HOLD | 4.0 – 4.5s | resolve lands | — |
| `#fade-all` | opacity 1 → 0.15 on lines 1–3 | 4.5s, 0.5s dur | story dims | muted |
| `#silence` | Fraunces 42px italic, centred | 5.0s, opacity 0 → 1 0.4s | "— silence —" | muted |
| — | scene crossfade to Act II-a | 5.7–6.0s | — | — |

**Motion notes:** The pauses between the three lines are the point. *Don't rush.* Line 2 carries the emotional weight — "she almost didn't" is the moment the viewer leans in. Line 3 enters in saffron because the *act of sending* is the one heroic thing in this story. Then everything dims and we're left with the word *silence*. That dim-and-hold is the payload: she did the brave thing, and nothing came back. No accusation, no statistic, no case — just an experience.

Each text line enters `y: 24, opacity: 0 → y: 0, opacity: 1` with `power3.out`. The dim at 4.5s uses `power2.inOut` on opacity only — lines stay in place, they just recede.

**Copy discipline:** The pronoun is generic by design — this person could be anyone. The sentences describe a universal experience (hesitation, courage, sending, silence); they do not describe a case. If the "she" ever reads as pointing at a specific individual, it can be swapped for *"They wrote it down. / They almost didn't send it. / Then they did."* — the pacing and impact are identical.

**Anti-references:** No envelope icons, no spinner graphics, no "SENT" stamp, no chat bubbles. Typography only. The story is in the rhythm of the words and the stillness around them.

**Audio cue:** At 3.4s (on "Then she did."), a low cello/drone enters at -18dB. At 4.5s, when the lines dim, the drone drops by another 3dB — *the silence is sonic too*. It holds through Act II and resolves in Act III.

---

## Scene 2 · `act2a-loop` · 6.0 – 10.0s (4.0s)

**Purpose:** Show *why* existing channels fail in one image.

**Frame at hero moment (t ≈ 8.5s, scene-local 2.5s):**

```
   ┌──────────┐     ┌──────┐     ┌──────┐
   │ EMPLOYEE │ ──▶ │ FORM │ ──▶ │  HR  │
   └──────────┘     └──────┘     └──┬───┘
                                    │
                       ◀────────────┘
                       (channel loops in on itself)

   The complaint goes to the people it's about.
```

**Elements & timing (scene-local times):**

| Element | Enter | Content |
|---|---|---|
| `#box-employee` | 0.2s, `power3.out` | "EMPLOYEE" — thin-ruled box, Mono 28px |
| `#arrow-1` | 0.5s (scaleX from left) | → |
| `#box-form` | 0.7s | "FORM" |
| `#arrow-2` | 1.0s | → |
| `#box-hr` | 1.2s | "HR" |
| `#loop-arrow` | 1.8s, 0.8s dur, `power2.inOut` | curved path from HR back to HR (SVG path drawing) |
| `#caption` | 2.6s fade-in 0.5s | "The complaint goes to the people it's about." — Fraunces 56px, saffron |
| — | crossfade to Act II-b | 3.5–4.0s |

**Copy discipline:** The caption describes a **structural conflict of interest** inherent to routing complaints through the HR function — it does not allege that any specific HR team suppressed anything. Keep the line general. Safe alternates if this still reads too pointed: *"The complaint routes through the conflict." / "The channel has a conflict of interest." / "Reviewed by the people it concerns."*

**Motion notes:** The loop arrow is the punchline — draw it slowly (0.8s) so the viewer tracks the path and *gets* the absurdity. Boxes are hairline-ruled (`#1F1D1A`), never filled.

---

## Scene 3 · `act2b-switch` · 10.0 – 16.0s (6.0s) — THE HERO SHOT

**Purpose:** Show the Dead Man's Switch mechanism. This is the entire product in one frame. Every other scene is scaffolding for this one.

**Frame at hero moment (t ≈ 14.5s, scene-local 4.5s):**

```
   ●───────────●───────────●───────────●
   Day 0       Day 7       Day 10      Day 17
   SUBMITTED   ICC         AUDIT       DISTRICT
                           COMMITTEE   OFFICER

   If no one acts, the system does.
```

All four nodes lit in saffron by 4.5s. Connecting line is saffron at 60% opacity.

**Elements & timing (scene-local):**

| Element | Enter | Content |
|---|---|---|
| `#hero-rule` | 0.3s, scaleX 0→1, 0.8s `power3.out` | horizontal timeline axis, 1200px, saffron-dim |
| `#node-0` | 1.1s, scale 0→1 + saffron glow | ● at Day 0 |
| `#label-0` | 1.3s, y: 20 → 0 | "Day 0 / SUBMITTED" |
| `#node-7` | 2.1s | ● at Day 7 |
| `#label-7` | 2.3s | "Day 7 / ICC" |
| `#node-10` | 3.1s | ● at Day 10 |
| `#label-10` | 3.3s | "Day 10 / AUDIT COMMITTEE" |
| `#node-17` | 4.1s | ● at Day 17 |
| `#label-17` | 4.3s | "Day 17 / DISTRICT OFFICER" |
| `#tagline` | 5.0s, y: 30 → 0, 0.7s `power3.out` | "If no one acts, the system does." — Fraunces 64px, ink |
| — | crossfade to Act III | 5.5–6.0s |

**Motion notes:** Each node ignites with a 120px radial saffron glow that fades to 40% opacity over 0.4s. The glow is the *only* place in the video where we permit soft light — it reads as mechanism engaging. Labels use Mono (days) + Inter SEMIBOLD (roles) stacked.

**Audio cue:** Soft mechanical "click" SFX at each node ignite (4 clicks: 1.1s, 2.1s, 3.1s, 4.1s local).

---

## Scene 4 · `act3-handoff` · 16.0 – 22.0s (6.0s)

**Purpose:** Name the product. State the promise. Point at the repo. Exit clean.

**Frame at hero moment (t ≈ 19.5s, scene-local 3.5s):**

```
                  [rakshak_logo]
                                    
                    Rakshak
                                    
         Because complaints shouldn't
              need courage.
                                    
      ─────────────────────────────
      open source · MIT
      github.com/[org]/rakshak
      Teams bot + tab · POSH Act 2013
```

**Elements & timing (scene-local):**

| Element | Enter | Content |
|---|---|---|
| `#logo` | 0.3s, scale 0.9 → 1.0 + opacity, 0.7s `power3.out` | Rakshak logo, 180×180 |
| `#wordmark` | 0.9s, y: 40 → 0 | "Rakshak" — Fraunces 96px |
| `#tagline` | 1.6s, opacity fade 0.8s | "Because complaints shouldn't need courage." — Fraunces 64px italic |
| `#hairline` | 2.8s, scaleX 0→1 0.5s | 1px rule, 600px wide |
| `#meta-1` | 3.2s | "open source · MIT" — Mono 24px muted |
| `#meta-2` | 3.4s | "github.com/[org]/rakshak" — Mono 24px ink |
| `#meta-3` | 3.6s | "Teams bot + tab · POSH Act 2013" — Mono 24px muted |
| — | HOLD (no motion) | 4.5s – 6.0s — 1.5s of stillness. Let it breathe. This is the poster frame. |

**Motion notes:** Nothing exits. Final hold is pure stillness — this is the frame people will screenshot. Ending on motion would waste it.

**Audio cue:** Cello drone resolves (does not crescendo). Optional soft cadence out at 5.5s.

---

## Transition Strategy

Inter-act transitions happen **inside** the outgoing scene's duration via a 0.5s opacity fade on `.scene-content`. The incoming scene's entrance animations start at its `data-start` with their own 0.2–0.4s offset, so the two fades overlap slightly (0.3s of soft cross-dissolve). No jump cuts, no shader wipes — per [DESIGN.md](DESIGN.md).

Per HyperFrames rules: the outgoing scene uses NO exit tweens on individual elements. Only the scene container's opacity animates out.

## Build Order (when ready to execute)

1. `npx hyperframes init . --non-interactive` (scaffold if not already done)
2. Build `compositions/act1-silence.html` — lock pacing first, this sets the tempo for everything else
3. Build `compositions/act2a-loop.html` — the SVG loop arrow is the trickiest element
4. Build `compositions/act2b-switch.html` — the hero shot, spend the most time here
5. Build `compositions/act3-handoff.html` — finish with the poster frame
6. Wire all four into root `index.html` with the correct `data-start`, `data-duration`, `data-track-index`
7. `npx hyperframes lint` + `npx hyperframes validate` — resolve contrast warnings (the saffron on near-black needs checking)
8. `npx hyperframes preview` — scrub at 0.5× speed to verify pacing feels weighted, not slow-for-slow's-sake
9. `npx hyperframes render --fps 30 --quality high --output rakshak-launch-16x9.mp4`
10. Extract poster: `ffmpeg -ss 18.0 -i rakshak-launch-16x9.mp4 -frames:v 1 rakshak-launch-poster.png`
11. Author vertical cutdown (Acts I + III only, 15s total) as separate composition

## Open Questions

- **Repo URL:** Confirm the final `github.com/[org]/rakshak` slug before render.
- **Music licensing:** Source cello/drone bed — [Epidemic Sound / Artlist / Musicbed], or ship silent v1 and add score in v1.1.
- **Click SFX:** Need a single sharp but soft mechanical click (lock engaging). ~80ms, -12dB peak.
