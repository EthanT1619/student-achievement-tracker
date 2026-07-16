# Student Achievement Tracker

개인 테스트용 독립형 MVP입니다. Teacher Toolkit과 **연결되지 않으며**, `index.html`만 열면 독립 실행됩니다.

## 목적

- 시험 등록 및 문항별 평가 영역 설정
- 학생 답안 입력 및 자동 채점
- 대분류·중분류 성취도 분석
- 학생별 누적 추이 및 상담용 결과 화면
- localStorage 기반 데이터 관리 (JSON 백업/복원, CSV보내기)

## 실행 방법

`student-achievement-tracker/index.html`을 브라우저에서 **직접 더블클릭**해도 실행됩니다.

로컬 서버를 쓰려면:

```bash
cd student-achievement-tracker
python -m http.server 8080
# http://localhost:8080
```

> 이전 버전은 ES modules(`type="module"`)를 사용해 `file://`에서 JavaScript가 로드되지 않았습니다. 현재는 일반 스크립트 방식으로 수정되어 `index.html`만 열어도 버튼이 동작합니다.

## 폴더 구조

```
student-achievement-tracker/
  index.html
  css/styles.css
  js/
    constants.js
    utils.js
    storage-repository.js
    assessment-manager.js
    chart-manager.js
    import-export-manager.js
    renderer.js
    app.js
  README.md
  TEST_PLAN.md
```

## localStorage 키

`studentAchievementTrackerData`

## 데이터 구조

```json
{
  "schemaVersion": 1,
  "updatedAt": "ISO 날짜",
  "settings": { "lastBackupAt": null, "ignoreCase": true },
  "classes": [],
  "students": [],
  "exams": [],
  "questions": [],
  "results": []
}
```

## 기본 평가 유형

- **CQ** (기본 시험 유형)
- 대분류: Reading Comprehension, Dialogue, Grammar
- 중분류: datalist로 선택 또는 직접 입력

## 저장 계층

`storage-repository.js`의 `LocalStorageRepository`만 구현되어 있습니다.

향후 Supabase/IndexedDB 전환 시:
- `createRepository()` 팩토리에서 구현체만 교체
- UI(`app.js`, `renderer.js`)와 채점(`assessment-manager.js`)은 변경 최소화

## 향후 Teacher Toolkit 편입 시 필요한 작업

이번 MVP에서는 **수행하지 않습니다.**

1. Toolkit 루트 `index.html`에 메뉴 카드 추가
2. Help Center 항목 추가
3. `shared/toolkit-home.js` / `toolkit-home.css` 연결 (뒤로가기)
4. 공통 CSS 변수와 스타일 통합 검토
5. `localStorage` 키 충돌 여부 확인
6. 독립 헤더를 Toolkit 레이아웃에 맞게 조정

## 제한 사항

- 브라우저 localStorage 용량 제한
- 단일 브라우저·단일 기기 저장
- 로그인/다중 강사 공유 미지원
- OCR, AI 채점, PDF 분석 미지원

## 라이선스

개인 테스트용 프로토타입
