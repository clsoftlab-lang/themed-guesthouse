// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// store.js — localStorage 래퍼. 모든 접근은 try/catch 로 감싸고 손상 시 리셋.
// 데모 모드 상태 저장소일 뿐 실제 DB 가 아닙니다.

const KEY = "themed-gh-v1";

const DEFAULT = { wishlist: [], bookings: [] };

function safeRead() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT };
    return {
      wishlist: Array.isArray(parsed.wishlist) ? parsed.wishlist : [],
      bookings: Array.isArray(parsed.bookings) ? parsed.bookings : []
    };
  } catch (e) {
    // 손상된 데이터 → 초기화
    try { localStorage.removeItem(KEY); } catch (_) {}
    return { ...DEFAULT };
  }
}

function safeWrite(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

let state = safeRead();

export function getState() { return state; }

export function reset() {
  state = { ...DEFAULT };
  safeWrite(state);
  return state;
}

// ---- 위시리스트 ----
export function isWished(stayId) { return state.wishlist.includes(stayId); }

export function toggleWish(stayId) {
  if (state.wishlist.includes(stayId)) {
    state.wishlist = state.wishlist.filter(id => id !== stayId);
  } else {
    state.wishlist = [...state.wishlist, stayId];
  }
  safeWrite(state);
  return isWished(stayId);
}

// ---- 예약 ----
export function addBooking(booking) {
  const record = { id: "BK-" + Date.now().toString(36).toUpperCase(), createdAt: new Date().toISOString(), ...booking };
  state.bookings = [record, ...state.bookings];
  safeWrite(state);
  return record;
}

export function cancelBooking(id) {
  state.bookings = state.bookings.map(b => b.id === id ? { ...b, status: "cancelled" } : b);
  safeWrite(state);
}

export function getBookings() { return state.bookings; }

/** 취소되지 않은 예약만 (가용성 계산용). */
export function activeBookings() {
  return state.bookings.filter(b => b.status !== "cancelled");
}
