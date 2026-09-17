// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/index.mjs — 실 Claude 연동용 백엔드 프록시 (무인·저비용 설계).
//
//   POST /api/ai   body: { task, payload }
//     -> Claude(messages.stream) 응답을 텍스트 스트림으로 그대로 흘려보냄.
//
// ⚠️ 보안: API 키는 오직 여기(서버)에서 process.env.ANTHROPIC_API_KEY 로만 다룹니다.
//    키를 브라우저·프론트엔드·저장소에 절대 두지 마세요. 이 프록시가 그 이유입니다.
//
// 실행:
//   cd server && npm install && cp .env.example .env  # .env 에 실제 키 입력
//   ANTHROPIC_API_KEY=... node index.mjs              # 또는 --env-file=.env (Node 20.6+)
//
// 이후 프론트의 ai/config.js 에서:
//   export const AI_ENDPOINT = "http://localhost:8787/api/ai";

import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";

const PORT = Number(process.env.PORT) || 8787;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// ── 비용 우선 기본 모델 ───────────────────────────────────────────────────────
// 기본은 가장 저렴한 claude-haiku-4-5 ($1 / $5 per MTok).
// 품질을 높이려면 AI_MODEL 을 claude-sonnet-5 또는 claude-opus-5 로 올리세요.
const MODEL = process.env.AI_MODEL || "claude-haiku-4-5";
const IS_HAIKU = MODEL.startsWith("claude-haiku");
const EFFORT = process.env.AI_EFFORT || "low";

// ── 비용 가드레일 ─────────────────────────────────────────────────────────────
const RATE_LIMIT_PER_MIN = Number(process.env.AI_RATE_LIMIT || 20);          // IP 당 분당 요청 수
const MONTHLY_TOKEN_CAP = Number(process.env.AI_MONTHLY_TOKEN_CAP || 2_000_000); // 월 토큰 예산

// 태스크별 출력 상한(모두 modest; 정말 필요한 곳만 소폭 상향).
const MAX_TOKENS = { concierge: 700, theme: 500, course: 800, weekend: 700 };

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("⚠️  ANTHROPIC_API_KEY 가 설정되지 않았습니다. .env 를 확인하세요. (요청 시 401 발생)");
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 인메모리 사용량/레이트리밋 상태 (단순·무의존) ────────────────────────────
const ipHits = new Map();          // ip -> [timestamp,...] (최근 1분)
let usage = { month: monthKey(), tokens: 0 };

function monthKey() { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`; }

function rateLimited(ip) {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter(t => now - t < 60_000);
  arr.push(now);
  ipHits.set(ip, arr);
  return arr.length > RATE_LIMIT_PER_MIN;
}

function budgetExceeded() {
  const mk = monthKey();
  if (usage.month !== mk) usage = { month: mk, tokens: 0 }; // 매월 리셋
  return usage.tokens >= MONTHLY_TOKEN_CAP;
}

function addUsage(u) {
  if (!u) return;
  const t = (u.input_tokens || 0) + (u.output_tokens || 0)
    + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  usage.tokens += t;
}

// ── 태스크별 시스템 프롬프트 (한국어 컨시어지 톤) ─────────────────────────────
// 안정적인(캐시 친화적) 문자열 — prompt caching 으로 반복 호출 시 비용 절감.
function systemFor(task) {
  const base = "당신은 '테마 게스트하우스' 예약 서비스의 친절한 한국어 여행 컨시어지입니다. "
    + "반드시 제공된 숙소·테마 데이터(payload)만 근거로 답하고, 없는 숙소를 지어내지 마세요. "
    + "간결하고 실용적으로, 데모 서비스임을 존중하는 톤으로 답하세요.";
  const extra = {
    concierge: " 사용자의 지역·분위기·예산 조건에 맞는 숙소를 최대 3곳 추천하고 이유를 덧붙이세요.",
    theme: " 사용자의 성향을 6개 테마 중 가장 잘 맞는 하나로 매칭하고 근거와 대표 숙소를 제시하세요.",
    course: " 선택된 숙소와 주변 랜드마크를 바탕으로 오전·오후·저녁 1일 여행 코스를 제안하세요.",
    weekend: " 다가오는 주말에 어울리는 테마 하나와 추천 숙소 2~3곳을 짧고 경쾌하게 골라 주세요."
  }[task] || "";
  return base + extra;
}

// 시스템을 캐시 블록 배열로 — cache_control:ephemeral 로 반복 호출이 캐시를 읽음.
function systemBlocks(task) {
  return [{ type: "text", text: systemFor(task), cache_control: { type: "ephemeral" } }];
}

// ── payload 를 사용자 메시지로 직렬화 ────────────────────────────────────────
function buildMessages(task, payload) {
  const content =
    `요청 태스크: ${task}\n`
    + `아래는 JSON 데이터입니다. 이 데이터만 사용하세요.\n`
    + "```json\n" + JSON.stringify(payload ?? {}, null, 2) + "\n```";
  return [{ role: "user", content }];
}

// 모델별 파라미터 규칙: Haiku 4.5 는 adaptive thinking / effort 를 받지 않음(400 방지).
function buildParams(task, payload) {
  const params = {
    model: MODEL,
    max_tokens: MAX_TOKENS[task] || 700,
    system: systemBlocks(task),
    messages: buildMessages(task, payload)
  };
  if (!IS_HAIKU) {
    params.thinking = { type: "adaptive" };
    params.output_config = { effort: EFFORT };
  }
  return params;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => {
      data += c;
      if (data.length > 1_000_000) { reject(new Error("payload too large")); req.destroy(); }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function send429Fallback(res) {
  // 한도 초과 → 프론트가 mock 으로 자동 폴백하도록 신호.
  res.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ fallback: true }));
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true, model: MODEL, keyLoaded: Boolean(process.env.ANTHROPIC_API_KEY),
      monthTokens: usage.tokens, monthlyCap: MONTHLY_TOKEN_CAP
    }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/ai") {
    // 비용 가드레일: 레이트리밋 + 월 토큰 예산 → 초과 시 429 {fallback:true}
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
      || req.socket.remoteAddress || "unknown";
    if (rateLimited(ip) || budgetExceeded()) { send429Fallback(res); return; }

    try {
      const body = await readBody(req);
      const { task, payload } = JSON.parse(body || "{}");
      if (!task) { res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }); res.end("task 누락"); return; }

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });

      const stream = client.messages.stream(buildParams(task, payload));
      stream.on("text", t => res.write(t));
      const final = await stream.finalMessage();
      addUsage(final && final.usage); // 스트림 최종 메시지의 usage 를 월 사용량에 누적
      res.end();
    } catch (err) {
      console.error("AI 프록시 오류:", err);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`\n[오류] ${err.message || err}`);
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`AI 프록시 실행 중: http://localhost:${PORT}  (POST /api/ai, model=${MODEL}, cap=${MONTHLY_TOKEN_CAP} tok/월)`);
});
