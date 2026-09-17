// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// pricing.js — 순수 함수 요금/가용성 엔진.
// DOM·localStorage·전역 상태에 의존하지 않으며 Node와 브라우저에서 동일하게 동작합니다.
// check.mjs 가 이 모듈을 단위 테스트합니다.

/** "YYYY-MM-DD" 문자열을 UTC 자정 Date 로 파싱 (타임존 영향 제거). */
export function parseDate(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** 두 날짜 사이의 숙박 일수(박). 시작 포함, 종료 제외. 잘못된 범위는 0. */
export function nightsBetween(checkIn, checkOut) {
  const a = parseDate(checkIn), b = parseDate(checkOut);
  if (isNaN(a) || isNaN(b)) return 0;
  const diff = Math.round((b - a) / 86400000);
  return diff > 0 ? diff : 0;
}

/** 체크인부터 각 숙박일의 날짜 배열 반환. */
export function eachNight(checkIn, checkOut) {
  const n = nightsBetween(checkIn, checkOut);
  const out = [];
  const start = parseDate(checkIn);
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** 주말(금·토) 여부. getUTCDay: 0=일 … 5=금,6=토. */
export function isWeekend(dateStr) {
  const day = parseDate(dateStr).getUTCDay();
  return day === 5 || day === 6;
}

/** 성수기 여부. peakPeriods = [{from,to}] (경계 포함). */
export function isPeak(dateStr, peakPeriods = []) {
  const t = parseDate(dateStr).getTime();
  return peakPeriods.some(p => t >= parseDate(p.from).getTime() && t <= parseDate(p.to).getTime());
}

/**
 * 요금 계산 (순수 함수).
 * 총액 = Σ(1박 요금 × 서차지) + 청소비 + 서비스료.
 * @returns {{nights, baseTotal, weekendSurcharge, peakSurcharge, roomSubtotal, cleaningFee, serviceFee, total, breakdown}}
 */
export function quote({ nightlyRate, checkIn, checkOut, rooms = 1, pricing = {} }) {
  const {
    cleaningFee = 0,
    weekendSurchargePct = 0,
    peakSurchargePct = 0,
    peakPeriods = [],
    serviceFeePct = 0
  } = pricing;

  const nights = eachNight(checkIn, checkOut);
  const roomsN = Math.max(1, rooms | 0);
  const breakdown = [];
  let roomSubtotal = 0, baseTotal = 0, weekendSurcharge = 0, peakSurcharge = 0;

  for (const date of nights) {
    const weekend = isWeekend(date);
    const peak = isPeak(date, peakPeriods);
    const wSur = weekend ? Math.round(nightlyRate * weekendSurchargePct / 100) : 0;
    const pSur = peak ? Math.round(nightlyRate * peakSurchargePct / 100) : 0;
    const nightTotal = (nightlyRate + wSur + pSur) * roomsN;
    baseTotal += nightlyRate * roomsN;
    weekendSurcharge += wSur * roomsN;
    peakSurcharge += pSur * roomsN;
    roomSubtotal += nightTotal;
    breakdown.push({ date, weekend, peak, nightTotal });
  }

  const cleaning = nights.length > 0 ? cleaningFee * roomsN : 0;
  const preService = roomSubtotal + cleaning;
  const serviceFee = Math.round(preService * serviceFeePct / 100);
  const total = preService + serviceFee;

  return {
    nights: nights.length,
    baseTotal,
    weekendSurcharge,
    peakSurcharge,
    roomSubtotal,
    cleaningFee: cleaning,
    serviceFee,
    total,
    breakdown
  };
}

/**
 * 가용성 확인 (순수 함수).
 * 겹치는 기존 예약 수를 세어 재고 초과 여부 판정.
 * @param {object} room {inventory}
 * @param {string} checkIn @param {string} checkOut
 * @param {number} requestedRooms
 * @param {Array<{roomId,checkIn,checkOut,rooms}>} existingBookings
 * @returns {{available:boolean, remaining:number, requested:number}}
 */
export function checkAvailability(room, checkIn, checkOut, requestedRooms, existingBookings = []) {
  const requested = Math.max(1, requestedRooms | 0);
  const inv = Math.max(0, room?.inventory | 0);
  const inStart = parseDate(checkIn).getTime();
  const inEnd = parseDate(checkOut).getTime();
  let overlapping = 0;
  for (const b of existingBookings) {
    if (b.roomId !== room?.id) continue;
    const bStart = parseDate(b.checkIn).getTime();
    const bEnd = parseDate(b.checkOut).getTime();
    // 기간 겹침: start < otherEnd && otherStart < end
    if (inStart < bEnd && bStart < inEnd) overlapping += (b.rooms || 1);
  }
  const remaining = inv - overlapping;
  return { available: nightsBetween(checkIn, checkOut) > 0 && remaining >= requested, remaining, requested };
}

/** 통화 포맷 (원). */
export function formatKRW(n) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n || 0)) + "원";
}
