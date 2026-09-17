// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// check.mjs — CI 검증 스크립트.
//   1) data/*.json 파싱 검증
//   2) 모든 JS 에 `node --check`
//   3) index.html 필수 컨테이너 확인
//   4) pricing.js 요금/가용성 엔진 단위 테스트
// 실패 시 비정상 종료(코드 1).

import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  quote, checkAvailability, nightsBetween, isWeekend, isPeak, eachNight, formatKRW
} from "./pricing.js";
import { AI_ENDPOINT } from "./ai/config.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); } };
const near = (a, b) => Math.abs(a - b) < 1e-6;

console.log("== 1. JSON 파싱 ==");
const dataDir = join(ROOT, "data");
const jsonFiles = readdirSync(dataDir).filter(f => f.endsWith(".json"));
ok("data/ JSON 파일 존재", jsonFiles.length >= 3);
let stays;
for (const f of jsonFiles) {
  try {
    const parsed = JSON.parse(readFileSync(join(dataDir, f), "utf8"));
    ok(`파싱 ${f}`, true);
    if (f === "stays.json") stays = parsed;
  } catch (e) { ok(`파싱 ${f} (${e.message})`, false); }
}

console.log("== 2. 시드 데이터 형태 ==");
ok("숙소 24개 이상", Array.isArray(stays) && stays.length >= 24);
const roomTotal = stays.reduce((a, s) => a + (s.rooms?.length || 0), 0);
ok("룸 24개 이상", roomTotal >= 24);
ok("모든 숙소 필수 필드", stays.every(s =>
  s.id && s.name && s.theme && s.region && Array.isArray(s.rooms) && s.rooms.length &&
  Array.isArray(s.amenities) && Array.isArray(s.reviews) && typeof s.priceFrom === "number"));
ok("모든 룸 재고/요금 보유", stays.every(s => s.rooms.every(r =>
  typeof r.nightlyRate === "number" && r.nightlyRate > 0 && typeof r.inventory === "number")));

console.log("== 3. node --check (전 JS) ==");
const jsFiles = readdirSync(ROOT).filter(f => f.endsWith(".js") || f.endsWith(".mjs"));
for (const f of jsFiles) {
  try { execFileSync(process.execPath, ["--check", join(ROOT, f)], { stdio: "pipe" }); ok(`--check ${f}`, true); }
  catch (e) { ok(`--check ${f}`, false); console.error(String(e.stderr || e)); }
}

console.log("== 4. index.html 컨테이너 ==");
const html = readFileSync(join(ROOT, "index.html"), "utf8");
ok('index.html #app 컨테이너', /id="app"/.test(html));
ok('index.html app.js 모듈 로드', /type="module"[^>]*src="\.\/app\.js"/.test(html));
ok('index.html 네비게이션', /data-nav=/.test(html));
ok('index.html DEMO 표기', /데모 모드/.test(html));

console.log("== 5. 요금/가용성 엔진 단위 테스트 ==");
const P = {
  cleaningFee: 15000, weekendSurchargePct: 15, peakSurchargePct: 25, serviceFeePct: 5,
  peakPeriods: [{ from: "2026-07-15", to: "2026-08-20" }]
};

// 날짜 헬퍼
ok("nightsBetween 정상", nightsBetween("2026-03-02", "2026-03-05") === 3);
ok("nightsBetween 역순 0", nightsBetween("2026-03-05", "2026-03-02") === 0);
ok("nightsBetween 동일 0", nightsBetween("2026-03-05", "2026-03-05") === 0);
ok("eachNight 길이", eachNight("2026-03-02", "2026-03-05").length === 3);
ok("isWeekend 금요일", isWeekend("2026-03-06") === true);   // 2026-03-06 = 금
ok("isWeekend 토요일", isWeekend("2026-03-07") === true);   // 토
ok("isWeekend 화요일", isWeekend("2026-03-03") === false);  // 화
ok("isPeak 성수기 내", isPeak("2026-08-01", P.peakPeriods) === true);
ok("isPeak 성수기 밖", isPeak("2026-03-03", P.peakPeriods) === false);

// 평일 2박, 할증 없음: (50000*2) + 15000 청소비, +5% 서비스료
const q1 = quote({ nightlyRate: 50000, checkIn: "2026-03-03", checkOut: "2026-03-05", rooms: 1, pricing: P });
ok("q1 박수 2", q1.nights === 2);
ok("q1 baseTotal 100000", q1.baseTotal === 100000);
ok("q1 주말할증 0", q1.weekendSurcharge === 0);
ok("q1 성수기할증 0", q1.peakSurcharge === 0);
ok("q1 청소비 15000", q1.cleaningFee === 15000);
ok("q1 서비스료 5%", q1.serviceFee === Math.round((100000 + 15000) * 0.05)); // 5750
ok("q1 합계", q1.total === 100000 + 15000 + 5750);

// 주말 포함 (금·토 = 2박 모두 주말): 3/6~3/8 → 금,토
const q2 = quote({ nightlyRate: 50000, checkIn: "2026-03-06", checkOut: "2026-03-08", rooms: 1, pricing: P });
ok("q2 주말할증 = 2박×15%", q2.weekendSurcharge === Math.round(50000 * 0.15) * 2); // 15000
ok("q2 base 유지", q2.baseTotal === 100000);

// 성수기 평일 1박: +25%
const q3 = quote({ nightlyRate: 40000, checkIn: "2026-08-03", checkOut: "2026-08-04", rooms: 1, pricing: P }); // 8/3=월
ok("q3 성수기할증 25%", q3.peakSurcharge === Math.round(40000 * 0.25)); // 10000
ok("q3 주말할증 0", q3.weekendSurcharge === 0);

// 룸 2개 → 청소비/요금 배수
const q4 = quote({ nightlyRate: 50000, checkIn: "2026-03-03", checkOut: "2026-03-05", rooms: 2, pricing: P });
ok("q4 base ×2룸", q4.baseTotal === 200000);
ok("q4 청소비 ×2룸", q4.cleaningFee === 30000);

// 잘못된 날짜 → 0박, 총액 0
const q5 = quote({ nightlyRate: 50000, checkIn: "2026-03-05", checkOut: "2026-03-03", rooms: 1, pricing: P });
ok("q5 역순 0박", q5.nights === 0);
ok("q5 역순 총액 0", q5.total === 0);
ok("q5 역순 청소비 0", q5.cleaningFee === 0);

// 서차지 결합: 성수기 + 주말 (8/15=토)
const q6 = quote({ nightlyRate: 100000, checkIn: "2026-08-15", checkOut: "2026-08-16", rooms: 1, pricing: P });
ok("q6 주말+성수기 동시 적용", q6.weekendSurcharge === 15000 && q6.peakSurcharge === 25000);

// 가용성
const room = { id: "r1", inventory: 3 };
const existing = [
  { roomId: "r1", checkIn: "2026-03-03", checkOut: "2026-03-06", rooms: 2 },
  { roomId: "r1", checkIn: "2026-04-01", checkOut: "2026-04-03", rooms: 1 }
];
const a1 = checkAvailability(room, "2026-03-04", "2026-03-05", 1, existing); // 겹침 2 → 남1
ok("가용성 겹침 남은 1실", a1.remaining === 1 && a1.available === true);
const a2 = checkAvailability(room, "2026-03-04", "2026-03-05", 2, existing); // 요청2 > 남1
ok("가용성 재고 초과 불가", a2.available === false);
const a3 = checkAvailability(room, "2026-03-10", "2026-03-11", 3, existing); // 안 겹침 → 남3
ok("가용성 비겹침 전량 가능", a3.remaining === 3 && a3.available === true);
const a4 = checkAvailability(room, "2026-03-05", "2026-03-03", 1, existing); // 역순 날짜
ok("가용성 역순 날짜 불가", a4.available === false);
const a5 = checkAvailability(room, "2026-03-06", "2026-03-08", 3, existing); // 3/6 경계=체크아웃, 겹치지 않음
ok("가용성 체크아웃 경계 비겹침", a5.remaining === 3);

// 포맷
ok("formatKRW", formatKRW(1234000) === "1,234,000원");

console.log("== 6. AI-KIT node --check (ai/ + server/) ==");
for (const dir of ["ai", "server"]) {
  const abs = join(ROOT, dir);
  let files = [];
  try { files = readdirSync(abs).filter(f => f.endsWith(".js") || f.endsWith(".mjs")); }
  catch { ok(`${dir}/ 디렉터리 존재`, false); continue; }
  ok(`${dir}/ JS 파일 존재`, files.length > 0);
  for (const f of files) {
    try { execFileSync(process.execPath, ["--check", join(abs, f)], { stdio: "pipe" }); ok(`--check ${dir}/${f}`, true); }
    catch (e) { ok(`--check ${dir}/${f}`, false); console.error(String(e.stderr || e)); }
  }
}

console.log("== 7. AI 보안 게이트 ==");
// 데모는 반드시 mock 모드 — AI_ENDPOINT 는 빈 문자열이어야 함(브라우저가 백엔드 호출 안 함).
ok("AI_ENDPOINT 비어 있음(데모=mock)", AI_ENDPOINT === "");

// 무인·저비용 고도화 산출물 존재 확인.
const serverDir = join(ROOT, "server");
const serverFiles = new Set(readdirSync(serverDir));
ok("server/worker.js 존재(Cloudflare Workers 변형)", serverFiles.has("worker.js"));
ok("server/wrangler.toml 존재", serverFiles.has("wrangler.toml"));

// index.mjs 는 비용 우선 기본 모델 + 캐싱 + 예산 가드레일을 갖춰야 함.
const idx = readFileSync(join(serverDir, "index.mjs"), "utf8");
ok("index.mjs 기본 모델 claude-haiku-4-5", /AI_MODEL\s*\|\|\s*['"]claude-haiku-4-5['"]/.test(idx));
ok("index.mjs prompt caching(ephemeral)", /cache_control/.test(idx) && /ephemeral/.test(idx));
ok("index.mjs 월 토큰 예산", /AI_MONTHLY_TOKEN_CAP/.test(idx));
ok("index.mjs 429 fallback", /fallback\s*:\s*true/.test(idx));

// .env 는 반드시 git 제외.
const gi = readFileSync(join(ROOT, ".gitignore"), "utf8");
ok(".gitignore 가 .env 제외", /^\.env\b/m.test(gi) || /\n\.env\b/.test("\n" + gi));

// 저장소 어디에도 진짜 Anthropic 키 형식이 없어야 함. (문자열 분할로 이 스캐너 자체는 걸리지 않음)
const KEY_RE = new RegExp("sk-" + "ant-[A-Za-z0-9_-]{20,}");
const SKIP_DIRS = new Set(["node_modules", ".git", ".cache", "dist"]);
const SCAN_EXT = /\.(js|mjs|json|md|html|css|example|txt|yml|yaml)$/i;
function walk(dir) {
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out = out.concat(walk(join(dir, e.name))); }
    else if (SCAN_EXT.test(e.name)) out.push(join(dir, e.name));
  }
  return out;
}
let leaked = [];
for (const f of walk(ROOT)) {
  try { if (KEY_RE.test(readFileSync(f, "utf8"))) leaked.push(f); } catch { /* ignore */ }
}
ok(`실제 API 키 미노출 (스캔 ${leaked.length ? "발견: " + leaked.join(", ") : "clean"})`, leaked.length === 0);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
if (fail > 0) process.exit(1);
console.log("✓ 모든 검증 통과");
