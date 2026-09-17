// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/worker.js — Cloudflare Workers 변형 (무인·무료 호스팅).
//
//   POST /api/ai   body: { task, payload }
//     -> Anthropic REST(POST /v1/messages) 를 호출하고 어시스턴트 텍스트를 반환.
//
// index.mjs 프록시와 동일한 태스크 라우팅 + 모델/캐싱 규칙을 그대로 사용합니다.
// 무료 티어라 관리할 서버가 없습니다(무인). 키는 Worker 시크릿으로만 보관:
//   wrangler secret put ANTHROPIC_API_KEY
//
// ⚠️ 키는 오직 Worker 시크릿(env.ANTHROPIC_API_KEY)에서만 다룹니다.
//    브라우저·프론트엔드·저장소에 절대 두지 마세요.

const DEFAULT_MODEL = "claude-haiku-4-5"; // 비용 우선 기본값 (AI_MODEL 로 상향 가능)
const MAX_TOKENS = { concierge: 700, theme: 500, course: 800, weekend: 700 };

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

function buildMessages(task, payload) {
  const content =
    `요청 태스크: ${task}\n`
    + `아래는 JSON 데이터입니다. 이 데이터만 사용하세요.\n`
    + "```json\n" + JSON.stringify(payload ?? {}, null, 2) + "\n```";
  return [{ role: "user", content }];
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": (env && env.CORS_ORIGIN) || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const MODEL = (env && env.AI_MODEL) || DEFAULT_MODEL;
    const IS_HAIKU = MODEL.startsWith("claude-haiku");

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(
        { ok: true, model: MODEL, keyLoaded: Boolean(env && env.ANTHROPIC_API_KEY) },
        { headers: cors }
      );
    }

    if (request.method === "POST" && url.pathname === "/api/ai") {
      try {
        const { task, payload } = await request.json();
        if (!task) return new Response("task 누락", { status: 400, headers: cors });
        if (!env || !env.ANTHROPIC_API_KEY) {
          // 키 미설정 → 프론트가 mock 으로 자동 폴백하도록 신호.
          return Response.json({ fallback: true }, { status: 429, headers: cors });
        }

        // index.mjs 와 동일한 모델/캐싱 규칙.
        const bodyReq = {
          model: MODEL,
          max_tokens: MAX_TOKENS[task] || 700,
          system: [{ type: "text", text: systemFor(task), cache_control: { type: "ephemeral" } }],
          messages: buildMessages(task, payload)
        };
        if (!IS_HAIKU) {
          bodyReq.thinking = { type: "adaptive" };
          bodyReq.output_config = { effort: (env && env.AI_EFFORT) || "low" };
        }

        const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
          },
          body: JSON.stringify(bodyReq)
        });

        if (!apiRes.ok) {
          const detail = await apiRes.text().catch(() => "");
          // 상류 오류 → 프론트가 mock 으로 자동 폴백.
          return Response.json({ fallback: true, status: apiRes.status, detail }, { status: 429, headers: cors });
        }

        const data = await apiRes.json();
        const text = Array.isArray(data.content)
          ? data.content.filter(b => b.type === "text").map(b => b.text).join("")
          : "";

        return new Response(text, {
          status: 200,
          headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" }
        });
      } catch (err) {
        return Response.json({ fallback: true, error: String(err && err.message || err) }, { status: 429, headers: cors });
      }
    }

    return new Response("not found", { status: 404, headers: cors });
  }
};
