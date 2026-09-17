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

이제 챗봇·테마 추천·여행 코스가 실제 Claude(`claude-opus-5`)로 동작합니다.

## 엔드포인트

| 메서드 | 경로        | 설명 |
| ------ | ----------- | ---- |
| POST   | `/api/ai`   | body `{ task, payload }` → Claude 스트리밍 텍스트 응답 |
| GET    | `/health`   | 상태 확인 (`{ ok, model, keyLoaded }`) |

`task` 는 `concierge` · `theme` · `course` 중 하나입니다.

## 모델·파라미터

- 모델: `claude-opus-5`
- `max_tokens: 2048`, `thinking: { type: "adaptive" }`
- `client.messages.stream(...)` 로 스트리밍

## 환경변수 (.env)

| 키 | 설명 |
| -- | ---- |
| `ANTHROPIC_API_KEY` | **필수.** Anthropic API 키. 서버에서만 사용. |
| `PORT` | 프록시 포트 (기본 8787) |
| `CORS_ORIGIN` | 허용 오리진 (기본 `*`; 운영 시 실제 도메인 권장) |

> ⚠️ `.env` 는 커밋 금지 (`.gitignore` 에 이미 제외). CI 는 이 서버를 설치·실행하지 않습니다.
