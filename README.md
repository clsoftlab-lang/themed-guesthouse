<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국) -->

# 테마 게스트하우스 · Themed Guesthouse

A no-build static booking site for **themed budget guesthouses** (루프탑 온천, 감성 카페형,
파티형, 반려동물, 여성전용, 서프 비치) aimed at young travelers and tourists. Browse themed
stays, filter and sort, open a stay, pick dates and rooms, get a live price quote from a real
availability/pricing engine, run a **simulated** checkout, and manage bookings and a wishlist.

한국어 문서: [README.ko.md](./README.ko.md)

**LIVE DEMO: https://clsoftlab-lang.github.io/themed-guesthouse/**

## What it is

A single-page app built with plain HTML + CSS + ES-module JavaScript. No framework, no bundler,
no dependencies — deployable to GitHub Pages as-is (`index.html` at repo root, relative paths only).
It ships 24 fictional stays (73 rooms) across 6 themes and 10 regions, each with rooms, amenities,
inline-SVG galleries, reviews/ratings, and a location schematic.

## Features

- **탐색/검색/필터/정렬** — theme chips, keyword search, region, min-guests, amenity, max-price slider; sort by recommended / price / rating.
- **숙소 상세** — theme intro, room types, amenities, 4-image inline-SVG gallery, reviews with average rating, location schematic (concept map, not a real map).
- **예약 흐름** — date range → availability check against existing bookings → guests & room count → live price quote → simulated payment → confirmation with booking number.
- **가용성/요금 엔진** (`pricing.js`, pure & unit-tested) — `total = Σ(nightlyRate + weekend/peak surcharge) × nights × rooms + cleaningFee + serviceFee`. Weekend (Fri/Sat) +15%, peak periods +25%, cleaning ₩15,000/room, service fee 5%. Availability counts date-overlapping bookings against per-room inventory.
- **내 예약 / 위시리스트 / 테마별 큐레이션** — persisted in `localStorage`.
- **반응형 + 라이트/다크** via `prefers-color-scheme`; Korean UI; inline-SVG art only (no binaries).

## 🤖 AI 기능 (API 연동)

Three AI features, wired into the UI and reusing the app's own stays/themes data:

1. **AI 여행 컨시어지 챗봇** (`#/ai`) — recommends stays from region / vibe / budget.
2. **테마 추천** (`#/ai`) — matches a traveler to one of the 6 themes.
3. **주변 여행 코스 생성** (stay detail page) — builds a 1-day itinerary for a chosen stay.

**Demo = mock (default).** With `AI_ENDPOINT` empty (`ai/config.js`), the front-end answers
in-browser via a deterministic Korean MockProvider — no network, no key. The AI visibly works
out of the box.

**Enable real Claude:** run the backend proxy in [`server/`](./server/README.md), then point the
front-end at it:

```bash
cd server
npm install                 # @anthropic-ai/sdk
cp .env.example .env        # put your real ANTHROPIC_API_KEY here
npm run dev                 # starts http://localhost:8787
```

Then set `ai/config.js`:

```js
export const AI_ENDPOINT = "http://localhost:8787/api/ai";
```

The proxy calls Claude with model **`claude-opus-5`** (`messages.stream`, `max_tokens: 2048`,
`thinking: { type: "adaptive" }`) and streams the answer back.

> **🔒 Keys are server-side only.** The `ANTHROPIC_API_KEY` lives **only** in `server/` (env var),
> **never** in the browser, front-end, or repository. `.env` is git-ignored; CI never installs or
> runs the server. This is the entire reason the proxy exists.

## Run locally

```bash
cd themed-guesthouse
python -m http.server 9002
# open http://localhost:9002
```

Any static file server works; ES modules require HTTP (not `file://`).

## Verify

```bash
node check.mjs   # JSON parse + node --check all JS + index.html containers + engine unit tests
```

CI runs the same via `.github/workflows/ci.yml`.

## DEMO-MODE boundaries

- **All stays, rooms, reviews and prices are fictional — no real properties or trademarks.**
- **Payment is fully simulated — no gateway, no card capture. Do not enter real card data.**
- **State lives in your browser's `localStorage`, which is not a real database — it is per-browser, wipeable, and never synced.**
- **No accounts, no login, no PII collection.**
- **A real build would add: a backend + database, real inventory & channel sync, a payment provider, authentication, email/SMS confirmations, and admin tooling.**

## Files

- `index.html`, `styles.css`
- `app.js` (router/views) + modules: `pricing.js` (pure engine), `svg.js` (inline art), `store.js` (localStorage)
- `ai/config.js` (`AI_ENDPOINT`), `ai/ai.js` (`askAI` + MockProvider) — pluggable AI-KIT
- `server/index.mjs`, `server/package.json`, `server/.env.example`, `server/README.md` — real-Claude proxy
- `data/stays.json`, `data/themes.json`, `data/pricing.json`
- `check.mjs`, `.github/workflows/ci.yml`
- `README.md`, `README.ko.md`, `LICENSE`, `.gitignore`

## Contributors

- Dr. Lee Il-guk (이일국)
- LWJ
- LMJ
- Claude (Anthropic)

## License

- Code: Apache-2.0 (see [LICENSE](./LICENSE))
- Documentation: CC BY 4.0

---

**Not an official Anthropic product.**

## 🎓 Idea origin

The seed idea for this project came from the **entrepreneurship class taught by Dr. Lee Il-guk (이일국) at Yongin University (용인대학교)**. The students in that class produced startup ideas of remarkable, standout creativity — this project is one of those exceptional ideas, finally brought to life as a working service. Built with deep admiration and gratitude for those students' imagination. *(No student personal information is included; only the idea itself was used, implemented clean-room.)*
