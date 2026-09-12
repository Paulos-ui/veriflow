# The Seal — VeriFlow design system

Authoritative. Any UI work in this repo resolves conflicts against this file.
Written for an **enterprise trust surface / agent control plane** — not a
consumer AI product. The user is an operator who is accountable for what an
agent did with their money. They are reading for evidence, not delight.

---

## 1. Positioning

VeriFlow's claim is that an agent's authority is **visible, bounded, and
provable**. The interface has to make that claim legible in the first three
seconds, without reading a word of body copy.

That yields one governing rule, from which most of what follows is derived:

> **State must be readable before language.** Colour, ring geometry, and motion
> carry the state. Text confirms it. Never the reverse.

The failure mode this guards against is a control plane where "approved",
"waiting" and "refused" look alike and the operator has to read carefully to
find out whether money moved. That is exactly the drift this file corrects
(see §3).

### Reference lineage

Instruments, not dashboards. The visual ancestors are struck seals, bank note
guilloché, and precision measurement gear — surfaces where the ornament *is*
the anti-forgery mechanism. Not: SaaS marketing, crypto neon, terminal
cosplay.

### Anti-patterns — banned in this repo

- Purple-glow SaaS gradient heroes; neon cyberpunk; "AI orb" mascots.
- Glassmorphism applied as decoration rather than depth signalling.
- Inter-on-navy generic dashboard chrome.
- `whileInView` opacity/translate reveals as the primary motion system.
- Decorative motion with no state referent — ambient float, idle shimmer on
  content, pulsing things that aren't actually pending.
- Colour as pure garnish. Every hue in §2 has exactly one meaning.
- Success signalled by *adding* glow. In this system, success is **stillness**.

---

## 2. Tokens

### 2.1 Substrate

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0A0C12` | page base |
| `surface` | `#141821` | panels |
| `raised` | `#1A1F2A` | cards on panels, modals |
| `hairline` | `#2A2E38` | 1px separators, inactive borders |

Three depths only. A fourth invites arbitrary layering.

### 2.2 Text

| Token | Hex | Contrast on ink | Use |
|---|---|---|---|
| `bone` | `#EFEAE0` | 16.3:1 | primary text |
| `muted` | `#9A968E` | 6.6:1 | secondary, labels |
| `faint` | `#6B6760` | 3.5:1 | **UI furniture only** — ticks, disabled glyphs, rules |

`faint` fails AA for body text at 3.5:1. It is never allowed to carry a
sentence the operator needs. Enforced by review, not by tooling.

### 2.3 State — the load-bearing four

Each hue means exactly one thing, everywhere, forever. Measured against `ink`.

| Token | Hex | Contrast | Means | Non-colour cue |
|---|---|---|---|---|
| `verdigris` | `#4FB09A` | 7.5:1 | **verified / allowed** | closed solid ring |
| `amber` | `#E0A64B` | 9.1:1 | **awaiting / gate open** | dashed rotating arc |
| `violet` | `#9B8CFF` | 7.1:1 | **identity** — DIDs, keys, agents | monospace + key glyph |
| `terracotta` | `#E07A5F` | 6.6:1 | **refused / chain stopped** | open arc + lock tick |

All four clear AA for normal text and AAA for large text.

`violet` is a *category*, not a status: it marks cryptographic identity
material (DIDs, pubkeys, credential ids) wherever it appears. An agent chip is
violet because it is an identity, regardless of whether its current hop passed.

### 2.4 Metal

| Token | Hex | Contrast | Use |
|---|---|---|---|
| `gold` | `#C5A46E` | 8.3:1 | the seal's physical material — brand only |

**Gold is not a state.** It is the metal the seal is struck from: the mark, the
logo, the bezel. Earlier revisions used gold *as* "verified", which is what
collapsed the palette. If a gold element needs to express pass/fail, it is the
wrong element.

### 2.5 Colour-blind and compression safety

Verdigris/terracotta is a green–red pairing, which is the one axis deuteranopes
lose. That is why **every state also carries a geometric cue** (§5.2) and a
text label. Checked additionally against greyscale: the four states differ in
luminance (7.5 / 9.1 / 7.1 / 6.6 on ink), so they remain distinguishable in a
compressed demo video or a monochrome screenshot.

### 2.6 Type

| Role | Family | Notes |
|---|---|---|
| Display | **Fraunces** | headings only, optical sizing on, tracking −0.02em |
| UI | **Geist** | all interface text |
| Crypto | **Geist Mono** | hashes, DIDs, pubkeys, amounts in evidence rows, tabular-nums |

Fraunces never runs below 18px and never sets body copy — it is the voice of
the *document*, not the instrument. Any hash, key, or DID is Geist Mono without
exception: monospace is how the operator knows a string is verbatim machine
output rather than prose.

Eyebrow: Geist Mono, 11px, uppercase, 0.18em tracking, `muted`.

### 2.7 Geometry

- `seal` 2px — evidence rows, chips. Struck, not soft.
- `card` 12px — panels.
- `xl2` 20px — the dossier shell.

Spacing is a 4px base scale. Hairline borders at 1px; never 2px, which reads as
a web button rather than an engraved edge.

---

## 3. The drift this file corrects

Before this revision, `globals.css` resolved `--verdigris`, `--amber`,
`--signal` and `--gold` to `#c5a46e`, `#d8b36a`, `#a98a5e` and `#c5a46e` — four
tokens, one hue, maximum ΔL under 0.05. Verified, awaiting, identity and brand
were visually identical; state survived only in label text.

For a product whose entire claim is *authority is visible*, that was a
correctness bug wearing a taste costume. §2.3 is the fix and is not
re-litigable without a new entry in this section explaining what replaced it.

---

## 4. Motion — authority narrowing

### 4.1 The concept

An ungoverned agent is **wide, open, and drifting**. Every mandate rule that
binds it **tightens** the ring. A fully-bound agent is **tight, closed, and
still**.

This is the only motion idea in the product. Everything animated is a view onto
it.

```
narrowing = 0 ........................... 1
radius       wide ..................... tight
dash         broken ................... solid
drift        rotating .................. still
ticks        none ............ one per bound rule
```

### 4.2 Terminal states

| State | Ring behaviour | Why |
|---|---|---|
| **verified** | contracts to tight, closes, **stops** | Authority fully resolved. Stillness = trust. Not a glow — a glow says "look at me"; stillness says "settled". |
| **awaiting** | holds mid-radius, arc rotates slowly, dashed | Something is genuinely pending. Motion here is *information*: it stops the moment the gate resolves. |
| **refused** | locks mid-contraction, hue snaps to terracotta, arc **stays open** | Authority never closed. The visible gap is the point: the chain stopped here. |

The refused ring must never complete its circle. An operator scanning a
timeline should see the break in the geometry before reading the reason.

### 4.3 One primitive, two drivers

`AuthorityRing` takes `narrowing: number` (0–1) and
`state: "awaiting" | "verified" | "refused"`.

- `/about` drives `narrowing` from Framer's `useScroll` progress.
- The case timeline drives it from `completedHops / totalHops`.

Identical component, identical physics, no duplicated maths. This is what makes
the marketing page and the live product feel like one object rather than a page
about a product.

### 4.4 Budget and easing

- Ring transitions: 420–700ms, `cubic-bezier(0.22, 1, 0.36, 1)`.
- Tick snap on a rule binding: 160ms, near-linear. A snap, not a fade.
- State hue change: 240ms.
- Nothing animates longer than 900ms except the deliberate `awaiting` rotation.

### 4.5 What is not allowed

Fade-ins on content arrival. Staggered list reveals as the primary system.
Ambient float on anything that isn't pending. Parallax for its own sake. If a
motion cannot name the state change it depicts, it is deleted.

### 4.6 Reduced motion

Under `prefers-reduced-motion: reduce`, rings adopt their **final geometry
instantly** — tight/closed for verified, mid/open for refused. They do not
merely animate faster. The reduced-motion user gets the same *information*
(radius, closure, hue, ticks) with none of the transition. State is never
carried only by the animation itself.

---

## 5. Components

### 5.1 Seal

Struck-metal mark in `gold`. Guilloché bezel, emboss via offset dark stroke,
engraved inner ring. The seal is brand and object. Its *state* is expressed by
the `AuthorityRing` around it, never by recolouring the metal.

### 5.2 Hop node

A hop in the case timeline. Renders: agent chip (violet), tool name (mono),
state ring, and — once resolved — a proof hash stub. Click opens the proof.

Geometric cue per state, so the timeline is readable in greyscale:

```
verified   ●──   closed dot, solid connector to next hop
awaiting   ◌┈┈   dashed ring, dashed connector
refused    ◑ ╳   half-ring, connector terminates in a cross
```

The connector after a refused hop **does not continue**. Dead-ends are drawn as
dead-ends.

### 5.3 Why-blocked panel

Opens from a refused hop. Structure, in order:

1. The refusal in one plain sentence.
2. The numbers, in mono, side by side — `cap $5,000.00` vs `requested $7,400.00`.
3. What would have to change for it to pass.

Never a bare error code. Never a stack trace. The operator is deciding whether
to widen a mandate; give them the comparison that decision needs.

### 5.4 Mandate chip

Compact, scannable: functions, cap, expiry, scope. Renders as bounds, not
permissions — "≤ $5,000" reads as a ceiling, "$5,000 allowed" reads as a
budget. The framing is deliberate.

### 5.5 Evidence row

Label in eyebrow, value in Geist Mono, copy affordance. 2px radius, hairline
top border. The atom of every proof surface.

---

## 6. Accessibility floor

- All state colours ≥ 4.5:1 on their background; verified against `ink`,
  `surface`, and `raised` (§2.3).
- Colour is **never** the sole carrier of state — geometry and text always
  accompany (§2.5, §5.2).
- Focus is visible on every interactive element: 2px `violet` outline, 2px
  offset. Never removed, never relying on colour alone against a dark field.
- Hit targets ≥ 44×44px, including hop nodes.
- Timeline is a semantic ordered list; hops are real `<button>`s, keyboard
  reachable in order.
- `prefers-reduced-motion` honoured per §4.6.
- Live regions announce hop state changes so a screen-reader operator learns a
  payment was refused without polling the DOM.
- No text below 12px. Mono evidence text sits at 12.5px.

---

## 7. Voice

Declarative, specific, quantified. The interface is testifying, not selling.

> Refused — $7,400.00 exceeds the $5,000.00 cap on mandate `a91f…`.

not

> Oops! Something went wrong with this payment.

Rules: never apologise for a correct refusal — a fail-closed is the product
working. Never say "AI" where "agent" is meant. Never promise more than the
proof supports; if a hop ran from a fixture, the UI says so on the hop itself.
Numbers always carry units and currency. Hashes are always truncated
head-and-tail with the full value one click away, never silently shortened.

---

## 8. Honesty surface

A judge must be able to tell live from recorded **on the hop**, not in a
footnote.

- `LIVE` — real external API round-trip.
- `FIXTURE` — recorded response, adapter and mandate gate identical.
- `SIMULATED` — write suppressed by shadow mode; the gate still ran.

Badge sits on the hop node and repeats in the proof. A `SIMULATED` pay is never
styled as a completed payment.

**The invariant:** a refused action is never rendered as a success, in any mode,
under any circumstance. If the mandate would reject it, no mode fakes a pass.

---

## 9. Reconciliation with ui-ux-pro-max

Sections 1–8 are authoritative. This section records what was taken from the
`ui-ux-pro-max` design-intelligence skill, and — more usefully — the four places
its generic guidance was **overruled**, so a future contributor doesn't
"fix" a deliberate divergence back into a default.

The rule IDs below are the skill's own, from its UX guideline database.

### 9.1 Adopted without modification

| Rule | Where it landed |
|---|---|
| `long-token-wrapping` | `.crypto` uses `overflow-wrap: anywhere` + `min-inline-size: 0`. Not `break-all`, which would hyphenate "Aurora Systems" mid-word in the same run as a 64-char hash. |
| `compact-label-overflow` | Mandate chips `truncate` inside `min-w-0`; the full value is disclosed by an operable `<button aria-expanded>`, never a hover-only tooltip. |
| `chip-collection-reflow` | Chips are `whitespace-nowrap` so a chip wraps as a unit and never splits "≤ $5,000" across two lines. |
| `error-clarity` / `error-recovery` | §5.3's fixed three-part order — plain sentence, side-by-side evidence, remedy — is this rule made concrete. The remedy line exists because of it. |
| `focus-management` | The why-blocked heading is `tabIndex={-1}` and takes focus on open, so a keyboard operator lands on the reason rather than hunting for it. |
| `progressive-loading` | `RunningSkeleton` is shaped like the timeline it replaces and carries `aria-busy`. No spinner, no "Loading…". |
| `contextual-live-badge-updates` | One `aria-live="polite"` region carrying a whole sentence (`announce()`), not per-node chatter that would flood a screen reader mid-run. |
| `color-not-only` | Already §2.5 and §5.2. The skill independently confirms it; the glyph set `● ◌ ◑ ○` is the implementation. |

### 9.2 Where the Seal overrules the skill

**1. A refusal is not an error state.** The skill's error patterns assume a
user did something wrong and wants to undo it. In VeriFlow a refusal is the
product succeeding, and §7 forbids apologising for one. So `alert`
(terracotta `#E07A5F`) is *not* a destructive-action colour, no refusal surface
uses a warning icon, and the why-blocked panel closes by saying the mandate
held. The skill's error copy patterns were not used.

**2. `faint` (#6B6760, 3.5:1) stays, restricted.** The skill's accessibility
tier would reject it outright. It is retained for UI furniture only — hairline
labels, unreached-step glyphs, disabled affordances — never for text conveying
state, and never as the sole carrier of anything. Enforcing it as a text colour
would flatten three depths of hierarchy into two on an already-dark field. The
restriction is the mitigation; it is documented rather than silently taken.

**3. Motion is not the skill's animation library.** Its scroll-reveal and
`whileInView` opacity recipes are explicitly out of scope (§4). Authority
narrowing is one primitive with two drivers, and reduced-motion takes the
*final geometry instantly* (§4.6) rather than shortening the duration — because
the ring's geometry **is** the state, and a faster lie is still a lie.

**4. Style-domain output was consulted, not installed.** The skill's style
recommendations (glassmorphism, gradient systems) were read for their
accessibility and performance notes only. `.glass` predates the reconciliation
and stays because it earns its place on raised panels; it was not extended.
There is no second brand here.

### 9.3 Standing constraint

`--persist`/`--force` was never run against this file. MASTER.md is
hand-authored and stays that way: generated design tokens would overwrite the
contrast ratios in §2, which were measured, not produced.
