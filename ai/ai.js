// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// ai/ai.js — AI-KIT 진입점. 프론트엔드에서 쓰는 단 하나의 함수 askAI().
//
//   askAI(task, payload, { onToken } = {}) -> Promise<string>
//
//   - AI_ENDPOINT 가 비어 있으면(데모 기본값): 앱의 stays/themes 데이터를 그대로 재사용하는
//     결정론적 한국어 MockProvider 로 답합니다. 네트워크·키 전혀 없음.
//   - AI_ENDPOINT 가 설정되어 있으면: { task, payload } 를 그 주소로 POST 하고
//     스트리밍 응답(텍스트 조각)을 onToken 콜백으로 흘려보냅니다.
//
//   task: "concierge" | "theme" | "course"
//   onToken(chunk): 부분 텍스트가 도착할 때마다 호출(UI 실시간 표시용). 선택.
//
// ⚠️ 이 파일은 브라우저에서 실행됩니다. API 키를 절대 두지 마세요. 실제 호출은 server/ 프록시 경유.

import { AI_ENDPOINT } from "./config.js";

// pricing.js 의 통화 포맷을 재사용(중복 구현 방지).
import { formatKRW } from "../pricing.js";

/** 공개 API: 태스크와 페이로드를 받아 한국어 답변 문자열을 반환. */
export async function askAI(task, payload = {}, { onToken } = {}) {
  if (!AI_ENDPOINT) {
    // ---- 데모(mock) 모드 ----
    const text = buildMock(task, payload);
    return streamOut(text, onToken);
  }

  // ---- 실 연동 모드: 백엔드 프록시로 POST 후 스트리밍 수신 ----
  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, payload })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI 서버 오류(${res.status}) ${detail}`.trim());
  }
  if (!res.body || !res.body.getReader) {
    // 스트림 미지원 환경 폴백: 전체 텍스트 한 번에.
    const full = await res.text();
    onToken?.(full);
    return full;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) { full += chunk; onToken?.(chunk); }
  }
  return full;
}

// ────────────────────────────────────────────────────────────────────────────
// 스트리밍 헬퍼: 완성된 텍스트를 토큰 단위로 흘려보내 실시간 표시를 흉내냅니다.
// 내용 자체는 결정론적이며, 스트리밍은 표현일 뿐 정확성에 영향을 주지 않습니다.
// ────────────────────────────────────────────────────────────────────────────
async function streamOut(full, onToken) {
  if (typeof onToken === "function") {
    const tokens = full.match(/\S+\s*|\s+/g) || [full];
    for (const tk of tokens) {
      onToken(tk);
      await sleep(10);
    }
  }
  return full;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ────────────────────────────────────────────────────────────────────────────
// MockProvider — 앱의 실제 데이터(stays/themes)를 근거로 한 결정론적 한국어 답변.
// ────────────────────────────────────────────────────────────────────────────

// 자유 텍스트에서 테마 성향을 추론하기 위한 키워드 힌트.
const THEME_HINTS = {
  "rooftop-onsen": ["온천", "노천탕", "스파", "힐링", "야경", "뷰", "루프탑", "휴식", "따뜻"],
  "cafe-mood": ["카페", "감성", "조용", "커피", "라운지", "사진", "무드", "아늑"],
  "party": ["파티", "친구", "바베큐", "bbq", "루프탑바", "신나", "왁자", "모임", "생일"],
  "pet-friendly": ["반려", "강아지", "댕댕", "펫", "고양이", "애견", "동물"],
  "women-only": ["여성", "여자", "안전", "혼자", "안심", "보안", "파우더"],
  "surf-beach": ["서핑", "서프", "바다", "해변", "비치", "파도", "보드", "해수욕"]
};

function buildMock(task, payload) {
  switch (task) {
    case "concierge": return mockConcierge(payload);
    case "theme": return mockTheme(payload);
    case "course": return mockCourse(payload);
    default: return "지원하지 않는 요청이에요. (concierge · theme · course 중 하나를 사용하세요.)";
  }
}

/** 텍스트를 정규화한 소문자 토큰 배열로. */
function tokens(...parts) {
  return parts.join(" ").toLowerCase().split(/[\s,·/]+/).filter(Boolean);
}

/** 자유 텍스트와 테마 힌트의 매칭 점수. */
function themeScoreFromText(themeId, text) {
  const hints = THEME_HINTS[themeId] || [];
  let score = 0;
  for (const h of hints) if (text.includes(h)) score += 6;
  return score;
}

// (1) AI 여행 컨시어지 챗봇 — 지역/분위기/예산으로 숙소 추천.
function mockConcierge(payload) {
  const { stays = [], themes = [], region = "", vibe = "", budget = 0, query = "" } = payload;
  const text = `${region} ${vibe} ${query}`.toLowerCase();
  const words = tokens(region, vibe, query);

  let pool = stays.slice();
  if (region) pool = pool.filter(s => s.city.includes(region) || s.region.includes(region));
  const budgetNum = Number(budget) || 0;
  if (budgetNum) pool = pool.filter(s => s.priceFrom <= budgetNum);

  if (pool.length === 0) {
    const regionNote = region ? `‘${region}’ 지역에서 ` : "";
    const budgetNote = budgetNum ? `1박 ${formatKRW(budgetNum)} 이하로 ` : "";
    return `죄송해요, ${regionNote}${budgetNote}조건에 맞는 숙소를 찾지 못했어요.\n`
      + `예산을 조금 올리거나 지역 조건을 비워두고 다시 물어봐 주세요. `
      + `현재 데모 데이터에는 총 ${stays.length}개의 테마 숙소가 있어요.`;
  }

  const scored = pool.map(s => {
    let score = s.rating * 12 - s.priceFrom / 20000;
    const hay = `${s.themeName} ${s.description} ${s.amenities.join(" ")}`.toLowerCase();
    for (const w of words) if (w.length > 1 && hay.includes(w)) score += 8;
    score += themeScoreFromText(s.theme, text) * 0.5;
    return { s, score };
  }).sort((a, b) => b.score - a.score || a.s.priceFrom - b.s.priceFrom);

  const top = scored.slice(0, 3).map(x => x.s);

  const intro = [
    "안녕하세요! 테마 게스트하우스 AI 컨시어지예요. 🧳",
    describeRequest(region, vibe, budgetNum) + " 아래 숙소를 추천드려요:"
  ].join(" ");

  const lines = top.map((s, i) => {
    const why = reasonFor(s, words, text, budgetNum);
    return `${i + 1}. ${s.emojiLine || (s.themeName)} · ${s.name} (${s.region})\n`
      + `   · 평점 ${s.rating}/5 (리뷰 ${s.reviewCount}) · 1박 ${formatKRW(s.priceFrom)}~\n`
      + `   · 추천 이유: ${why}`;
  });

  const tail = `\n총 ${pool.length}곳 중에서 골랐어요. 마음에 드는 숙소의 상세 페이지에서 날짜를 고르면 실시간 요금을 확인할 수 있어요.`
    + `\n⚠️ 데모 모드 — 가상의 숙소이며 실제 예약·결제가 아닙니다.`;

  return `${intro}\n\n${lines.join("\n\n")}\n${tail}`;
}

function describeRequest(region, vibe, budget) {
  const bits = [];
  if (region) bits.push(`‘${region}’`);
  if (vibe) bits.push(`‘${vibe}’ 분위기`);
  if (budget) bits.push(`1박 ${formatKRW(budget)} 이하`);
  if (bits.length === 0) return "요청하신 조건으로";
  return `${bits.join(", ")} 조건에 맞춰`;
}

function reasonFor(s, words, text, budget) {
  const reasons = [];
  const matchedAmen = s.amenities.filter(a => words.some(w => w.length > 1 && a.toLowerCase().includes(w)));
  if (matchedAmen.length) reasons.push(`요청하신 ${matchedAmen.slice(0, 2).join("·")} 보유`);
  if (themeScoreFromText(s.theme, text) > 0) reasons.push(`${s.themeName} 테마가 분위기와 잘 맞음`);
  if (budget && s.priceFrom <= budget * 0.8) reasons.push("예산 대비 여유 있는 가격");
  if (s.rating >= 4.7) reasons.push(`높은 평점(${s.rating})`);
  if (reasons.length === 0) reasons.push(`${s.themeName} 감성의 인기 숙소`);
  return reasons.join(", ") + ".";
}

// (2) 테마 추천 — 여행자 성향을 테마에 매칭.
function mockTheme(payload) {
  const { themes = [], stays = [], vibe = "", query = "" } = payload;
  const text = `${vibe} ${query}`.toLowerCase();
  const words = tokens(vibe, query);

  if (themes.length === 0) return "테마 데이터가 없어요.";

  const scored = themes.map(t => {
    let score = themeScoreFromText(t.id, text);
    const hay = `${t.name} ${t.blurb}`.toLowerCase();
    for (const w of words) if (w.length > 1 && hay.includes(w)) score += 5;
    return { t, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0].t;
  const confident = scored[0].score > 0;
  const sample = stays.filter(s => s.theme === best.id)
    .sort((a, b) => b.rating - a.rating).slice(0, 3);

  const head = confident
    ? `당신에게 딱 맞는 테마는 ${best.emoji} ${best.name} 예요!`
    : `입력이 짧아 대표 테마로 ${best.emoji} ${best.name} 을(를) 추천드려요. (분위기를 더 알려주시면 정교해져요.)`;

  const why = `${best.blurb}. `
    + (confident ? "말씀하신 분위기와 키워드가 이 테마와 가장 잘 어울려요." : "가장 무난하게 즐길 수 있는 테마예요.");

  const runnerUp = scored[1] && scored[1].score > 0
    ? `\n다음 후보로는 ${scored[1].t.emoji} ${scored[1].t.name} 도 잘 맞아요.`
    : "";

  const sampleLines = sample.length
    ? "\n\n이 테마의 추천 숙소:\n" + sample.map(s =>
        `· ${s.name} (${s.region}) — 평점 ${s.rating}/5, 1박 ${formatKRW(s.priceFrom)}~`).join("\n")
    : "";

  return `${head}\n\n왜냐하면: ${why}${runnerUp}${sampleLines}`
    + `\n\n⚠️ 데모 모드 — 추천은 가상의 데모 데이터를 근거로 합니다.`;
}

// (3) 주변 여행 코스 생성 — 선택한 숙소 기준 하루 코스.
function mockCourse(payload) {
  const { stay } = payload;
  if (!stay) return "숙소 정보가 없어 코스를 만들 수 없어요.";

  const landmarks = (stay.location && stay.location.landmarks) || [];
  const region = stay.region || stay.city || "여행지";
  const themeVibe = {
    "rooftop-onsen": "온천으로 하루의 피로를 푸는",
    "cafe-mood": "감성 카페를 순례하는",
    "party": "친구들과 신나게 즐기는",
    "pet-friendly": "반려동물과 함께 걷는",
    "women-only": "혼자여도 안심되는",
    "surf-beach": "바다와 파도를 즐기는"
  }[stay.theme] || "여유롭게 둘러보는";

  const l = (i, fallback) => landmarks[i] || fallback;

  const morning = `☀️ 오전 — ${l(0, "동네 골목 산책")} 부터 가볍게 시작해요. `
    + `${stay.name} 에서 도보로 이동하기 좋아요.`;
  const noon = `🍜 점심·오후 — ${l(1, "지역 맛집")} 에서 식사 후 ${l(2, "주변 명소")} 를 둘러보세요. `
    + `${region} 의 분위기를 만끽하기 좋은 코스예요.`;
  const evening = `🌙 저녁 — 숙소로 돌아와 ${bestAmenity(stay)} 을(를) 즐기며 ${themeVibe} 하루를 마무리해요.`;

  const tip = `💡 팁 — ${stay.themeName} 테마인 만큼 ${themeTip(stay.theme)}`;

  return [
    `${stay.name} (${region}) 주변 1일 여행 코스예요. 🗺️`,
    "",
    morning,
    noon,
    evening,
    "",
    tip,
    "",
    "⚠️ 데모 모드 — 코스는 숙소 데이터의 랜드마크를 바탕으로 자동 생성한 예시입니다."
  ].join("\n");
}

function bestAmenity(stay) {
  const prefer = ["노천탕", "루프탑", "라운지 카페", "루프탑 바", "반려견 놀이터", "파우더룸", "보드 보관"];
  const found = prefer.find(p => (stay.amenities || []).includes(p));
  return found || (stay.amenities && stay.amenities[0]) || "숙소의 편의시설";
}

function themeTip(themeId) {
  return {
    "rooftop-onsen": "저녁 노천탕은 야경이 예쁜 해 질 무렵을 추천해요.",
    "cafe-mood": "오전 카페 오픈런으로 자리를 선점하면 사진이 잘 나와요.",
    "party": "바비큐 재료는 미리 사두면 저녁 파티가 한결 편해요.",
    "pet-friendly": "반려동물 물그릇·배변봉투를 챙기면 산책이 즐거워요.",
    "women-only": "야간 이동은 숙소 추천 동선을 이용하면 더 안심돼요.",
    "surf-beach": "서핑 강습은 파도가 잔잔한 오전 타임이 입문자에게 좋아요."
  }[themeId] || "여행 전 도보 동선을 미리 확인해 두면 좋아요.";
}
