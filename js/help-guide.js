/**
 * Usage guides, onboarding checklist, and detailed help content.
 */
(function (SAT) {
  SAT.HELP_PREFS_KEY = 'studentAchievementTrackerHelpPrefs';

  const PAGE_GUIDES = {
    dashboard: {
      title: '대시보드 사용법',
      steps: [
        '등록된 반·학생·시험·결과 수를 확인합니다.',
        '아래 체크리스트로 처음 설정 순서를 따라갑니다.',
        '빠른 실행 버튼으로 자주 쓰는 화면으로 이동합니다.',
        '백업 상태를 확인하고 7일 이상 경과 시 JSON 백업을 권장합니다.',
      ],
    },
    classes: {
      title: '반·학생 관리 사용법',
      steps: [
        '반 이름과 레벨을 입력한 뒤 「반 추가」를 누릅니다.',
        '표에서 반을 선택하면 해당 반의 학생 목록이 아래에 표시됩니다.',
        '학생 이름(과 영어 이름)을 입력해 「학생 추가」를 누릅니다.',
        '수정·비활성화·삭제는 각 행의 작업 버튼을 사용합니다.',
        '학생 등록이 끝나면 「시험 설정」에서 시험을 만듭니다.',
      ],
    },
    exams: {
      title: '시험 설정 사용법',
      steps: [
        '시험명, 반, 시험일, 문항 수를 입력합니다.',
        '각 문항의 정답과 대분류(필수)를 입력합니다.',
        '필요하면 중분류·메모·배점을 입력합니다. 「↑ 이전 문항 분류 복사」로 빠르게 채울 수 있습니다.',
        '「시험 생성」 또는 「시험 저장」을 눌러 등록합니다.',
        '등록 후 「답안 입력」에서 학생 답안을 입력합니다.',
      ],
    },
    'answer-entry': {
      title: '답안 입력 사용법',
      steps: [
        '반, 시험, 학생을 순서대로 선택합니다.',
        '「빠른 입력」 또는 「일괄 입력」 모드를 선택합니다.',
        '답안표에서 미입력·오류 문항(빨간색)을 확인하고 클릭해 이동할 수 있습니다.',
        '입력이 끝나면 「저장 및 채점」을 누릅니다.',
        '「저장 후 다음 학생」 또는 결과 보기로 이어서 작업합니다.',
      ],
    },
    'student-results': {
      title: '학생 결과 사용법',
      steps: [
        '반과 학생을 선택합니다.',
        '시험별 결과 목록에서 확인할 시험을 클릭합니다.',
        '총점, 정답률, 대·중분류별 정답률, 틀린 문항을 확인합니다.',
        '그래프로 영역별 성취도와 시험별 추이를 봅니다.',
        '시험 선택 줄의 톱니바퀴(⚙) 버튼으로 표시 옵션을 열어, 정답률·그래프·틀린 문항 등을 켜거나 끌 수 있습니다.',
        '결과 맨 아래 「선생님 코멘트」에 시험별 메모를 입력하면 자동 저장되며, 인쇄·PDF 맨 아래에 포함됩니다.',
        '인쇄 버튼으로 보고서를 PDF로 저장할 수 있습니다. 표시 옵션에 켜 둔 항목만 인쇄에 포함됩니다.',
      ],
    },
    'exam-overview': {
      title: '시험 전체 분석 사용법',
      steps: [
        '분석할 시험을 선택합니다.',
        '반 평균, 최고·최저, 미응시 학생을 확인합니다.',
        '학생별 점수표와 문항별 정답률을 검토합니다.',
        '대·중분류별 반 평균으로 취약 영역을 파악합니다.',
        '「CSV보내기」로 스프레드시트 분석에 활용합니다.',
      ],
    },
    backup: {
      title: '백업·복원 사용법',
      steps: [
        '「JSON 전체 백업」으로 현재 데이터를 파일로 저장합니다.',
        '다른 PC·브라우저에서는 JSON 파일을 「JSON 가져오기」로 복원합니다.',
        '복원 전에는 반드시 현재 데이터를 먼저 백업하세요.',
        '정기 백업(주 1회 이상)을 권장합니다.',
        '「전체 데이터 초기화」는 되돌릴 수 없으니 주의하세요.',
      ],
    },
  };

  const HELP_SECTIONS = [
    {
      id: 'overview',
      title: '프로그램 개요',
      body: `Student Achievement Tracker는 시험 등록, 학생 답안 입력, 자동 채점, 영역별 성취도 분석을 한 곳에서 처리하는 도구입니다.

데이터는 브라우저 localStorage에 저장되며, 별도 서버로 전송되지 않습니다. 강사가 종이 시험지를 보며 빠르게 답안을 입력하고, 학생·반·시험 단위로 결과를 확인할 수 있습니다.`,
    },
    {
      id: 'getting-started',
      title: '처음 시작하는 순서',
      body: `1. 반·학생 — 반을 만들고 학생을 등록합니다.
2. 시험 설정 — 시험을 만들고 문항별 정답·대분류를 입력합니다.
3. 답안 입력 — 학생별 답안을 입력하고 저장·채점합니다.
4. 결과 확인 — 학생 결과 또는 시험 전체 분석에서 성취도를 봅니다.
5. JSON 백업 — 작업 후 데이터를 파일로 백업합니다.`,
    },
    {
      id: 'classes',
      title: '반과 학생 관리',
      body: `반은 시험과 학생을 묶는 단위입니다. 반을 선택한 뒤 해당 반에 학생을 추가합니다.

학생을 삭제하면 연결된 결과도 함께 삭제될 수 있으므로, 결과가 있는 학생은 「비활성화」를 권장합니다. 비활성 학생은 답안 입력 목록에 나타나지 않습니다.`,
    },
    {
      id: 'exam-create',
      title: '시험 생성',
      body: `시험명, 반, 시험일, 문항 수를 입력한 뒤 각 문항의 정답을 설정합니다.

정답 형식(숫자 1~5, A~E, 서술형)은 문항 정답 입력 패턴에 따라 자동으로 감지됩니다. 시험 유형(CQ 등)은 자유 입력이며 분석 필터용으로 사용할 수 있습니다.`,
    },
    {
      id: 'question-answers',
      title: '문항 정답 입력',
      body: `각 문항마다 정답(필수), 배점, 대분류(필수), 중분류(선택), 메모를 입력합니다.

문항 수를 줄이면 초과 문항 데이터가 삭제될 수 있습니다. 시험 복제 기능으로 비슷한 시험을 빠르게 만들 수 있습니다.`,
    },
    {
      id: 'categories',
      title: '대분류와 중분류 설정',
      body: `대분류: Grammar, Reading, Dialogue처럼 큰 평가 영역입니다. 모든 문항에 필수입니다.

중분류: Present Perfect, Main Idea처럼 세부 학습 유형입니다. 선택 사항이며, 입력하지 않으면 분석 화면에서 「미분류」로 표시됩니다.

같은 중분류 이름이라도 대분류가 다르면 별도로 집계됩니다. 이전 문항 분류 복사 버튼으로 연속 문항 입력을 빠르게 할 수 있습니다.`,
    },
    {
      id: 'fast-entry',
      title: '빠른 답안 입력',
      body: `답안 입력 영역을 한 번 선택한 뒤 숫자키 1~5를 연속으로 입력할 수 있습니다. 문자형 시험(A~E)에서는 1~5가 A~E로 매핑됩니다.

답안표의 문항 번호를 클릭하면 해당 문항으로 이동합니다. 오류·미입력 문항은 빨간색으로 표시됩니다. 방향키로 이전·다음 문항 이동이 가능합니다.`,
    },
    {
      id: 'bulk-entry',
      title: '일괄 답안 입력',
      body: `1234512345처럼 붙여 쓰거나, 공백·쉼표·슬래시·줄바꿈으로 구분해 한 번에 입력할 수 있습니다.

적용 전 검증이 실행되며, 문항 수가 맞지 않거나 잘못된 값이 있으면 경고·차단됩니다. 적용 후 빠른 입력에서 개별 수정할 수 있습니다.`,
    },
    {
      id: 'save-grade',
      title: '저장 및 자동 채점',
      body: `「저장 및 채점」을 누르면 답안이 저장되고 시험 설정의 정답과 비교해 자동 채점됩니다.

미입력 문항이 있으면 경고 후 저장 여부를 확인합니다. 저장 후 결과 보기, 계속 수정, 다음 학생 입력 중 선택할 수 있습니다.`,
    },
    {
      id: 'student-results',
      title: '학생 결과 확인',
      body: `반과 학생을 선택하면 시험별 결과 목록이 표시됩니다. 시험을 클릭하면 상세 결과, 대·중분류 통계, 그래프, 틀린 문항을 확인할 수 있습니다.

전체 시험 합산 영역에서는 여러 시험을 묶은 요약 수치, 대분류 정답률, 그래프를 볼 수 있습니다.

표시 옵션: 시험 선택 줄 오른쪽의 톱니바퀴(⚙) 버튼을 누르면 모달이 열립니다. 아래 항목을 개별로 켜거나 끌 수 있습니다.
• 전체 시험 합산 — 요약 수치, 대분류 정답률, 대분류 그래프
• 선택 시험 — 시험명, 총점·정답률·반 평균, 대·중분류 정답률, 틀린 문항, 대분류 그래프, 점수 추이 그래프, 인쇄용 표
「전체 켜기」「전체 끄기」로 한 번에 바꿀 수 있으며, 켜 둔 항목만 화면과 인쇄에 포함됩니다.

선생님 코멘트: 결과 카드 맨 아래에서 시험별 코멘트를 입력할 수 있습니다. 입력하면 자동 저장되며, 다른 시험·학생으로 이동해도 각 시험마다 따로 보관됩니다. 인쇄·PDF에서는 성적표 맨 아래에 표시됩니다(내용이 있고 「선생님 코멘트」 표시 옵션이 켜져 있을 때).

기존 결과가 있으면 답안 입력 시 자동으로 불러와 수정할 수 있습니다.`,
    },
    {
      id: 'exam-overview',
      title: '시험 전체 분석',
      body: `한 시험에 대한 반 전체 결과를 봅니다. 학생별 점수, 문항별 정답률, 대·중분류별 반 평균, 미응시 학생 목록을 제공합니다.

문항별 정답률은 응시한 전체 학생 수를 분모로 계산합니다.`,
    },
    {
      id: 'charts',
      title: '그래프 해석',
      body: `대분류별 그래프: 선택한 시험(또는 학생 결과)에서 영역별 정답 비율을 막대 그래프로 보여줍니다.

시험별 점수 추이: 한 학생의 여러 시험 정답률 변화를 선 그래프로 보여줍니다. 시험이 1개뿐이면 추이 그래프 데이터가 제한될 수 있습니다.`,
    },
    {
      id: 'json-backup',
      title: 'JSON 백업과 복원',
      body: `⚠️ 중요 — 데이터는 현재 브라우저에만 저장됩니다.
• 다른 PC나 브라우저에 자동 동기화되지 않습니다.
• 브라우저 데이터·캐시 삭제 시 모든 데이터가 사라질 수 있습니다.
• 정기적으로 JSON 백업 파일을 저장하세요 (주 1회 이상 권장).
• 복원 전에는 반드시 현재 데이터를 먼저 백업하세요.

JSON 가져오기는 기존 데이터를 덮어씁니다. 복원 후 대시보드에서 데이터 요약을 확인하세요.`,
    },
    {
      id: 'csv-export',
      title: 'CSV 내보내기',
      body: `시험 전체 결과 화면에서 「CSV보내기」를 사용합니다. 학생별 점수와 문항별 답·정오를 스프레드시트에서 분석할 수 있습니다.

CSV는 백업 대용이 아닙니다. 전체 데이터 보존에는 JSON 백업을 사용하세요.`,
    },
    {
      id: 'print-pdf',
      title: '인쇄 및 PDF 저장',
      body: `학생 결과 화면에서 「인쇄」 버튼을 누르면 인쇄용 레이아웃으로 전환됩니다. 브라우저 인쇄 대화상자에서 「PDF로 저장」을 선택하세요.

표시 옵션(톱니바퀴 버튼)에서 켜 둔 항목만 인쇄에 포함됩니다. 상담용으로 필요한 정답률·그래프만 남기고 나머지는 끈 뒤 인쇄할 수 있습니다. 선생님 코멘트도 표시 옵션으로 켜고 끌 수 있으며, 내용이 있을 때만 맨 아래에 출력됩니다.

그래프는 인쇄 시 표 형태로도 함께 제공됩니다(「인쇄용 표」 옵션이 켜져 있을 때).`,
    },
    {
      id: 'localstorage',
      title: 'localStorage 주의사항',
      body: `모든 반, 학생, 시험, 문항, 결과는 브라우저 localStorage에 저장됩니다.

시크릿/프라이빗 모드, 다른 브라우저, 다른 PC에서는 데이터가 공유되지 않습니다. 공용 PC 사용 시 개인정보와 백업 파일 관리에 주의하세요.`,
    },
    {
      id: 'faq',
      title: '자주 묻는 질문',
      body: `Q. 답안 입력에서 숫자키가 안 됩니다.
A. 답안 입력 영역(회색 테두리 패널)을 한 번 클릭해 포커스를 준 뒤 입력하세요.

Q. 중분류 이름이 같아도 따로 나옵니다.
A. 대분류가 다르면 별도 항목으로 집계됩니다.

Q. 시험을 수정하면 기존 결과는?
A. 문항 ID가 유지되면 결과와 연결됩니다. 문항 수·구조를 크게 바꾸면 결과 해석에 주의하세요.

Q. 데이터를 다른 컴퓨터로 옮기려면?
A. JSON 백업 파일을 내보낸 뒤 다른 PC에서 JSON 가져오기를 사용하세요.`,
    },
    {
      id: 'troubleshooting',
      title: '오류가 생겼을 때 확인할 사항',
      body: `• 반·시험·학생이 선택되었는지 확인
• 시험 설정에서 모든 문항 정답·대분류가 입력되었는지 확인
• 답안 입력 시 허용 값(1~5 또는 A~E)을 사용했는지 확인
• 브라우저 localStorage가 비활성화되지 않았는지 확인
• 최근 JSON 백업이 있다면 복원을 검토
• 문제가 지속되면 JSON 백업 후 브라우저 캐시 삭제·재시도`,
    },
  ];

  const CHECKLIST_STEPS = [
    { id: 'class', label: '반 등록', nav: 'classes', check: (d) => d.classes.length > 0 },
    { id: 'student', label: '학생 등록', nav: 'classes', check: (d) => d.students.some((s) => s.active !== false) },
    { id: 'exam', label: '시험 생성', nav: 'exams', check: (d) => d.exams.length > 0 },
    { id: 'questions', label: '문항·정답 설정', nav: 'exams', check: (d) => d.questions.length > 0 && d.questions.every((q) => q.correctAnswer && q.majorCategory) },
    { id: 'answers', label: '답안 입력·채점', nav: 'answer-entry', check: (d) => d.results.length > 0 },
    { id: 'backup', label: 'JSON 백업', nav: 'backup', check: (d) => !!d.settings?.lastBackupAt },
  ];

  SAT.loadHelpPrefs = function loadHelpPrefs() {
    try {
      const raw = localStorage.getItem(SAT.HELP_PREFS_KEY);
      return raw ? JSON.parse(raw) : { pageGuides: {}, checklistOpen: null };
    } catch {
      return { pageGuides: {}, checklistOpen: null };
    }
  };

  SAT.saveHelpPrefs = function saveHelpPrefs(prefs) {
    try {
      localStorage.setItem(SAT.HELP_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore quota errors */
    }
  };

  SAT.isPageGuideOpen = function isPageGuideOpen(view) {
    const prefs = SAT.loadHelpPrefs();
    if (Object.prototype.hasOwnProperty.call(prefs.pageGuides, view)) {
      return !!prefs.pageGuides[view];
    }
    return false;
  };

  SAT.setPageGuideOpen = function setPageGuideOpen(view, open) {
    const prefs = SAT.loadHelpPrefs();
    prefs.pageGuides[view] = !!open;
    SAT.saveHelpPrefs(prefs);
  };

  SAT.isChecklistOpen = function isChecklistOpen(data) {
    const prefs = SAT.loadHelpPrefs();
    if (prefs.checklistOpen !== null) return !!prefs.checklistOpen;
    const done = CHECKLIST_STEPS.filter((s) => s.check(data)).length;
    return done < CHECKLIST_STEPS.length;
  };

  SAT.setChecklistOpen = function setChecklistOpen(open) {
    const prefs = SAT.loadHelpPrefs();
    prefs.checklistOpen = !!open;
    SAT.saveHelpPrefs(prefs);
  };

  SAT.renderPageGuidePanel = function renderPageGuidePanel(view) {
    const guide = PAGE_GUIDES[view];
    if (!guide) return '';
    const open = SAT.isPageGuideOpen(view);
    const panelId = `page-guide-${view}`;
    return `
      <section class="page-guide no-print" data-page-guide="${view}">
        <button type="button" class="page-guide__toggle" data-action="toggle-page-guide" data-guide-view="${view}" aria-expanded="${open}" aria-controls="${panelId}">
          <span class="page-guide__toggle-icon" aria-hidden="true">${open ? '▼' : '▶'}</span>
          <span class="page-guide__toggle-label">이 페이지 사용법</span>
          <span class="page-guide__toggle-hint">${SAT.escapeHtml(guide.title)}</span>
        </button>
        <div id="${panelId}" class="page-guide__body${open ? '' : ' page-guide__body--collapsed'}">
          <ol class="page-guide__steps">
            ${guide.steps.map((s) => `<li>${SAT.escapeHtml(s)}</li>`).join('')}
          </ol>
          <button type="button" class="btn btn-secondary btn-sm page-guide__help-link" data-action="open-help">상세 도움말 보기</button>
        </div>
      </section>`;
  };

  SAT.renderDashboardChecklist = function renderDashboardChecklist(data) {
    const open = SAT.isChecklistOpen(data);
    const panelId = 'dashboard-checklist';
    const items = CHECKLIST_STEPS.map((step) => {
      const done = step.check(data);
      return `<li class="onboard-checklist__item${done ? ' onboard-checklist__item--done' : ''}">
        <span class="onboard-checklist__mark" aria-hidden="true">${done ? '✓' : '○'}</span>
        <span class="onboard-checklist__label">${SAT.escapeHtml(step.label)}</span>
        ${done ? '' : `<button type="button" class="btn btn-secondary btn-sm onboard-checklist__go" data-nav="${step.nav}">시작</button>`}
      </li>`;
    }).join('');
    const doneCount = CHECKLIST_STEPS.filter((s) => s.check(data)).length;

    return `
      <section class="onboard-checklist no-print">
        <button type="button" class="page-guide__toggle onboard-checklist__toggle" data-action="toggle-checklist" aria-expanded="${open}" aria-controls="${panelId}">
          <span class="page-guide__toggle-icon" aria-hidden="true">${open ? '▼' : '▶'}</span>
          <span class="page-guide__toggle-label">처음 사용 순서</span>
          <span class="page-guide__toggle-hint">${doneCount}/${CHECKLIST_STEPS.length} 완료</span>
        </button>
        <div id="${panelId}" class="onboard-checklist__body${open ? '' : ' page-guide__body--collapsed'}">
          <p class="onboard-checklist__intro">아래 순서대로 진행하면 시험 등록부터 결과 확인까지 완료할 수 있습니다.</p>
          <ol class="onboard-checklist__list">${items}</ol>
        </div>
      </section>`;
  };

  SAT.renderFieldHint = function renderFieldHint(type) {
    const hints = {
      'category-major': {
        title: '대분류',
        text: 'Grammar, Reading, Dialogue처럼 큰 평가 영역입니다. 모든 문항에 필수이며, 결과 분석의 기준이 됩니다.',
      },
      'category-middle': {
        title: '중분류',
        text: 'Present Perfect, Main Idea처럼 세부 학습 유형입니다. 선택 사항이며, 비워 두면 분석에서 「미분류」로 표시됩니다.',
      },
      'exam-questions': {
        title: '문항 설정',
        text: '정답과 대분류는 필수입니다. 연속 문항은 「이전 문항 분류 복사」로 빠르게 입력할 수 있습니다.',
      },
      'answer-entry': {
        title: '답안 입력 팁',
        text: '빠른 입력: 패널 선택 후 숫자키 1~5 연속 입력. 일괄 입력: 12345… 또는 쉼표·공백 구분. 문항 번호 클릭으로 수정 가능.',
      },
      'json-backup': {
        title: 'JSON 백업 — 꼭 읽어주세요',
        text: '데이터는 현재 브라우저에만 저장됩니다. 다른 PC·브라우저와 자동 동기화되지 않으며, 브라우저 데이터 삭제 시 사라질 수 있습니다. 정기 백업과 복원 전 백업을 권장합니다.',
        warn: true,
      },
    };
    const h = hints[type];
    if (!h) return '';
    return `
      <div class="field-hint${h.warn ? ' field-hint--warn' : ''}" role="note">
        <strong class="field-hint__title">${SAT.escapeHtml(h.title)}</strong>
        <p class="field-hint__text">${SAT.escapeHtml(h.text)}</p>
      </div>`;
  };

  SAT.renderEmptyState = function renderEmptyState(message, options = {}) {
    const { actionLabel, actionNav, actionAction, secondaryLabel, secondaryNav } = options;
    const buttons = [];
    if (actionNav && actionLabel) {
      buttons.push(`<button type="button" class="btn btn-primary" data-nav="${actionNav}">${SAT.escapeHtml(actionLabel)}</button>`);
    }
    if (actionAction && actionLabel) {
      buttons.push(`<button type="button" class="btn btn-primary" data-action="${actionAction}">${SAT.escapeHtml(actionLabel)}</button>`);
    }
    if (secondaryNav && secondaryLabel) {
      buttons.push(`<button type="button" class="btn btn-secondary" data-nav="${secondaryNav}">${SAT.escapeHtml(secondaryLabel)}</button>`);
    }
    const actionsHtml = buttons.length ? `<div class="empty-state__actions">${buttons.join('')}</div>` : '';
    return `<div class="empty-state"><p>${SAT.escapeHtml(message)}</p>${actionsHtml}</div>`;
  };

  SAT.renderHelpModalShell = function renderHelpModalShell() {
    const toc = HELP_SECTIONS.map(
      (s) => `<li><a href="#help-${s.id}" class="help-toc__link" data-action="help-scroll" data-help-id="${s.id}">${SAT.escapeHtml(s.title)}</a></li>`
    ).join('');
    const sections = HELP_SECTIONS.map(
      (s) => `<section id="help-${s.id}" class="help-section" tabindex="-1">
        <h3 class="help-section__title">${SAT.escapeHtml(s.title)}</h3>
        <div class="help-section__body">${SAT.formatHelpBody(s.body)}</div>
      </section>`
    ).join('');

    return `
      <div class="help-modal__header">
        <h2 class="help-modal__title">사용 안내</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-action="close-help" aria-label="도움말 닫기">닫기</button>
      </div>
      <div class="help-modal__layout">
        <nav class="help-toc" aria-label="도움말 목차">
          <p class="help-toc__heading">목차</p>
          <ul class="help-toc__list">${toc}</ul>
        </nav>
        <div class="help-modal__content">${sections}</div>
      </div>`;
  };

  SAT.formatHelpBody = function formatHelpBody(text) {
    return SAT.escapeHtml(text)
      .split('\n')
      .map((line) => (line.trim() ? `<p>${line}</p>` : ''))
      .join('');
  };

  SAT.getHelpSectionIds = function getHelpSectionIds() {
    return HELP_SECTIONS.map((s) => s.id);
  };
})(window.SAT = window.SAT || {});
