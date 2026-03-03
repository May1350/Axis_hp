# Axis Website — PRD v2.1
*Axis Colors + Apple-Style Design*

---

## 1. 프로젝트 개요

**Axis (Association of Exchange and International Service)** — 게이오대학 기반 학생 국제협력단체.  
**비전**: 世界とつながる、未来へつなげる (*Connect to the World, Connect to the Future*)

현재 존재하는 `index.html` / `style.css` / `world-map.js`를 기반으로 **전면 리디자인**한다.  
기존 세계지도(`world-map.js`) 기능은 그대로 유지하며 새 디자인에 통합한다.

---

## 2. 디자인 철학

### Apple-style × Axis Brand

> Apple의 **레이아웃 언어와 여백 철학**을 가져오되,  
> 색상은 **Axis 고유 색상**을 사용한다. 흰색과 검정만 쓰지 않는다.

| Apple에서 가져오는 것 | Axis에서 유지하는 것 |
|---|---|
| 풍부한 여백, 타이포그래피 중심 레이아웃 | Axis Navy `#11235A` 배경 |
| 섹션별 배경 전환으로 리듬 생성 | Axis Gold `#D4AF37` 액센트 |
| 풀스크린 히어로, 한 번에 한 메시지 | Action Red `#C40C0C` 프로젝트 태그 |
| Scroll reveal 애니메이션 | 세계지도 인터랙션 |
| Sticky frosted-glass 네비 | 브랜드 엠블럼/씰 |

---

## 3. 컬러 시스템

```
─────────────────────────────────────────────────────
 PRIMARY (Dark Sections)           SURFACE (Light Sections)
─────────────────────────────────────────────────────
 배경: #0B1437 (Deep Navy)         배경: #F0F2F7 (Navy Tint)
 배경2: #11235A (Axis Navy)        배경2: #FFFFFF
 본문: #FFFFFF                     본문: #0B1437
 서브텍스트: #8899BB               서브텍스트: #4A5B7A

─────────────────────────────────────────────────────
 ACCENT
─────────────────────────────────────────────────────
 Gold:   #D4AF37  — CTA 버튼, 핵심 수치, 호버 포인트
 Red:    #C40C0C  — 프로젝트 태그, 상태 뱃지
 Border: rgba(212,175,55,0.2)  — 카드 테두리, 구분선
─────────────────────────────────────────────────────
```

**배경 전환 패턴 (섹션 순서):**
```
Hero     → Deep Navy (#0B1437)   dark
What We Do → Navy Tint (#F0F2F7) light
Impact   → Axis Navy (#11235A)   dark
Projects → White (#FFFFFF)       light
World Map → Deep Navy (#0B1437)  dark
About    → Navy Tint (#F0F2F7)   light
Join Us  → Axis Navy (#11235A)   dark
Footer   → #080E26               very dark
```

---

## 4. 타이포그래피

```
Heading  — Outfit 700–800  (크고 굵게, 여백 충분히)
Body     — Inter 400–500   (가독성 최우선)
Label    — Inter 600, uppercase, letter-spacing: 0.1em
Stat     — Outfit 800      (숫자는 Hero 크기)
```

---

## 5. 페이지 섹션 구조 (8개)

### S1 — Hero (Deep Navy, dark)
- 풀스크린, 배경: `#0B1437` + 현장 사진 오버레이 10~15%
- 좌측: 라벨 → 대제목 → 서브텍스트 → 버튼 2개
- 우측: Axis 공식 엠블럼 (로고 이미지)
- 스크롤 힌트 애니메이션 (아래 화살표 bounce)

### S2 — What We Do (Navy Tint, light)
- `섹션 라벨 + 한 문장 요약 + 3개 원칙 카드`
- 카드: 번호(01/02/03) + 굵은 헤드라인 + 짧은 설명
- 카드 배경: 흰색, Gold border
- Stagger scroll-reveal

### S3 — Impact (Axis Navy, dark)
- 3개 대형 수치: `20+` / `3` / `2001`
- Count-up 애니메이션 (뷰포트 진입 트리거)
- 아래에 4개 활동 bullet

### S4 — Projects (White, light)
- 3개 프로젝트를 좌우 교차 레이아웃으로
- 각 프로젝트: 이미지 + 태그(Red) + 제목 + 설명 + 링크
- 이미지 호버: scale(1.04)

### S5 — World Map (Deep Navy, dark)
- 기존 `world-map.js` 완전 통합
- 섹션 제목: 좌측 상단에 오버레이 텍스트
- 지도 위 active 국가 마커 + 호버 효과 유지

### S6 — About / History (Navy Tint, light)
- 좌: 조직 소개 텍스트 (비전/미션)
- 우: 2001 → 2024 타임라인 (수직 라인 + 이벤트 포인트)

### S7 — Join Us / CTA (Axis Navy, dark)
- 큰 헤드라인 + Gold CTA 버튼
- SNS 링크 (Instagram)

### S8 — Footer (Very Dark, #080E26)
- 로고 + 네비 링크 한 줄 + Copyright

---

## 6. 네비게이션

- 스크롤 전: 투명 배경
- 스크롤 후: `backdrop-filter: blur(20px)` + `#0B1437` 반투명
- 모바일: 햄버거 → 풀스크린 오버레이 메뉴

---

## 7. 애니메이션

| 요소 | 효과 |
|------|------|
| 섹션 등장 | `opacity 0→1` + `translateY(40px→0)`, 600ms |
| 숫자 | Count-up, 1.5s ease-out |
| 버튼 호버 | `scale(1.02)` + Gold glow |
| 프로젝트 이미지 | 내부 `scale(1.04)`, 400ms |
| 세계지도 | 기존 pulse 마커 유지 |

---

## 8. 기술 스택

- **HTML5 + Vanilla CSS + Vanilla JS** (현재 스택 유지)
- `world-map.js` 재사용 (수정 없이 통합)
- `app.js` — 네비 스크롤 효과, scroll-reveal, count-up

---

## 9. 반응형

```
Desktop  1200px+  → 2컬럼 레이아웃
Tablet   768–1199px → 1.5컬럼, 폰트 축소
Mobile   <768px   → 단일 컬럼, 히어로 타이틀 36px 이상
```
