// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// app.js — 테마 게스트하우스 데모의 진입점.
// 해시 기반 라우팅 SPA. 데이터는 data/*.json 에서 로드, 상태는 localStorage.
// ⚠️ 데모 모드: 가상의 숙소, 모의 결제, localStorage 는 실제 DB 가 아님.

import { quote, checkAvailability, formatKRW, nightsBetween } from "./pricing.js";
import { heroSVG, gallerySVGs, locationSVG, starsSVG } from "./svg.js";
import * as store from "./store.js";
import { askAI } from "./ai/ai.js";

const app = document.getElementById("app");
const state = { stays: [], themes: [], pricing: null, loaded: false };
// 예약 흐름 임시 상태
const flow = { stayId: null, roomId: null, checkIn: "", checkOut: "", guests: 2, rooms: 1 };

// ---------- 유틸 ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byId = id => state.stays.find(s => s.id === id);
const todayPlus = d => { const t = new Date(Date.now() + d * 86400000); return t.toISOString().slice(0, 10); };
// 다가오는(또는 진행 중인) 주말의 토·일 날짜(YYYY-MM-DD). 무인 주말 다이제스트용.
function upcomingWeekend() {
  const now = new Date();
  const dow = now.getDay();               // 0=일 … 6=토
  const toSat = (6 - dow + 7) % 7;        // 다음 토요일까지 남은 일수(오늘이 토=0)
  const sat = new Date(now.getTime() + toSat * 86400000);
  const sun = new Date(sat.getTime() + 86400000);
  const fmt = d => d.toISOString().slice(0, 10);
  return { saturday: fmt(sat), sunday: fmt(sun) };
}

function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

// ---------- 데이터 로드 ----------
async function loadData() {
  const [stays, themes, pricing] = await Promise.all([
    fetch("./data/stays.json").then(r => r.json()),
    fetch("./data/themes.json").then(r => r.json()),
    fetch("./data/pricing.json").then(r => r.json())
  ]);
  state.stays = stays; state.themes = themes; state.pricing = pricing; state.loaded = true;
}

// ---------- 필터/정렬 ----------
function readFilters() {
  const p = new URLSearchParams(location.hash.split("?")[1] || "");
  return {
    q: p.get("q") || "",
    theme: p.get("theme") || "",
    region: p.get("region") || "",
    maxPrice: p.get("maxPrice") ? Number(p.get("maxPrice")) : 0,
    guests: p.get("guests") ? Number(p.get("guests")) : 0,
    amenity: p.get("amenity") || "",
    sort: p.get("sort") || "recommended"
  };
}

function applyFilters(f) {
  let list = state.stays.filter(s => {
    if (f.theme && s.theme !== f.theme) return false;
    if (f.region && s.city !== f.region) return false;
    if (f.maxPrice && s.priceFrom > f.maxPrice) return false;
    if (f.amenity && !s.amenities.includes(f.amenity)) return false;
    if (f.guests && !s.rooms.some(r => r.capacity >= f.guests)) return false;
    if (f.q) {
      const hay = (s.name + s.region + s.themeName + s.description + s.amenities.join(" ")).toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  });
  const sorters = {
    "price-asc": (a, b) => a.priceFrom - b.priceFrom,
    "price-desc": (a, b) => b.priceFrom - a.priceFrom,
    "rating": (a, b) => b.rating - a.rating,
    "recommended": (a, b) => (b.rating * 20 - b.priceFrom / 10000) - (a.rating * 20 - a.priceFrom / 10000)
  };
  return list.sort(sorters[f.sort] || sorters.recommended);
}

// ---------- 뷰: 목록 ----------
function viewList() {
  const f = readFilters();
  const list = applyFilters(f);
  const cities = [...new Set(state.stays.map(s => s.city))];
  const amenities = [...new Set(state.stays.flatMap(s => s.amenities))].sort();

  app.innerHTML = `
  <section class="hero-banner">
    <h1>테마로 떠나는 게스트하우스</h1>
    <p>루프탑 온천부터 반려동물 스테이까지. 젊은 여행자를 위한 감성 숙소를 찾아보세요.</p>
    <div class="theme-chips">
      ${state.themes.map(t => `<a class="chip ${f.theme === t.id ? "active" : ""}" href="#/?theme=${t.id}">${t.emoji} ${esc(t.name)}</a>`).join("")}
      ${f.theme ? `<a class="chip clear" href="#/">✕ 전체</a>` : ""}
    </div>
  </section>

  <section class="ai-panel weekend-digest" aria-label="이번 주말 추천">
    <h2>🗓️ 이번 주말 추천 숙소·테마</h2>
    <p class="muted">앱을 열면 다가오는 주말에 어울리는 테마와 숙소를 AI 가 자동으로 골라 드려요.</p>
    <div class="ai-output" id="weekendOut" role="status" aria-live="polite">추천을 준비하는 중…</div>
    <p class="ai-note">🤖 데모 모드에서는 기기 안에서 즉시 생성됩니다 (외부 전송·키 없음).</p>
  </section>

  <form class="filters" id="filters" aria-label="숙소 필터">
    <input type="search" name="q" placeholder="숙소·지역·편의시설 검색" value="${esc(f.q)}" aria-label="검색">
    <select name="region" aria-label="지역"><option value="">전체 지역</option>
      ${cities.map(c => `<option value="${esc(c)}" ${f.region === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
    <select name="guests" aria-label="인원"><option value="0">인원 무관</option>
      ${[1, 2, 3, 4].map(g => `<option value="${g}" ${f.guests === g ? "selected" : ""}>${g}명 이상</option>`).join("")}</select>
    <select name="amenity" aria-label="편의시설"><option value="">편의시설 전체</option>
      ${amenities.map(a => `<option value="${esc(a)}" ${f.amenity === a ? "selected" : ""}>${esc(a)}</option>`).join("")}</select>
    <label class="range">최대 ${f.maxPrice ? formatKRW(f.maxPrice) : "무제한"}
      <input type="range" name="maxPrice" min="0" max="200000" step="10000" value="${f.maxPrice}"></label>
    <select name="sort" aria-label="정렬">
      ${[["recommended", "추천순"], ["price-asc", "가격 낮은순"], ["price-desc", "가격 높은순"], ["rating", "평점순"]]
        .map(([v, l]) => `<option value="${v}" ${f.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
  </form>

  <p class="result-count">${list.length}개 숙소</p>
  <div class="grid" id="stayGrid">
    ${list.map(cardHTML).join("") || `<p class="empty">조건에 맞는 숙소가 없어요. 필터를 조정해 보세요.</p>`}
  </div>`;

  const form = $("#filters");
  const update = () => {
    const fd = new FormData(form);
    const p = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (v && v !== "0") p.set(k, v);
    location.hash = "#/?" + p.toString();
  };
  form.addEventListener("input", update);
  form.addEventListener("submit", e => { e.preventDefault(); update(); });

  // 무인 자동 기능: 온로드 "이번 주말 추천 숙소·테마" (mock 오프라인에서도 동작).
  const weekendOut = $("#weekendOut");
  if (weekendOut) {
    const { saturday, sunday } = upcomingWeekend();
    runAI({
      task: "weekend",
      payload: { saturday, sunday, themes: state.themes, stays: state.stays },
      outEl: weekendOut,
      loadingText: "추천을 준비하는 중…"
    });
  }
}

function cardHTML(s) {
  const wished = store.isWished(s.id);
  return `<article class="card">
    <a href="#/stay/${s.id}" class="card-media" aria-label="${esc(s.name)} 상세">${heroSVG(s, 0)}</a>
    <button class="wish ${wished ? "on" : ""}" data-wish="${s.id}" aria-label="위시리스트 토글">${wished ? "♥" : "♡"}</button>
    <div class="card-body">
      <div class="card-top"><span class="badge">${esc(s.themeName)}</span>
        <span class="rating">${starsSVG(s.rating)} <b>${s.rating}</b> (${s.reviewCount})</span></div>
      <h3><a href="#/stay/${s.id}">${esc(s.name)}</a></h3>
      <p class="loc">📍 ${esc(s.region)}</p>
      <p class="amen">${s.amenities.slice(0, 3).map(a => `<span>${esc(a)}</span>`).join("")}</p>
      <p class="price"><b>${formatKRW(s.priceFrom)}</b> / 1박~</p>
    </div>
  </article>`;
}

// ---------- 뷰: 상세 ----------
function viewStay(id) {
  const s = byId(id);
  if (!s) return viewNotFound();
  const gallery = gallerySVGs(s);
  const wished = store.isWished(s.id);
  app.innerHTML = `
  <a class="back" href="#/">← 목록으로</a>
  <div class="detail">
    <div class="detail-media">
      <div class="gallery-main" id="galMain">${gallery[0]}</div>
      <div class="gallery-thumbs">${gallery.map((g, i) => `<button class="thumb ${i === 0 ? "on" : ""}" data-idx="${i}">${g}</button>`).join("")}</div>
    </div>
    <div class="detail-info">
      <div class="card-top"><span class="badge">${esc(s.themeName)}</span>
        <button class="wish inline ${wished ? "on" : ""}" data-wish="${s.id}">${wished ? "♥ 저장됨" : "♡ 위시리스트"}</button></div>
      <h1>${esc(s.name)}</h1>
      <p class="loc">📍 ${esc(s.region)} · <span class="rating">${starsSVG(s.rating)} <b>${s.rating}</b> (${s.reviewCount} 리뷰)</span></p>
      <p class="tagline">${esc(s.tagline)}</p>
      <p>${esc(s.description)}</p>
      <h3>편의시설</h3>
      <ul class="amenity-list">${s.amenities.map(a => `<li>✓ ${esc(a)}</li>`).join("")}</ul>
      <h3>룸 종류</h3>
      <div class="rooms">${s.rooms.map(r => roomRow(s, r)).join("")}</div>
    </div>
  </div>

  <section class="loc-schematic">
    <h3>위치</h3>
    <div class="schematic">${locationSVG(s)}</div>
    <ul class="landmarks">${(s.location.landmarks || []).map(l => `<li>📌 ${esc(l)}</li>`).join("")}</ul>
  </section>

  <section class="ai-course ai-panel">
    <h3>🗺️ AI 주변 여행 코스</h3>
    <p class="muted">이 숙소를 기준으로 하루 여행 코스를 AI 가 만들어 드려요.</p>
    <button class="btn" id="courseBtn">코스 생성하기</button>
    <div class="ai-output" id="courseOut" hidden></div>
    <p class="ai-note">🤖 데모 모드에서는 기기 안에서 즉시 생성됩니다 (외부 전송·키 없음).</p>
  </section>

  <section class="reviews">
    <h3>리뷰 ${s.reviewCount}개 · 평균 ${s.rating}점</h3>
    ${s.reviews.map(rv => `<div class="review"><div class="rv-head"><b>${esc(rv.author)}</b> ${starsSVG(rv.rating)} <span class="rv-date">${esc(rv.date)}</span></div><p>${esc(rv.text)}</p></div>`).join("")}
  </section>`;

  app.querySelectorAll(".thumb").forEach(btn => btn.addEventListener("click", () => {
    const i = Number(btn.dataset.idx);
    $("#galMain").innerHTML = gallery[i];
    app.querySelectorAll(".thumb").forEach(b => b.classList.toggle("on", b === btn));
  }));

  const courseBtn = $("#courseBtn"), courseOut = $("#courseOut");
  courseBtn.addEventListener("click", () => runAI({
    task: "course",
    payload: { stay: s },
    outEl: courseOut,
    btn: courseBtn,
    loadingText: "코스 생성 중…"
  }));
}

// ---------- AI 실행 공통 헬퍼 ----------
// askAI 를 호출하고 결과를 스트리밍 표시. 데모(mock)/실연동 모두 동일 코드로 동작.
async function runAI({ task, payload, outEl, btn, loadingText }) {
  outEl.hidden = false;
  outEl.textContent = "";
  outEl.classList.add("streaming");
  const prevLabel = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = loadingText || "생성 중…"; }
  try {
    await askAI(task, payload, { onToken: chunk => { outEl.textContent += chunk; } });
  } catch (err) {
    outEl.textContent = "AI 요청에 실패했어요: " + (err && err.message ? err.message : String(err))
      + "\n(실 연동 모드라면 server/ 프록시가 실행 중인지 확인하세요.)";
  } finally {
    outEl.classList.remove("streaming");
    if (btn) { btn.disabled = false; btn.textContent = prevLabel; }
  }
}

// ---------- 뷰: AI 도우미 (챗봇 + 테마 추천) ----------
function viewAI() {
  const cities = [...new Set(state.stays.map(s => s.city))];
  app.innerHTML = `
  <a class="back" href="#/">← 목록으로</a>
  <h1>🤖 AI 여행 도우미</h1>
  <p class="muted">앱의 실제 숙소·테마 데이터를 근거로 추천해 드려요. 데모 모드에서는 기기 안에서 즉시 동작하며, 외부 전송이나 API 키가 전혀 없습니다.</p>

  <section class="ai-panel">
    <h2>💬 AI 여행 컨시어지</h2>
    <p class="muted">지역·분위기·예산을 알려주시면 어울리는 숙소를 추천해 드려요.</p>
    <form id="conciergeForm" class="ai-form">
      <select name="region" aria-label="지역"><option value="">지역 무관</option>
        ${cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select>
      <input type="text" name="vibe" placeholder="분위기·키워드 (예: 온천 힐링, 친구랑 파티)" aria-label="분위기">
      <input type="number" name="budget" min="0" step="10000" placeholder="1박 예산(원) — 선택" aria-label="예산">
      <input type="text" name="query" placeholder="자유롭게 더 적어주세요 (선택)" aria-label="추가 요청">
      <button class="btn primary" type="submit">추천 받기</button>
    </form>
    <div class="ai-output" id="conciergeOut" hidden></div>
  </section>

  <section class="ai-panel">
    <h2>🎯 나에게 맞는 테마 추천</h2>
    <p class="muted">여행 성향을 알려주시면 6개 테마 중 가장 잘 맞는 하나를 골라 드려요.</p>
    <form id="themeForm" class="ai-form">
      <input type="text" name="vibe" placeholder="여행 성향 (예: 조용한 카페, 바다 서핑, 반려견 동반)" aria-label="여행 성향" required>
      <button class="btn primary" type="submit">테마 찾기</button>
    </form>
    <div class="theme-quick">
      ${state.themes.map(t => `<button class="chip" type="button" data-vibe="${esc(t.name)}">${t.emoji} ${esc(t.name)}</button>`).join("")}
    </div>
    <div class="ai-output" id="themeOut" hidden></div>
  </section>

  <p class="ai-note">🤖 실제 Claude 연동을 켜려면 <code>server/</code> 프록시를 띄우고 <code>ai/config.js</code> 의 <code>AI_ENDPOINT</code> 를 설정하세요. API 키는 서버에서만 다룹니다.</p>`;

  const cForm = $("#conciergeForm"), cOut = $("#conciergeOut");
  cForm.addEventListener("submit", e => {
    e.preventDefault();
    const fd = new FormData(cForm);
    runAI({
      task: "concierge",
      payload: {
        region: fd.get("region") || "",
        vibe: fd.get("vibe") || "",
        budget: Number(fd.get("budget")) || 0,
        query: fd.get("query") || "",
        stays: state.stays,
        themes: state.themes
      },
      outEl: cOut,
      btn: cForm.querySelector("button[type=submit]"),
      loadingText: "추천 찾는 중…"
    });
  });

  const tForm = $("#themeForm"), tOut = $("#themeOut");
  const runTheme = vibe => runAI({
    task: "theme",
    payload: { vibe, themes: state.themes, stays: state.stays },
    outEl: tOut,
    btn: tForm.querySelector("button[type=submit]"),
    loadingText: "테마 찾는 중…"
  });
  tForm.addEventListener("submit", e => {
    e.preventDefault();
    runTheme(tForm.querySelector("[name=vibe]").value || "");
  });
  app.querySelectorAll(".theme-quick [data-vibe]").forEach(btn =>
    btn.addEventListener("click", () => {
      tForm.querySelector("[name=vibe]").value = btn.dataset.vibe;
      runTheme(btn.dataset.vibe);
    }));
}

function roomRow(s, r) {
  return `<div class="room">
    <div><b>${esc(r.name)}</b><br><small>최대 ${r.capacity}명 · 침대 ${r.beds} · 재고 ${r.inventory}실</small></div>
    <div class="room-right"><span class="price">${formatKRW(r.nightlyRate)}<small>/박</small></span>
      <a class="btn" href="#/book/${s.id}/${r.id}">예약하기</a></div>
  </div>`;
}

// ---------- 뷰: 예약 흐름 ----------
function viewBook(stayId, roomId) {
  const s = byId(stayId);
  const room = s?.rooms.find(r => r.id === roomId);
  if (!s || !room) return viewNotFound();
  if (flow.stayId !== stayId || flow.roomId !== roomId) {
    Object.assign(flow, { stayId, roomId, checkIn: flow.checkIn || todayPlus(3), checkOut: flow.checkOut || todayPlus(5), guests: Math.min(2, room.capacity), rooms: 1 });
  }
  renderBook(s, room);
}

function renderBook(s, room) {
  const nights = nightsBetween(flow.checkIn, flow.checkOut);
  const avail = checkAvailability(room, flow.checkIn, flow.checkOut, flow.rooms, store.activeBookings());
  const q = quote({ nightlyRate: room.nightlyRate, checkIn: flow.checkIn, checkOut: flow.checkOut, rooms: flow.rooms, pricing: state.pricing });
  const canBook = nights > 0 && avail.available && flow.guests <= room.capacity * flow.rooms;

  app.innerHTML = `
  <a class="back" href="#/stay/${s.id}">← ${esc(s.name)}</a>
  <div class="booking">
    <div class="booking-form">
      <h1>예약하기</h1>
      <p class="sub">${esc(s.name)} · ${esc(room.name)}</p>
      <div class="steps"><span class="on">1 날짜</span><span class="${nights > 0 ? "on" : ""}">2 인원·룸</span><span class="${canBook ? "on" : ""}">3 결제</span></div>

      <fieldset><legend>1. 날짜 선택</legend>
        <label>체크인 <input type="date" id="ci" value="${flow.checkIn}" min="${todayPlus(0)}"></label>
        <label>체크아웃 <input type="date" id="co" value="${flow.checkOut}" min="${todayPlus(1)}"></label>
        ${nights > 0 ? `<p class="ok">${nights}박</p>` : `<p class="err">체크아웃은 체크인 이후여야 합니다.</p>`}
      </fieldset>

      <fieldset><legend>2. 인원 · 룸 수</legend>
        <label>투숙 인원 <input type="number" id="guests" min="1" max="${room.capacity * 4}" value="${flow.guests}"></label>
        <label>룸 수 <input type="number" id="rooms" min="1" max="${room.inventory}" value="${flow.rooms}"></label>
        <p class="${avail.available ? "ok" : "err"}">가용 재고: 남은 ${Math.max(0, avail.remaining)}실 / 요청 ${avail.requested}실 ${avail.available ? "✓ 예약 가능" : "✕ 재고 부족 또는 날짜 오류"}</p>
        ${flow.guests > room.capacity * flow.rooms ? `<p class="err">선택한 룸 수용 인원(${room.capacity * flow.rooms}명)을 초과했습니다.</p>` : ""}
      </fieldset>

      <fieldset><legend>3. 모의 결제</legend>
        <p class="demo-note">⚠️ 데모 모드 — 실제 결제가 아닙니다. 카드 정보를 입력하지 마세요.</p>
        <label>예약자명 <input type="text" id="name" placeholder="홍길동" value="여행자"></label>
        <label>결제 수단 <select id="pay"><option>모의 카드</option><option>모의 간편결제</option></select></label>
        <button class="btn primary" id="confirm" ${canBook ? "" : "disabled"}>예약 확정 · ${formatKRW(q.total)}</button>
      </fieldset>
    </div>

    <aside class="summary">
      <h3>요금 요약</h3>
      ${heroSVG(s, 1)}
      <table class="quote">
        <tr><td>${formatKRW(room.nightlyRate)} × ${nights}박 × ${flow.rooms}실</td><td>${formatKRW(q.baseTotal)}</td></tr>
        ${q.weekendSurcharge ? `<tr><td>주말 할증 (+${state.pricing.weekendSurchargePct}%)</td><td>${formatKRW(q.weekendSurcharge)}</td></tr>` : ""}
        ${q.peakSurcharge ? `<tr><td>성수기 할증 (+${state.pricing.peakSurchargePct}%)</td><td>${formatKRW(q.peakSurcharge)}</td></tr>` : ""}
        <tr><td>청소비</td><td>${formatKRW(q.cleaningFee)}</td></tr>
        <tr><td>서비스 수수료 (${state.pricing.serviceFeePct}%)</td><td>${formatKRW(q.serviceFee)}</td></tr>
        <tr class="total"><td>합계</td><td>${formatKRW(q.total)}</td></tr>
      </table>
      <p class="mini">가격 = (1박 요금 + 주말/성수기 할증) × 박수 × 룸 + 청소비 + 서비스료</p>
    </aside>
  </div>`;

  const rerender = () => {
    flow.checkIn = $("#ci").value; flow.checkOut = $("#co").value;
    flow.guests = Number($("#guests").value) || 1; flow.rooms = Number($("#rooms").value) || 1;
    renderBook(s, room);
  };
  ["ci", "co", "guests", "rooms"].forEach(id => $("#" + id).addEventListener("change", rerender));
  const cb = $("#confirm");
  if (cb) cb.addEventListener("click", () => {
    const rec = store.addBooking({
      stayId: s.id, stayName: s.name, roomId: room.id, roomName: room.name,
      checkIn: flow.checkIn, checkOut: flow.checkOut, nights, rooms: flow.rooms, guests: flow.guests,
      guestName: $("#name").value || "여행자", total: q.total, status: "confirmed"
    });
    toast(`예약 확정! 번호 ${rec.id}`);
    location.hash = "#/bookings";
  });
}

// ---------- 뷰: 내 예약 ----------
function viewBookings() {
  const bks = store.getBookings();
  app.innerHTML = `<a class="back" href="#/">← 목록으로</a><h1>내 예약</h1>
  ${bks.length ? `<div class="booking-list">${bks.map(b => `
    <div class="bk ${b.status}">
      <div><b>${esc(b.stayName)}</b> <span class="badge sm">${b.status === "cancelled" ? "취소됨" : "확정"}</span><br>
        <small>${esc(b.roomName)} · ${b.checkIn} ~ ${b.checkOut} (${b.nights}박) · ${b.guests}명 · ${b.rooms}실</small><br>
        <small class="muted">예약번호 ${b.id}</small></div>
      <div class="room-right"><span class="price">${formatKRW(b.total)}</span>
        ${b.status !== "cancelled" ? `<button class="btn ghost" data-cancel="${b.id}">예약 취소</button>` : ""}</div>
    </div>`).join("")}</div>`
    : `<p class="empty">아직 예약이 없어요. <a href="#/">숙소를 둘러보세요.</a></p>`}`;
}

// ---------- 뷰: 위시리스트 ----------
function viewWishlist() {
  const ids = store.getState().wishlist;
  const list = state.stays.filter(s => ids.includes(s.id));
  app.innerHTML = `<a class="back" href="#/">← 목록으로</a><h1>위시리스트</h1>
  ${list.length ? `<div class="grid">${list.map(cardHTML).join("")}</div>`
    : `<p class="empty">저장한 숙소가 없어요. 카드의 ♡ 를 눌러 담아보세요.</p>`}`;
}

// ---------- 뷰: 큐레이션 ----------
function viewCuration() {
  app.innerHTML = `<a class="back" href="#/">← 목록으로</a><h1>테마별 큐레이션</h1>
  ${state.themes.map(t => {
    const items = state.stays.filter(s => s.theme === t.id).slice(0, 3);
    return `<section class="curation"><h2>${t.emoji} ${esc(t.name)} <a class="more" href="#/?theme=${t.id}">전체 보기 →</a></h2>
      <p class="muted">${esc(t.blurb)}</p><div class="grid">${items.map(cardHTML).join("")}</div></section>`;
  }).join("")}`;
}

function viewNotFound() {
  app.innerHTML = `<div class="empty"><h1>404</h1><p>페이지를 찾을 수 없어요.</p><a class="btn" href="#/">홈으로</a></div>`;
}

// ---------- 라우터 ----------
function router() {
  if (!state.loaded) return;
  const hash = location.hash || "#/";
  const path = hash.split("?")[0];
  const parts = path.replace(/^#\//, "").split("/").filter(Boolean);
  window.scrollTo(0, 0);
  updateNav(parts[0] || "");
  if (parts.length === 0) return viewList();
  if (parts[0] === "stay") return viewStay(parts[1]);
  if (parts[0] === "book") return viewBook(parts[1], parts[2]);
  if (parts[0] === "bookings") return viewBookings();
  if (parts[0] === "wishlist") return viewWishlist();
  if (parts[0] === "curation") return viewCuration();
  if (parts[0] === "ai") return viewAI();
  return viewNotFound();
}

function updateNav(active) {
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === active));
  const wc = store.getState().wishlist.length;
  const bc = store.activeBookings().length;
  const wb = $("#wishCount"), bb = $("#bookCount");
  if (wb) wb.textContent = wc ? wc : "";
  if (bb) bb.textContent = bc ? bc : "";
}

// ---------- 전역 이벤트 ----------
document.addEventListener("click", e => {
  const w = e.target.closest("[data-wish]");
  if (w) { e.preventDefault(); const on = store.toggleWish(w.dataset.wish); w.classList.toggle("on", on);
    w.textContent = w.classList.contains("inline") ? (on ? "♥ 저장됨" : "♡ 위시리스트") : (on ? "♥" : "♡");
    updateNav(); toast(on ? "위시리스트에 담았어요" : "위시리스트에서 뺐어요"); return; }
  const c = e.target.closest("[data-cancel]");
  if (c) { store.cancelBooking(c.dataset.cancel); toast("예약이 취소되었습니다"); router(); }
});

// ---------- 부트 ----------
async function boot() {
  try {
    await loadData();
    window.addEventListener("hashchange", router);
    router();
  } catch (err) {
    app.innerHTML = `<div class="empty"><h1>데이터 로드 실패</h1><p>${esc(err.message)}</p>
    <p>로컬 서버로 실행했는지 확인하세요: <code>python -m http.server 9002</code></p></div>`;
  }
}
boot();
