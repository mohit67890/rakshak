# Rakshak — Launch Video Brief

**Duration:** 22 seconds
**Aspect:** 1920×1080 (primary) + 1080×1920 cutdown for vertical social
**Format:** HyperFrames HTML composition, rendered to MP4 (H.264)
**Destination:** GitHub README hero, LinkedIn launch post, X/Twitter, YouTube short

---

## The One Sentence

> The system that makes complaint suppression structurally impossible.

## Editorial Guardrails (Legal)

This video makes a **systemic argument about a law**, not a reference to any specific incident. Any copy, imagery, or cadence that could plausibly map onto a known case — even at 50% resonance — is out. The weight must come from the statute and the structural failure it's trying to address, not from something the viewer might recognise from the news.

Rules for every frame and every line of copy:

1. No specific victim counts, durations, or role descriptions ("N women", "M years", "one HR head", etc.). These shapes are too easily mapped onto real cases.
2. No company, person, city, state, sector, or industry names. Only statutory citations (POSH Act 2013, BNS 2023, Companies Act 2013).
3. No footage, photos, logos, screenshots, or stylised references to any real organisation.
4. No news article links anywhere — video, description, social copy, or commit message.
5. Copy speaks about the mechanism (*"the ICC"*, *"the channel"*, *"the process"*) and the law — never about an instance.
6. If anyone asks whether it's "about" a recent case, the answer is: *it's about the gap between what the POSH Act promises and how internal channels fail in practice.*

## Tone

**Somber → determined → resolute.** Not triumphant. Not "tech bro". The subject matter is harassment suppression — every frame must respect that weight.

Think: New York Times documentary graphics. Editorial. Typographic. Restrained motion. Long, deliberate beats. Silence used as punctuation.

**Anti-references (do NOT make it look like):**
- SaaS product hype reels (gradient meshes, whooshing transitions, upbeat EDM)
- Crypto launch trailers (glitch, neon, chrome)
- Corporate diversity videos (smiling stock footage, soft piano)
- Generic AI bot demos (chat bubble pop-ups with sparkle emojis)

## Emotional Arc

```
0s ─────────── 6s ──────────── 14s ─────────── 22s
 weight      mechanism       resolution
 ▼              ▼                ▼
 "this         "here's           "ship it.
  happens"     why it fails"     read the code."
```

The viewer should feel:
1. **Seconds 0–6:** Uncomfortable. Recognized. The problem is real.
2. **Seconds 6–14:** Curious → convinced. There's an actual mechanism here, not a slogan.
3. **Seconds 14–22:** Quiet determination. Not inspired — *equipped.*

## Core Idea

A launch video for an open-source tool does not need to sell. It needs to make the problem undeniable, show the mechanism in one clean visual, and point at the repo. Three beats. No fat.

**The one visual that must land:** the Dead Man's Switch timeline — an animated escalation chain (Day 0 → Day 7 → Day 10 → Day 17) that makes the mechanism legible in under 4 seconds. This is the whole product in one shot.

## Narrative Spine (the 3 acts)

### Act I — The Silence (0–6s)
Type-only scene. Black canvas. A tiny, universal micro-story unfolds in short sentences: someone gathered courage, reported it, and nothing happened. No names, no counts, no sector — just the emotional shape every viewer already knows. No music yet, or the barest tonal drone. Let the silence after the last line do the work.

### Act II — The Mechanism (6–16s)
Two sub-scenes:

**II-a (6–10s) — The failure loop.** A simple diagram: *Employee → Form → HR → …HR.* An arrow loops back on itself. Text: "The complaint goes to the people it's about."

**II-b (10–16s) — The fix.** The Rakshak logo reveals. The escalation timeline animates across the frame:
`Day 0 · Submitted` → `Day 7 · ICC` → `Day 10 · Audit Committee` → `Day 17 · District Officer`
Each checkpoint lights up in saffron. Subtitle: *"If no one acts, the system does."*

### Act III — The Hand-Off (16–22s)
Logo center-frame. Tagline lands: **"Because complaints shouldn't need courage."**
Below, three monospaced lines that read like a commit log:
```
open source · MIT
github.com/[org]/rakshak
Teams bot + tab · POSH Act 2013 compliant
```
Final hold: 1.5 seconds of stillness on the logo. End on a frame that could be a poster.

## Audio

**Music:** Sparse, single sustained cello note or low synth drone starting at ~3s, swelling slightly into Act II, softening into Act III. No drums. No drop.
**SFX:** A single soft mechanical "click" on each escalation checkpoint (Day 7, 10, 17) — the sound of a lock engaging, not a notification.
**No voiceover** for v1. The typography does the talking. (A narrated cutdown can come later.)

If licensing is a blocker, render silent — the video must work muted (most LinkedIn/Twitter autoplay is muted anyway). Design for silent-first.

## Success Criteria

A developer scrolling LinkedIn stops at the first 2 seconds because of the statistic. A CHRO watches the full 22 seconds because the escalation timeline is unambiguous. A journalist screenshots the Day 0 → Day 17 frame. Nobody asks "what does it do?" after watching.

## Out of Scope for v1

- Voiceover / narrated cut (save for a 60s explainer)
- Product UI screen-recordings (save for the demo video)
- Testimonials / customer logos (no customers yet; don't fake it)
- A hindi version (plan for v2 once English cut is locked)

## Deliverables

1. `index.html` — main 1920×1080 composition
2. `compositions/` — sub-compositions per scene (act1, act2a, act2b, act3)
3. `rakshak-launch-16x9.mp4` — final render, high quality
4. `rakshak-launch-9x16.mp4` — vertical cutdown for Reels/Shorts (Act I + III only, 15s)
5. `rakshak-launch-poster.png` — still frame from t=18s for social share cards

See [STORYBOARD.md](STORYBOARD.md) for per-scene timing and [DESIGN.md](DESIGN.md) for the visual identity.
