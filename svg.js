// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// svg.js — 인라인 SVG 아트 생성기 (바이너리 이미지 없음).
// 숙소 hue 값으로 결정적 그라디언트/테마 아이콘을 그립니다.

const THEME_ICON = {
  "rooftop-onsen": "♨️", "cafe-mood": "☕", "party": "🎉",
  "pet-friendly": "🐾", "women-only": "🌸", "surf-beach": "🏄"
};

/** 숙소 카드/상세용 히어로 SVG. variant 로 구도 약간 변경. */
export function heroSVG(stay, variant = 0) {
  const h = stay.hue ?? 200;
  const c1 = `hsl(${h} 70% 62%)`;
  const c2 = `hsl(${(h + 40) % 360} 65% 45%)`;
  const c3 = `hsl(${(h + 180) % 360} 60% 70%)`;
  const gid = `g-${stay.id}-${variant}`;
  const icon = THEME_ICON[stay.theme] || "🏠";
  // 창문/별 패턴
  let deco = "";
  for (let i = 0; i < 8; i++) {
    const x = 30 + ((i * 47 + variant * 13) % 340);
    const y = 40 + ((i * 31 + variant * 19) % 120);
    deco += `<circle cx="${x}" cy="${y}" r="${1.5 + (i % 3)}" fill="#fff" opacity="0.5"/>`;
  }
  let windows = "";
  for (let r = 0; r < 3; r++) for (let ccol = 0; ccol < 6; ccol++) {
    const on = ((r + ccol + variant) % 3 === 0) ? 0.85 : 0.25;
    windows += `<rect x="${60 + ccol * 46}" y="${190 + r * 26}" width="26" height="16" rx="2" fill="#fff" opacity="${on}"/>`;
  }
  return `<svg viewBox="0 0 400 300" role="img" aria-label="${stay.name} 이미지" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="400" height="300" fill="url(#${gid})"/>
  ${deco}
  <circle cx="${320 - variant * 20}" cy="70" r="34" fill="${c3}" opacity="0.85"/>
  <rect x="50" y="170" width="300" height="130" rx="8" fill="rgba(0,0,0,0.18)"/>
  ${windows}
  <text x="20" y="46" font-size="34">${icon}</text>
  <text x="200" y="290" text-anchor="middle" font-size="15" fill="#fff" opacity="0.9" font-family="sans-serif">${stay.themeName}</text>
</svg>`;
}

/** 갤러리 썸네일 4장 (variant 0~3). */
export function gallerySVGs(stay) {
  return [0, 1, 2, 3].map(v => heroSVG(stay, v));
}

/** 위치 스키매틱 (실제 지도 아님, 개념도). */
export function locationSVG(stay) {
  const h = stay.hue ?? 200;
  const marks = (stay.location?.landmarks || []).slice(0, 3);
  let pins = "";
  const pts = [[110, 90], [250, 140], [180, 210]];
  marks.forEach((m, i) => {
    const [x, y] = pts[i];
    pins += `<line x1="200" y1="150" x2="${x}" y2="${y}" stroke="hsl(${h} 40% 60%)" stroke-width="2" stroke-dasharray="4 3"/>
    <circle cx="${x}" cy="${y}" r="6" fill="hsl(${h} 70% 55%)"/>
    <text x="${x + 10}" y="${y + 4}" font-size="11" fill="currentColor" font-family="sans-serif">${m}</text>`;
  });
  return `<svg viewBox="0 0 400 300" role="img" aria-label="${stay.name} 위치 개념도" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="300" fill="hsl(${h} 25% 92%)"/>
  <path d="M0 150 H400 M200 0 V300" stroke="hsl(${h} 20% 80%)" stroke-width="1"/>
  ${pins}
  <circle cx="200" cy="150" r="12" fill="hsl(${h} 75% 45%)"/>
  <circle cx="200" cy="150" r="20" fill="none" stroke="hsl(${h} 75% 45%)" stroke-width="2" opacity="0.5"/>
  <text x="200" y="140" text-anchor="middle" font-size="12" fill="#fff" font-family="sans-serif">숙소</text>
</svg>`;
}

/** 별점 SVG (0~5, 0.1 단위). */
export function starsSVG(rating) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  const star = "M10 1 L12.6 7 L19 7.6 L14 12 L15.5 18.5 L10 15 L4.5 18.5 L6 12 L1 7.6 L7.4 7 Z";
  let full = "", back = "";
  for (let i = 0; i < 5; i++) {
    full += `<path d="${star}" transform="translate(${i * 20},0)" fill="currentColor"/>`;
    back += `<path d="${star}" transform="translate(${i * 20},0)" fill="currentColor" opacity="0.22"/>`;
  }
  return `<svg viewBox="0 0 100 20" class="stars" role="img" aria-label="평점 ${rating} / 5" xmlns="http://www.w3.org/2000/svg">
  <g>${back}</g><clipPath id="c${Math.round(pct)}"><rect x="0" y="0" width="${pct}" height="20"/></clipPath>
  <g clip-path="url(#c${Math.round(pct)})">${full}</g></svg>`;
}
