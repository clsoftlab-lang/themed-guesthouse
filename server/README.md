<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국) -->

# AI 프록시 서버 (server/)

프론트엔드의 AI 기능을 **실제 Claude** 로 구동할 때 쓰는 얇은 백엔드 프록시입니다.
데모(mock) 모드에서는 이 서버가 **필요 없습니다** — 프론트가 브라우저 안에서 결정론적으로 답합니다.

## 왜 프록시가 필요한가

**API 키는 절대 브라우저·프론트엔드·저장소에 두면 안 됩니다.** 브라우저 코드는 모두 노출되므로
키가 유출됩니다. 이 프록시가 서버에서만 키를 보관하고, 프론트는 이 프록시에만 요청합니다.

```
브라우저(ai/ai.js) ──POST {task,payload}──▶ server/index.mjs ──▶ Anthropic API
                                            (ANTHROPIC_API_KEY 는 여기에만)
```

## 실행 방법

```bash
cd server
npm install                 # @anthropic-ai/sdk 설치
cp .env.example .env        # .env 에 실제 ANTHROPIC_API_KEY 입력
npm run dev                 # node --env-file=.env index.mjs  (Node 20.6+)
# 또는:  ANTHROPIC_API_KEY=sk-... npm start
```

서버가 `http://localhost:8787` 에서 뜹니다.

그다음 프론트의 `ai/config.js` 를 수정하세요:

```js
export const AI_ENDPOINT = "http://localhost:8787/api/ai";
```

이제 챗봇·테마 추천·여행 코스·주말 다이제스트가 실제 Claude(기본 `claude-haiku-4-5`)로 동작합니다.

## 엔드포인트

| 메서드 | 경로        | 설명 |
| ------ | ----------- | ---- |
| POST   | `/api/ai`   | body `{ task, payload }` → Claude 스트리밍 텍스트 응답 |
| GET    | `/health`   | 상태 확인 (`{ ok, model, keyLoaded, monthTokens, monthlyCap }`) |

`task` 는 `concierge` · `theme` · `course` · `weekend` 중 하나입니다.

## 모델·파라미터 (비용 우선)

- 기본 모델: **`claude-haiku-4-5`** ($1 / $5 per MTok). `AI_MODEL` 로 `claude-sonnet-5`·`claude-opus-5` 상향 가능.
- **Prompt caching**: 태스크별 시스템 프롬프트를 `cache_control:{type:'ephemeral'}` 블록으로 전송 → 반복 호출이 캐시를 읽어 비용 절감.
- **thinking/effort**: Haiku 4.5 는 adaptive thinking·effort 를 받지 않으므로 전송하지 않음(400 방지). 그 외 모델은 `thinking:{type:'adaptive'}` + `output_config:{effort: AI_EFFORT||'low'}`.
- **출력 상한**: 태스크별 modest `max_tokens`(기본 ~700).
- **비용 가드레일**: IP 당 분당 요청 수 제한(기본 20) + 월 토큰 예산(`AI_MONTHLY_TOKEN_CAP`, 기본 200만). 초과 시 HTTP 429 `{fallback:true}` → 프론트가 자동으로 mock 으로 폴백.
- `client.messages.stream(...)` 로 스트리밍하며, 최종 메시지 `usage` 를 월 사용량에 누적.

## 무인 배포 — Cloudflare Workers (무료 티어)

관리할 서버가 없는 무인 배포용 변형이 `worker.js` + `wrangler.toml` 로 포함되어 있습니다.
Anthropic REST(`POST https://api.anthropic.com/v1/messages`, `x-api-key`·`anthropic-version: 2023-06-01`)를
호출하며 위와 동일한 태스크 라우팅·모델·캐싱 규칙을 사용합니다.

```bash
cd server
npm i -g wrangler
wrangler secret put ANTHROPIC_API_KEY   # 키는 시크릿으로만 (저장소·브라우저 금지)
wrangler deploy
```

배포 후 프론트 `ai/config.js`:

```js
export const AI_ENDPOINT = "https://themed-guesthouse-ai.<your-subdomain>.workers.dev/api/ai";
```

## 환경변수 (.env / Worker vars·secret)

| 키 | 설명 |
| -- | ---- |
| `ANTHROPIC_API_KEY` | **필수.** Anthropic API 키. 서버/Worker 시크릿에서만 사용. |
| `AI_MODEL` | 모델(기본 `claude-haiku-4-5`; `claude-sonnet-5`·`claude-opus-5` 상향 가능) |
| `AI_EFFORT` | 비-Haiku 모델의 effort (기본 `low`) |
| `AI_MONTHLY_TOKEN_CAP` | 월 토큰 예산 (기본 2000000) |
| `AI_RATE_LIMIT` | IP 당 분당 요청 수 (기본 20) |
| `PORT` | 프록시 포트 (기본 8787, Node 프록시 전용) |
| `CORS_ORIGIN` | 허용 오리진 (기본 `*`; 운영 시 실제 도메인 권장) |

> ⚠️ `.env` 는 커밋 금지 (`.gitignore` 에 이미 제외). Worker 에서는 키를 `wrangler secret put` 으로만 설정하세요.
> CI 는 이 서버/Worker 를 설치·실행하지 않습니다.
