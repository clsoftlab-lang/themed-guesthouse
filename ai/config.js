// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// ai/config.js — AI-KIT 설정.
//
// AI_ENDPOINT 가 빈 문자열이면 데모(mock) 모드로 동작합니다.
//   - 브라우저 안에서 앱의 stays/themes 데이터를 재사용하는 결정론적 한국어 MockProvider 사용.
//   - 네트워크 호출·API 키 전혀 없음.
//
// 실제 Claude 연동을 켜려면 server/ 프록시를 띄운 뒤 그 주소를 넣으세요.
//   예) export const AI_ENDPOINT = "http://localhost:8787/api/ai";
//
// ⚠️ 절대 이 파일(또는 브라우저·저장소 어디에도) API 키를 넣지 마세요.
//    키는 오직 server/ 백엔드에서 process.env.ANTHROPIC_API_KEY 로만 다룹니다.
export const AI_ENDPOINT = "";
