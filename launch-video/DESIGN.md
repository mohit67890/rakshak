# Rakshak Launch Video — Visual Identity

## Style Prompt

Editorial, somber, typographic. A dark near-black canvas with a single warm saffron accent that carries the brand. Serif display type for gravity and moral weight; monospaced type for the mechanical, auditable side of the product. Motion is deliberate and weighted — nothing springs, nothing bounces. Elements arrive like statements being made, not like a UI animating in. Think New York Times explanatory graphics, not SaaS product reels.

## Colors

| Role | Hex | Use |
|---|---|---|
| **Canvas** | `#0B0B0E` | Background. Near-black, not pure black — has a faint warmth. |
| **Ink** | `#F5F1EA` | Primary text. Warm off-white — never pure white. |
| **Muted** | `#6B6760` | Secondary text, timestamps, metadata. |
| **Saffron (brand)** | `#E8904A` | Brand accent. Logo color. Used for ONE element per scene max — the thing we want you to remember. |
| **Saffron dim** | `#8A5428` | Inactive timeline nodes, pre-light state. |
| **Line** | `#1F1D1A` | Rules, dividers, subtle borders. |

Do NOT introduce red, green, blue, or any additional accent. The restraint is the brand.

## Typography

| Family | Role | Weights |
|---|---|---|
| **Fraunces** (serif) | Display headlines, the tagline | 500, 700 |
| **Inter** (sans) | Body, labels, small UI text | 400, 500, 600 |
| **JetBrains Mono** | Data (Day 0, Day 7...), stats, URLs, "commit log" closing block | 400, 500 |

**Sizing (at 1920×1080):**
- Display headline: 120–140px, Fraunces 500, tight tracking (-0.02em)
- Secondary headline: 64–80px, Fraunces 500
- Body: 32–40px, Inter 400
- Metadata / timestamps: 22–26px, JetBrains Mono 400, letter-spacing 0.04em, uppercase for labels
- Tagline (final): 96px, Fraunces 700, tracking -0.015em

Numbers use `font-variant-numeric: tabular-nums`.

## Motion Rules

- **Easings:** `power3.out` and `power4.out` for entrances (weighted, decisive). `expo.in` for exits. No `back`, no `elastic`, no bounces.
- **Durations:** Headlines enter over 0.7–0.9s. Small elements 0.4–0.5s. Nothing faster than 0.3s — quickness reads as flippant here.
- **No simultaneous entrances.** Stagger everything by 0.15–0.3s. A reader should feel the sequence, not a wall of motion.
- **Hold beats.** After a headline lands, hold it for at least 1.2s of stillness before the next move. Silence between beats is part of the design.
- **Transitions between acts:** Slow fade-to-black + text cross-dissolve (0.6s). No wipes, no shader effects.
- **The escalation timeline is the ONE exception** where motion carries meaning — each checkpoint ignites with a soft saffron glow over 0.4s, slightly staggered. This is the product's core visual; it earns extra choreography.

## Layout Principles

- **Generous negative space.** Minimum 180px padding on all content containers at 1920×1080.
- **Left-aligned type for statement scenes** (Acts I and II). Centered type only for the tagline (Act III close).
- **Single focal point per scene.** If you have to explain what to look at, the scene is wrong.
- **Thin rules (1px, `#1F1D1A`) instead of boxes.** We're editorial, not carded.

## What NOT to Do

1. **No gradient meshes, blurred blobs, or "aurora" backgrounds.** The canvas stays flat `#0B0B0E`. Localized saffron glow (radial, tight) is permitted only on the timeline nodes.
2. **No glassmorphism, no neumorphism, no drop shadows on text.** Flat, typographic, confident.
3. **No emoji, no icons inside headlines.** A shield icon beside "Rakshak" is banned. The wordmark stands alone.
4. **No bouncing, springy, or elastic eases.** This is not a fintech onboarding flow.
5. **No stock footage of people, offices, or hands typing.** Type-first always. Imagery (if any) is the Rakshak logo and abstract diagrammatic elements.
6. **No full-screen linear gradients** (H.264 banding — radial + localized only).
7. **No "the power of AI" framing.** Rakshak is not an AI product to the viewer — it is a legal-compliance mechanism that happens to use AI.

## Sizing & Render

- **Primary:** 1920×1080, 30fps, H.264, high quality
- **Vertical:** 1080×1920, 30fps — re-author Acts I and III only (skip II's horizontal timeline)
- **Poster still:** 1920×1080 PNG from t=18.0s (logo + tagline frame)
