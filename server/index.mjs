// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/index.mjs — 실 Claude 연동용 백엔드 프록시.
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
const MODEL = "claude-opus-5";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("⚠️  ANTHROPIC_API_KEY 가 설정되지 않았습니다. .env 를 확인하세요. (요청 시 401 발생)");
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 태스크별 시스템 프롬프트 (한국어 컨시어지 톤) ─────────────────────────────
function systemFor(task) {
  const base = "당신은 '테마 게스트하우스' 예약 서비스의 친절한 한국어 여행 컨시어지입니다. "
    + "반드시 제공된 숙소·테마 데이터(payload)만 근거로 답하고, 없는 숙소를 지어내지 마세요. "
    + "간결하고 실용적으로, 데모 서비스임을 존중하는 톤으로 답하세요.";
  const extra = {
    concierge: " 사용자의 지역·분위기·예산 조건에 맞는 숙소를 최대 3곳 추천하고 이유를 덧붙이세요.",
    theme: " 사용자의 성향을 6개 테마 중 가장 잘 맞는 하나로 매칭하고 근거와 대표 숙소를 제시하세요.",
    course: " 선택된 숙소와 주변 랜드마크를 바탕으로 오전·오후·저녁 1일 여행 코스를 제안하세요."
  }[task] || "";
  return base + extra;
}

// ── payload 를 사용자 메시지로 직렬화 ────────────────────────────────────────
function buildMessages(task, payload) {
  const content =
    `요청 태스크: ${task}\n`
    + `아래는 JSON 데이터입니다. 이 데이터만 사용하세요.\n`
    + "```json\n" + JSON.stringify(payload ?? {}, null, 2) + "\n```";
  return [{ role: "user", content }];
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

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, model: MODEL, keyLoaded: Boolean(process.env.ANTHROPIC_API_KEY) }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/ai") {
    try {
      const body = await readBody(req);
      const { task, payload } = JSON.parse(body || "{}");
      if (!task) { res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }); res.end("task 누락"); return; }

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });

      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 2048,
        thinking: { type: "adaptive" },
        system: systemFor(task),
        messages: buildMessages(task, payload)
      });

      stream.on("text", t => res.write(t));
      await stream.finalMessage();
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
  console.log(`AI 프록시 실행 중: http://localhost:${PORT}  (POST /api/ai, model=${MODEL})`);
});
