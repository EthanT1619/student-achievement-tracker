(function (SAT) {
  const {
    APP_NAME,
    escapeHtml, formatDate, formatPercent, formatRatio, daysSince,
    getMajorRate, getStudentExamTrend, computeExamOverview, computeAllExamsOverview,
    getClassAverageForExam, aggregateStudentResultsAcrossExams,
    detectAnswerMode, renderMajorCategoryChart, renderTrendChart, renderPrintChartTables,
    destroyAllCharts, getWrongQuestionNumbers, recomputeResultStats,
    collectMajorSuggestions, collectMiddleSuggestions,
    getMiddleDisplayName, getMiddleStatText, formatQuestionRateDisplay,
    collectExamTypeSuggestions,
    renderPageGuidePanel, renderDashboardChecklist, renderFieldHint, renderEmptyState,
    DEFAULT_STUDENT_RESULT_DISPLAY, STUDENT_RESULT_DISPLAY_OPTIONS, normalizeStudentResultDisplay,
    filterExams, sortExamsByDateDesc, formatExamOptionLabel, formatExamIsoDate,
    collectDistinctClassLevels, collectDistinctExamTypes, ensureValidExamSelection,
    filterTemplatesByLevel, templateQuestionsToExamQuestions,
    getExamTemplateDisplay,
    OFFICIAL_LEVELS, normalizeLevel,
  } = SAT;

  function renderOfficialLevelDatalist() {
    return `<datalist id="official-level-suggestions">${OFFICIAL_LEVELS.map((lv) => `<option value="${escapeHtml(lv)}"></option>`).join('')}</datalist>`;
  }

  class Renderer {
  constructor(app) {
    this.app = app;
  }

  render(view) {
    destroyAllCharts();
    const main = document.getElementById('main-content');
    if (!main) return;

    const data = this.app.repository.loadAll();
    const handlers = {
      dashboard: () => this.renderDashboard(main, data),
      classes: () => this.renderClasses(main, data),
      exams: () => this.renderExams(main, data),
      'answer-entry': () => this.renderAnswerEntry(main, data),
      'student-results': () => this.renderStudentResults(main, data),
      'exam-overview': () => this.renderExamOverview(main, data),
      backup: () => this.renderBackup(main, data),
    };

    const fn = handlers[view] || handlers.dashboard;
    fn();
    this.renderStorageRecoveryBanner();
    this.updateNavActive(view);
  }

  renderStorageRecoveryBanner() {
    const repo = this.app.repository;
    if (!repo.isStorageRecoveryRequired?.()) return;
    const main = document.getElementById('main-content');
    if (!main) return;
    const info = repo.getStorageRecoveryInfo?.() || {};
    const banner = document.createElement('section');
    banner.className = 'storage-recovery-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <p>${escapeHtml(info.message || SAT.STORAGE_RECOVERY_MESSAGE).replace(/\n/g, '<br>')}</p>
      <div class="btn-group">
        <button type="button" class="btn btn-secondary btn-sm" data-action="download-corrupt-json">손상 원본 JSON 다운로드</button>
        <label class="btn btn-primary btn-sm">
          JSON 백업 가져오기
          <input type="file" accept=".json,application/json" class="hidden" id="recovery-import-json-input" data-action="recovery-import-json-input">
        </label>
        <button type="button" class="btn btn-danger btn-sm" data-action="recovery-start-fresh">빈 데이터로 새로 시작</button>
      </div>
      ${
        info.corruptBackupKey
          ? `<p class="hint-text">복구 키: ${escapeHtml(info.corruptBackupKey)}</p>`
          : ''
      }`;
    main.insertAdjacentElement('afterbegin', banner);
  }

  updateNavActive(view) {
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.classList.toggle('nav-link--active', link.dataset.view === view);
    });
  }

  renderDashboard(main, data) {
    const { classes, students, exams, results, settings } = data;
    const recentExams = [...exams].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    const lastBackup = settings.lastBackupAt;
    const backupWarning = daysSince(lastBackup) >= 7;

    main.innerHTML = `
      ${renderPageGuidePanel('dashboard')}
      ${renderDashboardChecklist(data)}
      <div class="prototype-banner" role="status">
        이 프로그램은 현재 개인 테스트용 프로토타입입니다. 데이터는 사용 중인 브라우저에만 저장됩니다.
      </div>
      <div class="privacy-notice">
        데이터는 현재 브라우저에 저장됩니다. 공용 PC에서는 개인정보와 백업 파일 관리에 주의하세요.
      </div>

      <section class="stats-grid">
        ${this.statCard('등록된 반', classes.length)}
        ${this.statCard('학생 수', students.filter((s) => s.active !== false).length)}
        ${this.statCard('시험 수', exams.length)}
        ${this.statCard('저장된 결과', results.length)}
      </section>

      <section class="card">
        <div class="card-header">
          <h2>빠른 실행</h2>
        </div>
        <div class="card-body">
          <div class="btn-group">
            <button class="btn btn-primary" data-nav="exams">시험 만들기</button>
            <button class="btn btn-primary" data-nav="answer-entry">답안 입력</button>
            <button class="btn btn-primary" data-nav="student-results">학생 결과 보기</button>
            <button class="btn btn-secondary" data-nav="backup">전체 백업</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2>최근 시험</h2></div>
        <div class="card-body">
          ${
            recentExams.length
              ? `<ul class="simple-list">${recentExams
                  .map((e) => {
                    const cls = classes.find((c) => c.id === e.classId);
                    return `<li><strong>${escapeHtml(e.title)}</strong> · ${escapeHtml(cls?.name || '—')} · ${formatDate(e.date)}</li>`;
                  })
                  .join('')}</ul>`
              : renderEmptyState('등록된 시험이 없습니다. 시험 설정에서 문항과 정답을 먼저 입력해주세요.', {
                  actionLabel: '시험 만들기',
                  actionNav: 'exams',
                })
          }
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2>백업 상태</h2></div>
        <div class="card-body">
          <p>마지막 백업: <strong>${lastBackup ? formatDate(lastBackup) : '없음'}</strong></p>
          ${backupWarning ? '<p class="warning-text">최근 백업이 7일 이상 경과했습니다.</p>' : ''}
          <button class="btn btn-secondary no-print" data-action="export-json">JSON 백업보내기</button>
        </div>
      </section>`;
  }

  statCard(label, value) {
    return `<div class="stat-card"><span class="stat-card__value">${value}</span><span class="stat-card__label">${label}</span></div>`;
  }

  renderDisplayOptionToggles(options, activeMap, actionName = 'toggle-sr-display') {
    return `<div class="display-option-toggles">${options
      .map(
        (o) =>
          `<button type="button" class="display-option-toggle${activeMap[o.key] ? ' display-option-toggle--active' : ''}" data-action="${actionName}" data-display-key="${o.key}">${escapeHtml(o.label)}</button>`
      )
      .join('')}</div>`;
  }

  renderMajorCategoryList(majorStats) {
    return `<ul class="category-list">${Object.entries(majorStats || {})
      .filter(([, b]) => b.total > 0)
      .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
      .map(([cat, bucket]) => `<li><strong>${escapeHtml(cat)}</strong>: ${formatRatio(bucket.correct, bucket.total)}</li>`)
      .join('') || '<li>데이터 없음</li>'}</ul>`;
  }

  renderMiddleCategoryList(middleStats) {
    return `<ul class="category-list">${Object.entries(middleStats || {})
      .filter(([, b]) => b.total > 0)
      .sort((a, b) => getMiddleStatText(a[1]).localeCompare(getMiddleStatText(b[1]), 'ko'))
      .map(([, b]) => `<li><strong>${escapeHtml(b.major)}</strong> · ${escapeHtml(getMiddleDisplayName(b.middle))}: ${formatRatio(b.correct, b.total)}</li>`)
      .join('') || '<li>데이터 없음</li>'}</ul>`;
  }

  renderStudentResultDisplayPanel(display) {
    const allOpts = STUDENT_RESULT_DISPLAY_OPTIONS;
    const allOn = allOpts.every((o) => display[o.key]);
    const groups = [
      { id: 'all', title: '전체 시험 합산' },
      { id: 'exam', title: '선택 시험' },
    ];
    return `
      <div class="display-modal__header">
        <h2 id="sr-display-modal-title" class="modal-title">표시 옵션</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-action="close-sr-display" aria-label="닫기">✕</button>
      </div>
      <div class="display-modal__body">
        ${groups
          .map(
            (g) => `
          <div class="display-option-group">
            <p class="display-option-group__title">${g.title}</p>
            ${this.renderDisplayOptionToggles(
              allOpts.filter((o) => o.group === g.id),
              display
            )}
          </div>`
          )
          .join('')}
        <p class="hint-text">켜고 끈 항목만 화면과 인쇄에 포함됩니다. 정답률·그래프·틀린 문항 등을 개별로 선택할 수 있습니다.</p>
      </div>
      <div class="display-modal__footer">
        <button type="button" class="btn btn-secondary btn-sm" data-action="sr-display-all-on" ${allOn ? 'disabled' : ''}>전체 켜기</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="sr-display-all-off" ${!allOn ? 'disabled' : ''}>전체 끄기</button>
        <button type="button" class="btn btn-primary btn-sm" data-action="close-sr-display">완료</button>
      </div>`;
  }

  renderSettingsGearButton(action = 'open-sr-display', title = '표시 옵션') {
    return `<button type="button" class="btn btn-icon btn-secondary" data-action="${action}" title="${title}" aria-label="${title}">
      <svg class="btn-icon__svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.63c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.63c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
      </svg>
    </button>`;
  }

  renderTeacherCommentSection(result, display) {
    if (!result) return '';
    const comment = String(result.teacherComment ?? '');
    const trimmed = comment.trim();
    const printBlock =
      display.showTeacherComment && trimmed
        ? `<div class="teacher-comment teacher-comment--print">
            <h3>선생님 코멘트</h3>
            <div class="teacher-comment__text">${escapeHtml(trimmed).replace(/\n/g, '<br>')}</div>
          </div>`
        : '';
    return `
      <div class="teacher-comment-wrap">
        <div class="teacher-comment teacher-comment--edit no-print">
          <div class="teacher-comment__header">
            <h3>선생님 코멘트</h3>
            <span class="teacher-comment__save-status" id="teacher-comment-status" aria-live="polite"></span>
          </div>
          <textarea
            class="teacher-comment__input"
            id="teacher-comment-input"
            data-field="teacher-comment"
            data-result-id="${result.id}"
            placeholder="학생·학부모에게 전달할 코멘트를 입력하세요. 시험마다 따로 저장되며, 입력하면 자동 저장됩니다."
            rows="4"
          >${escapeHtml(comment)}</textarea>
          <p class="hint-text teacher-comment__hint">성적표·PDF 맨 아래에 포함됩니다. 표시 옵션에서 끄면 인쇄에서만 숨길 수 있습니다.</p>
        </div>
        ${printBlock}
      </div>`;
  }

  renderClasses(main, data) {
    const selectedClassId = this.app.state.selectedClassId || data.classes[0]?.id || '';
    const selectedClass = data.classes.find((c) => c.id === selectedClassId);
    const classStudents = data.students.filter((s) => s.classId === selectedClassId);

    main.innerHTML = `
      ${renderPageGuidePanel('classes')}
      <section class="card">
        <div class="card-header"><h2>반 관리</h2></div>
        <div class="card-body">
          <form class="inline-form" data-form="add-class">
            <div class="form-row">
              <label class="form-label">반 이름<input type="text" name="name" required></label>
              <label class="form-label">레벨<input type="text" name="level" list="official-level-suggestions" placeholder="예: DSA, DSC, LSA"></label>
              <button type="submit" class="btn btn-primary">반 추가</button>
            </div>
            ${renderOfficialLevelDatalist()}
          </form>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>반 이름</th><th>레벨</th><th>학생 수</th><th>작업</th></tr></thead>
              <tbody>
                ${
                  data.classes.length
                    ? data.classes
                        .map((c) => {
                          const count = data.students.filter((s) => s.classId === c.id && s.active !== false).length;
                          const active = c.id === selectedClassId ? ' class-row--active' : '';
                          return `<tr class="class-row${active}" data-class-id="${c.id}">
                            <td>${escapeHtml(c.name)}</td>
                            <td>${escapeHtml(c.level)}</td>
                            <td>${count}</td>
                            <td class="actions-cell">
                              <button class="btn btn-secondary btn-sm" data-action="select-class" data-id="${c.id}">선택</button>
                              <button class="btn btn-secondary btn-sm" data-action="edit-class" data-id="${c.id}">수정</button>
                              <button class="btn btn-danger btn-sm" data-action="delete-class" data-id="${c.id}">삭제</button>
                            </td>
                          </tr>`;
                        })
                        .join('')
                    : `<tr><td colspan="4">${renderEmptyState('등록된 반이 없습니다. 먼저 반을 만들어주세요.')}</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <h2>학생 관리${selectedClass ? ` — ${escapeHtml(selectedClass.name)}` : ''}</h2>
        </div>
        <div class="card-body">
          ${
            selectedClass
              ? `
            <form class="inline-form" data-form="add-student">
              <input type="hidden" name="classId" value="${selectedClassId}">
              <div class="form-row">
                <label class="form-label">이름<input type="text" name="name" required placeholder="Student A"></label>
                <label class="form-label">영어 이름<input type="text" name="englishName" placeholder="Optional"></label>
                <button type="submit" class="btn btn-primary">학생 추가</button>
              </div>
            </form>
            <div class="table-scroll">
              <table class="data-table">
                <thead><tr><th>이름</th><th>영어 이름</th><th>상태</th><th>작업</th></tr></thead>
                <tbody>
                  ${
                    classStudents.length
                      ? classStudents
                          .map((s) => {
                            const hasResults = data.results.some((r) => r.studentId === s.id);
                            const status = s.active !== false ? '<span class="badge badge--success">활성</span>' : '<span class="badge badge--muted">비활성</span>';
                            return `<tr>
                              <td>${escapeHtml(s.name)}</td>
                              <td>${escapeHtml(s.englishName)}</td>
                              <td>${status}</td>
                              <td class="actions-cell">
                                <button class="btn btn-secondary btn-sm" data-action="edit-student" data-id="${s.id}">수정</button>
                                ${s.active !== false ? `<button class="btn btn-secondary btn-sm" data-action="archive-student" data-id="${s.id}">비활성화</button>` : `<button class="btn btn-secondary btn-sm" data-action="activate-student" data-id="${s.id}">활성화</button>`}
                                <button class="btn btn-danger btn-sm" data-action="delete-student" data-id="${s.id}" ${hasResults ? 'title="결과가 연결되어 있습니다. 비활성화를 권장합니다."' : ''}>삭제</button>
                              </td>
                            </tr>`;
                          })
                          .join('')
                      : `<tr><td colspan="4">${renderEmptyState('이 반에 학생이 없습니다. 학생을 등록한 뒤 시험 결과를 입력할 수 있습니다.')}</td></tr>`
                  }
                </tbody>
              </table>
            </div>`
              : renderEmptyState('먼저 반을 등록하고 선택해주세요.', { actionLabel: '반 등록하기', actionNav: 'classes' })
          }
        </div>
      </section>`;
  }

  renderExamFiltersBar(filters, classes, exams, options = {}) {
    const {
      showSearch = true,
      showExamType = true,
      classFilterKey = 'exams-filter-classId',
      levelFilterKey = 'exams-filter-level',
      examTypeFilterKey = 'exams-filter-examType',
      searchFilterKey = 'exams-filter-search',
    } = options;
    const levels = collectDistinctClassLevels(classes);
    const types = collectDistinctExamTypes(exams);
    return `
      <div class="exam-filters">
        <div class="form-grid form-grid--2 exam-filters__grid">
          <label class="form-label">반 필터
            <select data-filter="${classFilterKey}">
              <option value="">전체</option>
              ${classes.map((c) => `<option value="${c.id}" ${filters.classId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </label>
          <label class="form-label">레벨 필터
            <select data-filter="${levelFilterKey}">
              <option value="">전체</option>
              ${levels.map((lv) => `<option value="${escapeHtml(lv)}" ${filters.level === lv ? 'selected' : ''}>${escapeHtml(lv)}</option>`).join('')}
            </select>
          </label>
          ${
            showExamType
              ? `<label class="form-label">시험 유형
            <select data-filter="${examTypeFilterKey}">
              <option value="">전체</option>
              ${types.map((t) => `<option value="${escapeHtml(t)}" ${filters.examType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
            </select>
          </label>`
              : ''
          }
          ${
            showSearch
              ? `<label class="form-label">시험명 검색
            <input type="search" data-filter="${searchFilterKey}" value="${escapeHtml(filters.search || '')}" placeholder="시험명 일부 입력" autocomplete="off">
          </label>`
              : ''
          }
        </div>
      </div>`;
  }

  renderQuestionRangePatchPanel(questionCount, allQuestions) {
    const count = Math.max(1, Number(questionCount) || 1);
    const majorSuggestions = collectMajorSuggestions(allQuestions || []);
    return `
      <div class="question-range-patch" data-question-range-patch>
        <h4 class="question-range-patch__title">범위 일괄 적용</h4>
        <p class="hint-text">CHESS처럼 같은 분류를 여러 문항에 빠르게 설정할 수 있습니다. 체크한 항목만 적용되며, 문항별 개별 수정은 그대로 가능합니다.</p>
        <div class="question-range-patch__grid">
          <label class="form-label">시작 번호
            <input type="number" name="range_start" min="1" max="${count}" value="1" data-range-patch-input>
          </label>
          <label class="form-label">끝 번호
            <input type="number" name="range_end" min="1" max="${count}" value="${count}" data-range-patch-input>
          </label>
        </div>
        <div class="question-range-patch__fields">
          <div class="question-range-patch__field">
            <label class="question-range-patch__apply">
              <input type="checkbox" name="range_apply_major" data-range-patch-toggle> 이 항목 적용
            </label>
            <label class="form-label">대분류
              <input type="text" name="range_major" list="range-major-list" placeholder="직접 입력" autocomplete="off" data-range-patch-input>
              <datalist id="range-major-list">${majorSuggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('')}</datalist>
            </label>
          </div>
          <div class="question-range-patch__field">
            <label class="question-range-patch__apply">
              <input type="checkbox" name="range_apply_middle" data-range-patch-toggle> 이 항목 적용
            </label>
            <label class="form-label">중분류
              <input type="text" name="range_middle" placeholder="선택 또는 입력" autocomplete="off" data-range-patch-input>
            </label>
          </div>
          <div class="question-range-patch__field">
            <label class="question-range-patch__apply">
              <input type="checkbox" name="range_apply_points" data-range-patch-toggle> 이 항목 적용
            </label>
            <label class="form-label">배점
              <input type="number" name="range_points" min="1" step="1" value="1" data-range-patch-input>
            </label>
          </div>
          <div class="question-range-patch__field">
            <label class="question-range-patch__apply">
              <input type="checkbox" name="range_apply_note" data-range-patch-toggle> 이 항목 적용
            </label>
            <label class="form-label">메모
              <input type="text" name="range_note" autocomplete="off" data-range-patch-input>
            </label>
          </div>
        </div>
        <div class="question-range-patch__actions">
          <div class="btn-group btn-group--sm question-range-patch__presets">
            <button type="button" class="btn btn-secondary btn-sm" data-action="range-patch-preset" data-preset="full-range">현재 범위 전체 선택</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="range-patch-preset" data-preset="major-only">대분류만 적용</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="range-patch-preset" data-preset="major-middle">대분류 + 중분류 적용</button>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-action="apply-question-range-patch">범위에 적용</button>
        </div>
      </div>`;
  }

  renderTemplateQuestionRows(questions, count, allQuestions) {
    const source = allQuestions || questions;
    const majorSuggestions = collectMajorSuggestions(source);
    const rows = [];
    const qMap = new Map((questions || []).map((q) => [q.number, q]));
    for (let i = 1; i <= count; i++) {
      const q = qMap.get(i) || {};
      const middleSuggestions = collectMiddleSuggestions(source, q.majorCategory);
      rows.push(`
        <div class="question-row question-row--template" data-number="${i}">
          <span class="question-row__num">#${i}</span>
          <label class="form-label">배점<input type="number" name="q_${i}_points" min="1" value="${q.points || 1}" required></label>
          <label class="form-label form-label--category form-label--major">
            <span class="form-label__title">대분류<span class="required-mark" aria-hidden="true">*</span></span>
            <input type="text" name="q_${i}_major" list="tpl-major-list-${i}" value="${escapeHtml(q.majorCategory || '')}" placeholder="직접 입력" data-question-major="${i}" required autocomplete="off">
            <datalist id="tpl-major-list-${i}">${majorSuggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('')}</datalist>
          </label>
          <label class="form-label form-label--category form-label--middle">중분류
            <input type="text" name="q_${i}_middle" list="tpl-middle-list-${i}" value="${escapeHtml(q.middleCategory || '')}" placeholder="선택 또는 입력 (선택)" data-question-middle="${i}" autocomplete="off">
            <datalist id="tpl-middle-list-${i}">${middleSuggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('')}</datalist>
          </label>
          <label class="form-label">메모<input type="text" name="q_${i}_note" value="${escapeHtml(q.note || '')}" autocomplete="off"></label>
        </div>`);
    }
    return rows.join('');
  }

  renderTemplateManagementSection(data) {
    const editingId = this.app.state.editingTemplateId;
    const editingTemplate =
      editingId === '__new__'
        ? { id: '', name: '', level: '', examType: '', questionCount: 10, questions: [] }
        : editingId
          ? data.assessmentTemplates.find((t) => t.id === editingId)
          : null;
    const templates = data.assessmentTemplates || [];
    const presetButtons = (SAT.PRESET_ASSESSMENT_TEMPLATES || [])
      .map(
        (p) =>
          `<button type="button" class="btn btn-secondary btn-sm" data-action="add-preset-template" data-preset="${p.key}">${escapeHtml(p.name)} 추가</button>`
      )
      .join('');

    const editForm = editingTemplate
      ? `
        <form data-form="template-setup" class="template-setup-form">
          ${editingTemplate.id ? `<input type="hidden" name="templateId" value="${editingTemplate.id}">` : ''}
          <div class="form-grid">
            <label class="form-label">템플릿 이름<input type="text" name="name" required value="${escapeHtml(editingTemplate.name)}"></label>
            <label class="form-label">레벨<input type="text" name="level" required value="${escapeHtml(editingTemplate.level)}" list="official-level-suggestions" placeholder="예: DSA, DSC, LSA"></label>
            <label class="form-label">시험 유형<input type="text" name="examType" value="${escapeHtml(editingTemplate.examType || '')}"></label>
            <label class="form-label">문항 수<input type="number" name="questionCount" min="1" max="100" required value="${editingTemplate.questionCount}"></label>
          </div>
          <p class="hint-text">템플릿에는 정답을 저장하지 않습니다. 시험 생성 시 문항 구조만 적용됩니다.</p>
          ${this.renderQuestionRangePatchPanel(editingTemplate.questionCount, data.questions)}
          <div id="template-questions-container" class="questions-container">
            ${this.renderTemplateQuestionRows(editingTemplate.questions, editingTemplate.questionCount, data.questions)}
          </div>
          <div class="btn-group">
            <button type="submit" class="btn btn-primary">템플릿 저장</button>
            <button type="button" class="btn btn-secondary" data-action="cancel-edit-template">취소</button>
          </div>
        </form>
        ${renderOfficialLevelDatalist()}`
      : '';

    return `
      <section class="card template-management no-print">
        <div class="card-header">
          <h2>시험 템플릿</h2>
          <span class="badge">${templates.length}개</span>
        </div>
        <div class="card-body">
          <p class="hint-text">시험 양식(문항 수·대분류 구조)을 레벨별로 저장해 두었다가, 실제 시험 생성 시 재사용합니다. 기존 시험 데이터와는 별도로 관리됩니다.</p>
          ${
            editingTemplate
              ? editForm
              : `
          <div class="template-preset-actions">
            <span class="template-preset-actions__label">기본 템플릿 추가:</span>
            <div class="btn-group btn-group--sm">${presetButtons}</div>
            <button type="button" class="btn btn-primary btn-sm" data-action="new-template">새 템플릿 작성</button>
          </div>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>이름</th><th>레벨</th><th>유형</th><th>문항</th><th>작업</th></tr></thead>
              <tbody>
                ${
                  templates.length
                    ? templates
                        .map(
                          (t) => `<tr>
                          <td>${escapeHtml(t.name)}</td>
                          <td>${escapeHtml(t.level || '—')}</td>
                          <td>${escapeHtml(t.examType || '—')}</td>
                          <td>${t.questionCount}</td>
                          <td class="actions-cell">
                            <button type="button" class="btn btn-secondary btn-sm" data-action="edit-template" data-id="${t.id}">수정</button>
                            <button type="button" class="btn btn-secondary btn-sm" data-action="duplicate-template" data-id="${t.id}">복제</button>
                            <button type="button" class="btn btn-danger btn-sm" data-action="delete-template" data-id="${t.id}">삭제</button>
                          </td>
                        </tr>`
                        )
                        .join('')
                    : `<tr><td colspan="5">${renderEmptyState('등록된 템플릿이 없습니다. 기본 템플릿 추가 버튼을 사용하거나 시험에서 템플릿을 만들 수 있습니다.')}</td></tr>`
                }
              </tbody>
            </table>
          </div>`
          }
        </div>
      </section>`;
  }

  renderExamTemplatePicker(classId, classes, templates, selectedTemplateId) {
    const selectedClass = classes.find((c) => c.id === classId);
    const level = normalizeLevel(selectedClass?.level) || '';
    const levelTemplates = filterTemplatesByLevel(templates, level);
    const blankActive = selectedTemplateId === 'blank' ? ' template-picker__card--active' : '';

    return `
      <div class="exam-setup-step">
        <h3 class="exam-setup-step__title">2. 템플릿 선택</h3>
        <p class="hint-text">선택한 반의 레벨: <strong>${level ? escapeHtml(level) : '미설정'}</strong>${level ? '' : ' — 반·학생 메뉴에서 레벨을 입력하면 해당 레벨 템플릿이 표시됩니다.'}</p>
        <div class="template-picker">
          <button type="button" class="template-picker__card${blankActive}" data-action="select-exam-template" data-id="blank">
            <span class="template-picker__name">빈 시험에서 시작</span>
            <span class="template-picker__meta">문항 수·분류를 직접 입력</span>
          </button>
          ${
            levelTemplates.length
              ? levelTemplates
                  .map((t) => {
                    const active = selectedTemplateId === t.id ? ' template-picker__card--active' : '';
                    const majors = [...new Set(t.questions.map((q) => q.majorCategory).filter(Boolean))];
                    return `<button type="button" class="template-picker__card${active}" data-action="select-exam-template" data-id="${t.id}">
                      <span class="template-picker__name">${escapeHtml(t.name)}</span>
                      <span class="template-picker__meta">${escapeHtml(t.examType || '유형 없음')} · ${t.questionCount}문항</span>
                      <span class="template-picker__meta template-picker__meta--minor">${escapeHtml(majors.slice(0, 3).join(', '))}${majors.length > 3 ? '…' : ''}</span>
                    </button>`;
                  })
                  .join('')
              : `<p class="hint-text">${level ? '이 레벨에 맞는 템플릿이 없습니다. 빈 시험에서 시작하거나 템플릿을 추가하세요.' : '반을 선택하면 템플릿 목록이 표시됩니다.'}</p>`
          }
        </div>
      </div>`;
  }

  renderExams(main, data) {
    const editingId = this.app.state.editingExamId;
    const editingExam = editingId ? data.exams.find((e) => e.id === editingId) : null;
    const questions = editingId ? this.app.repository.getQuestionsByExam(editingId) : [];
    const examTypeSuggestions = collectExamTypeSuggestions(data.exams);
    const listFilters = this.app.state.examsListFilters;
    const filteredExams = filterExams(data.exams, {
      classes: data.classes,
      ...listFilters,
    });
    const examSetup = this.app.state.examSetup;
    const setupClassId = editingExam ? editingExam.classId : examSetup.classId;
    const setupTemplateId = editingExam ? '' : examSetup.templateId;
    const selectedClass = data.classes.find((c) => c.id === setupClassId);

    let draftQuestions = questions;
    let draftQuestionCount = editingExam?.questionCount || 10;
    let draftExamType = editingExam?.examType || '';
    let draftTemplateId = editingExam?.templateId || '';
    let draftTemplateName = '';
    let draftTemplateLevel = '';

    if (!editingExam && setupTemplateId === 'blank') {
      draftQuestions = [];
      draftQuestionCount = 10;
      draftExamType = '';
      draftTemplateId = '';
    } else if (!editingExam && setupTemplateId) {
      const template = data.assessmentTemplates.find((t) => t.id === setupTemplateId);
      if (template) {
        draftQuestions = templateQuestionsToExamQuestions(template);
        draftQuestionCount = template.questionCount;
        draftExamType = template.examType || '';
        draftTemplateId = template.id;
        draftTemplateName = template.name || '';
        draftTemplateLevel = template.level || '';
      }
    }

    const examTemplateDisplay = editingExam
      ? getExamTemplateDisplay(editingExam, data.assessmentTemplates)
      : null;

    const showExamDetailsForm = editingExam || (setupClassId && setupTemplateId);

    const setupClassSelect = editingExam
      ? ''
      : `<div class="exam-setup-step">
              <h3 class="exam-setup-step__title">1. 반 선택</h3>
              <label class="form-label">반
                <select data-filter="exam-setup-classId" required>
                  <option value="">선택</option>
                  ${data.classes.map((c) => `<option value="${c.id}" ${setupClassId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}${c.level ? ` (${escapeHtml(c.level)})` : ''}</option>`).join('')}
                </select>
              </label>
            </div>
            ${setupClassId ? this.renderExamTemplatePicker(setupClassId, data.classes, data.assessmentTemplates, setupTemplateId) : '<p class="hint-text">반을 선택하면 이 반 레벨에 맞는 템플릿이 표시됩니다.</p>'}`;

    const examDetailsForm = showExamDetailsForm
      ? `
          <form data-form="exam-setup">
            ${editingId ? `<input type="hidden" name="examId" value="${editingId}">` : ''}
            ${
              draftTemplateId && !editingExam
                ? `<input type="hidden" name="templateId" value="${escapeHtml(draftTemplateId)}">
            <input type="hidden" name="templateNameSnapshot" value="${escapeHtml(draftTemplateName)}">
            <input type="hidden" name="templateLevelSnapshot" value="${escapeHtml(draftTemplateLevel)}">`
                : ''
            }
            ${editingExam?.templateId ? `<input type="hidden" name="templateId" value="${escapeHtml(editingExam.templateId)}">` : ''}
            <div class="exam-setup-step">
              <h3 class="exam-setup-step__title">${editingExam ? '시험 정보' : '3. 시험 정보 및 정답 입력'}</h3>
              <div class="form-grid">
                <label class="form-label">시험명<input type="text" name="title" required value="${escapeHtml(editingExam?.title || '')}"></label>
                ${
                  editingExam
                    ? `<label class="form-label">반
                  <select name="classId" required>
                    <option value="">선택</option>
                    ${data.classes.map((c) => `<option value="${c.id}" ${editingExam.classId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                  </select>
                </label>`
                    : `<input type="hidden" name="classId" value="${setupClassId}">`
                }
                <label class="form-label">시험일<input type="date" name="date" required value="${editingExam?.date || new Date().toISOString().slice(0, 10)}"></label>
                <label class="form-label">시험 유형
                  <input type="text" name="examType" list="exam-type-list" value="${escapeHtml(draftExamType)}" autocomplete="off">
                  <datalist id="exam-type-list">${examTypeSuggestions.map((t) => `<option value="${escapeHtml(t)}">`).join('')}</datalist>
                </label>
                <label class="form-label">문항 수<input type="number" name="questionCount" min="1" max="100" required value="${draftQuestionCount}"></label>
              </div>
              ${draftTemplateId && !editingExam ? '<p class="hint-text">템플릿에서 문항 구조를 불러왔습니다. 정답은 이번 시험에 맞게 입력해주세요.</p>' : ''}
              ${examTemplateDisplay ? `<p class="hint-text exam-template-origin">${escapeHtml(examTemplateDisplay.text)}</p>` : ''}
              ${renderFieldHint('exam-questions')}
              ${renderFieldHint('category-major')}
              ${renderFieldHint('category-middle')}
              ${this.renderQuestionRangePatchPanel(draftQuestionCount, data.questions)}
              <div id="questions-container" class="questions-container">
                ${this.renderQuestionRows(draftQuestions, draftQuestionCount, data.questions)}
              </div>
              <div class="btn-group">
                <button type="submit" class="btn btn-primary">${editingExam ? '시험 저장' : '시험 생성'}</button>
                ${editingExam ? '<button type="button" class="btn btn-secondary" data-action="cancel-edit-exam">취소</button>' : ''}
              </div>
            </div>
          </form>`
      : '';

    const createExamWizard = !editingExam
      ? data.classes.length
        ? `${setupClassSelect}${setupClassId && !setupTemplateId ? '<p class="hint-text">템플릿을 선택하거나 「빈 시험에서 시작」을 눌러주세요.</p>' : ''}`
        : renderEmptyState('시험을 만들려면 먼저 반을 등록해주세요.', { actionLabel: '반·학생으로 이동', actionNav: 'classes' })
      : '';

    main.innerHTML = `
      ${renderPageGuidePanel('exams')}
      ${this.renderTemplateManagementSection(data)}
      <section class="card no-print">
        <div class="card-header"><h2>${editingExam ? '시험 수정' : '시험 생성'}</h2></div>
        <div class="card-body">
          ${editingExam ? examDetailsForm : createExamWizard + examDetailsForm}
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <h2>등록된 시험</h2>
          <span class="badge">${filteredExams.length}/${data.exams.length}건</span>
        </div>
        <div class="card-body">
          ${this.renderExamFiltersBar(listFilters, data.classes, data.exams)}
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>시험명</th><th>반</th><th>유형</th><th>날짜</th><th>문항</th><th>작업</th></tr></thead>
              <tbody>
                ${
                  filteredExams.length
                    ? filteredExams
                        .map((e) => {
                          const cls = data.classes.find((c) => c.id === e.classId);
                          const resultCount = data.results.filter((r) => r.examId === e.id).length;
                          return `<tr>
                            <td>${escapeHtml(e.title)}</td>
                            <td>${escapeHtml(cls?.name || '—')}</td>
                            <td>${escapeHtml(e.examType || '—')}</td>
                            <td>${formatExamIsoDate(e.date)}</td>
                            <td>${e.questionCount}</td>
                            <td class="actions-cell">
                              <button class="btn btn-secondary btn-sm" data-action="edit-exam" data-id="${e.id}">수정</button>
                              <button class="btn btn-secondary btn-sm" data-action="duplicate-exam" data-id="${e.id}">복제</button>
                              <button class="btn btn-secondary btn-sm" data-action="create-template-from-exam" data-id="${e.id}">템플릿 만들기</button>
                              <button class="btn btn-secondary btn-sm" data-nav="exam-overview" data-exam-id="${e.id}">결과</button>
                              <button class="btn btn-danger btn-sm" data-action="delete-exam" data-id="${e.id}" data-results="${resultCount}">삭제</button>
                            </td>
                          </tr>`;
                        })
                        .join('')
                    : data.exams.length
                      ? `<tr><td colspan="6">${renderEmptyState('조건에 맞는 시험이 없습니다. 필터를 조정해주세요.')}</td></tr>`
                      : `<tr><td colspan="6">${renderEmptyState('등록된 시험이 없습니다. 시험 설정에서 문항과 정답을 먼저 입력해주세요.')}</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      </section>`;
  }

  renderQuestionRows(questions, count, allQuestions) {
    const source = allQuestions || questions;
    const majorSuggestions = collectMajorSuggestions(source);
    const rows = [];
    const qMap = new Map(questions.map((q) => [q.number, q]));
    for (let i = 1; i <= count; i++) {
      const q = qMap.get(i) || {};
      const middleSuggestions = collectMiddleSuggestions(source, q.majorCategory);
      rows.push(`
        <div class="question-row" data-number="${i}">
          <span class="question-row__num">#${i}</span>
          <label class="form-label">정답<input type="text" name="q_${i}_answer" value="${escapeHtml(q.correctAnswer || '')}" required autocomplete="off"></label>
          <label class="form-label">배점<input type="number" name="q_${i}_points" min="1" value="${q.points || 1}" required></label>
          <label class="form-label form-label--category form-label--major">
            <span class="form-label__title">대분류<span class="required-mark" aria-hidden="true">*</span></span>
            <input type="text" name="q_${i}_major" list="major-list-${i}" value="${escapeHtml(q.majorCategory || '')}" placeholder="직접 입력" data-question-major="${i}" required autocomplete="off">
            <datalist id="major-list-${i}">${majorSuggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('')}</datalist>
          </label>
          <label class="form-label form-label--category form-label--middle">중분류
            <input type="text" name="q_${i}_middle" list="middle-list-${i}" value="${escapeHtml(q.middleCategory || '')}" placeholder="선택 또는 입력 (선택)" data-question-middle="${i}" autocomplete="off">
            <datalist id="middle-list-${i}">${middleSuggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('')}</datalist>
          </label>
          <label class="form-label">메모<input type="text" name="q_${i}_note" value="${escapeHtml(q.note || '')}" autocomplete="off"></label>
          <div class="question-row__actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="copy-prev-categories" data-num="${i}" ${i <= 1 ? 'disabled' : ''}>↑ 이전 문항 분류 복사</button>
          </div>
          ${q.id ? `<input type="hidden" name="q_${i}_id" value="${q.id}">` : ''}
        </div>`);
    }
    return rows.join('');
  }

  renderAnswerEntry(main, data) {
    const { classId, examId, studentId } = this.app.state.answerEntry;
    const classes = data.classes;
    const exams = classId
      ? sortExamsByDateDesc(data.exams.filter((e) => e.classId === classId))
      : [];
    const validExamId = ensureValidExamSelection(examId, exams);
    if (validExamId !== examId) {
      this.app.state.answerEntry.examId = validExamId;
      this.app.saveUiPrefs();
    }
    const resolvedExamId = this.app.state.answerEntry.examId;
    const students = classId ? data.students.filter((s) => s.classId === classId && s.active !== false) : [];
    const exam = resolvedExamId ? data.exams.find((e) => e.id === resolvedExamId) : null;
    const questions = resolvedExamId ? this.app.repository.getQuestionsByExam(resolvedExamId) : [];
    const existing = resolvedExamId && studentId ? this.app.repository.getResultByExamStudent(resolvedExamId, studentId) : null;
    const answers = { ...(this.app.state.currentAnswers || existing?.answers || {}) };
    const currentQ = this.app.state.currentQuestion || 1;
    const answerMode = questions.length ? detectAnswerMode(questions) : 'numeric';
    const options = answerMode === 'alpha' ? ['A', 'B', 'C', 'D', 'E'] : answerMode === 'numeric' ? ['1', '2', '3', '4', '5'] : [];
    const entryMode = this.app.state.answerEntryMode || 'fast';
    const hasNextStudent = this.app.hasNextAnswerStudent();
    const studentName = escapeHtml(students.find((s) => s.id === studentId)?.name || '');

    main.innerHTML = `
      ${renderPageGuidePanel('answer-entry')}
      <section class="card no-print">
        <div class="card-header"><h2>답안 입력</h2></div>
        <div class="card-body">
          <div class="form-grid form-grid--3">
            <label class="form-label">반
              <select data-filter="classId">
                <option value="">선택</option>
                ${classes.map((c) => `<option value="${c.id}" ${classId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </label>
            <label class="form-label">시험
              <select data-filter="examId" ${!classId ? 'disabled' : ''}>
                <option value="">선택</option>
                ${exams.map((e) => `<option value="${e.id}" ${resolvedExamId === e.id ? 'selected' : ''}>${escapeHtml(formatExamOptionLabel(e))}</option>`).join('')}
              </select>
            </label>
            <label class="form-label">학생
              <select data-filter="studentId" ${!resolvedExamId ? 'disabled' : ''}>
                <option value="">선택</option>
                ${students.map((s) => `<option value="${s.id}" ${studentId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>
      </section>

      ${
        exam && studentId && questions.length
          ? `
        <section class="card" id="answer-entry-card">
          <div class="card-header">
            <h2>${escapeHtml(exam.title)} — ${studentName}</h2>
            ${existing ? '<span class="badge badge--info">기존 결과 불러옴</span>' : ''}
          </div>
          <div class="card-body">
            <div class="answer-mode-tabs no-print">
              <button type="button" class="answer-mode-tab${entryMode === 'fast' ? ' answer-mode-tab--active' : ''}" data-action="answer-mode-fast">빠른 입력</button>
              <button type="button" class="answer-mode-tab${entryMode === 'bulk' ? ' answer-mode-tab--active' : ''}" data-action="answer-mode-bulk">일괄 입력</button>
            </div>
            ${renderFieldHint('answer-entry')}

            <div id="answer-grid" class="answer-grid" aria-label="문항별 답안 — 클릭하면 해당 문항으로 이동">
              ${this.renderAnswerGridHtml(questions, answers, currentQ, this.app.state.answerIssueQuestions || [])}
            </div>
            <p class="hint-text hint-text--grid">문항 번호를 클릭하면 해당 문항 입력으로 이동합니다. 오류·미입력 문항은 빨간색으로 표시됩니다.</p>

            <div id="answer-fast-panel" class="${entryMode === 'bulk' ? 'hidden' : ''}">
              <div id="answer-capture-panel" class="answer-panel answer-panel--focus" tabindex="0" role="group" aria-label="답안 빠른 입력">
                <div class="answer-current-label">문항 <span id="answer-current-num">${currentQ}</span> <span class="answer-current-total">/ ${questions.length}</span></div>
                <div id="answer-options" class="answer-options${answerMode === 'text' ? ' hidden' : ''}">
                  ${this.renderAnswerOptionsHtml(questions, answers, currentQ, options)}
                </div>
                <div id="answer-direct-wrap" class="${answerMode === 'text' ? '' : 'answer-direct-wrap--collapsed'}">
                  <label class="form-label">직접 입력
                    <input type="text" id="answer-text-input" class="answer-text-input" value="${escapeHtml(getCurrentAnswer(answers, questions, currentQ))}" autocomplete="off">
                  </label>
                </div>
              </div>
              <p class="hint-text">${answerMode === 'text'
                ? '답을 입력한 뒤 Enter로 다음 문항으로 이동할 수 있습니다.'
                : '답안 입력 영역을 한 번 선택한 뒤 숫자키 1~5를 연속으로 입력할 수 있습니다. · 방향키로 문항 이동'}</p>
            </div>

            <div id="answer-bulk-panel" class="${entryMode === 'fast' ? 'hidden' : ''}">
              <label class="form-label">답안 일괄 입력
                <textarea id="bulk-answer-input" class="bulk-answer-input" rows="4" placeholder="예: 1234512345 또는 1, 2, 3, 4, 5">${escapeHtml(this.app.state.bulkInputDraft || '')}</textarea>
              </label>
              <p class="hint-text">공백, 쉼표, 줄바꿈, /, - 로 구분하거나 붙여서 입력할 수 있습니다.</p>
              <div id="bulk-validation-msg" class="bulk-validation-msg" aria-live="polite"></div>
              <button type="button" class="btn btn-primary" data-action="apply-bulk">일괄 적용</button>
            </div>

            <div class="btn-group no-print answer-actions">
              <button type="button" class="btn btn-secondary" data-action="prev-question" id="btn-prev-question" ${currentQ <= 1 ? 'disabled' : ''}>이전</button>
              <button type="button" class="btn btn-secondary" data-action="next-question" id="btn-next-question" ${currentQ >= questions.length ? 'disabled' : ''}>다음</button>
              <button type="button" class="btn btn-primary" data-action="save-answers">저장 및 채점</button>
              <button type="button" class="btn btn-secondary" data-action="save-and-next-student" id="btn-save-next-student" ${hasNextStudent ? '' : 'disabled'} title="${hasNextStudent ? '' : '마지막 학생입니다.'}">저장 후 다음 학생</button>
            </div>
          </div>
        </section>`
          : `<div class="card">${renderEmptyState(
              !classId
                ? '반을 먼저 선택해주세요. 등록된 반이 없다면 반·학생 메뉴에서 반을 만드세요.'
                : !resolvedExamId
                  ? '시험을 선택해주세요. 등록된 시험이 없다면 시험 설정에서 문항과 정답을 먼저 입력해주세요.'
                  : '학생을 선택해주세요. 이 반에 학생이 없다면 반·학생 메뉴에서 학생을 등록하세요.',
              {
                actionLabel: !classId ? '반·학생으로 이동' : !resolvedExamId ? '시험 설정으로 이동' : '반·학생으로 이동',
                actionNav: !classId ? 'classes' : !resolvedExamId ? 'exams' : 'classes',
              }
            )}</div>`
      }`;

    if (exam && studentId && questions.length) {
      requestAnimationFrame(() => this.app.initAnswerEntryPanel());
    }
  }

  renderAnswerGridHtml(questions, answers, currentQ, issueQuestions = []) {
    const issueSet = new Set(issueQuestions || []);
    return questions
      .map((q) => {
        const ans = answers[q.id] ?? answers[String(q.number)] ?? '';
        const missing = !String(ans).trim();
        const active = q.number === currentQ ? ' answer-grid-item--active' : '';
        const missClass = missing ? ' answer-grid-item--missing' : '';
        const issueClass = issueSet.has(q.number) ? ' answer-grid-item--issue' : '';
        const display = missing ? '—' : escapeHtml(String(ans));
        return `<button type="button" class="answer-grid-item${active}${missClass}${issueClass}" data-goto="${q.number}" aria-label="문항 ${q.number}${missing ? ' 미입력' : ` 답 ${ans}`}${issueSet.has(q.number) ? ' 확인 필요' : ''}">
          <span class="answer-grid-item__num">${q.number}</span>
          <span class="answer-grid-item__val">${display}</span>
        </button>`;
      })
      .join('');
  }

  renderAnswerOptionsHtml(questions, answers, currentQ, options) {
    const q = questions.find((x) => x.number === currentQ);
    const currentAns = q ? (answers[q.id] ?? answers[String(q.number)] ?? '') : '';
    return options
      .map((opt) => {
        const selected = normalizeOpt(currentAns) === normalizeOpt(opt) ? ' answer-btn--selected' : '';
        return `<button type="button" class="answer-btn${selected}" data-answer="${opt}">${opt}</button>`;
      })
      .join('');
  }

  renderStudentResults(main, data) {
    this.app.flushTeacherCommentSave();
    const { classId, studentId } = this.app.state.studentResults;
    const classes = data.classes;
    const students = classId ? data.students.filter((s) => s.classId === classId) : [];
    const student = studentId ? data.students.find((s) => s.id === studentId) : null;
    const results = studentId ? this.app.repository.getResults({ studentId }) : [];
    const exams = data.exams;
    const ignoreCase = data.settings?.ignoreCase !== false;
    const gradeOptions = { ignoreCase };
    const questionsByExam = {};
    exams.forEach((e) => {
      questionsByExam[e.id] = this.app.repository.getQuestionsByExam(e.id);
    });
    const trendData = studentId ? getStudentExamTrend(results, exams, questionsByExam, gradeOptions) : [];
    const selectedResultId = this.app.state.selectedResultId || results[results.length - 1]?.id;
    const selectedResult = results.find((r) => r.id === selectedResultId);
    const selectedExam = selectedResult ? exams.find((e) => e.id === selectedResult.examId) : null;
    const questions = selectedExam ? this.app.repository.getQuestionsByExam(selectedExam.id) : [];
    const examResults = selectedExam ? this.app.repository.getResults({ examId: selectedExam.id }) : [];
    const classAvg = getClassAverageForExam(examResults, questions, gradeOptions);
    const graded = selectedResult && questions.length
      ? recomputeResultStats(selectedResult, questions, gradeOptions)
      : null;
    const categoryStats = graded?.categoryStats || { major: {}, middle: {} };
    const wrongNums = selectedResult ? getWrongQuestionNumbers(selectedResult, questions, gradeOptions) : [];
    const displayMetrics = graded || selectedResult;
    const display = normalizeStudentResultDisplay(this.app.state.studentResultDisplay);
    const allExamsStats = results.length
      ? aggregateStudentResultsAcrossExams(results, questionsByExam, gradeOptions)
      : null;
    const hasMiddleData = Object.values(categoryStats.middle || {}).some((b) => b.total > 0)
      || (allExamsStats && Object.values(allExamsStats.categoryStats.middle || {}).some((b) => b.total > 0));
    const showAnyAllExams =
      allExamsStats?.examCount > 0
      && (display.showAllExamsMetrics || display.showAllExamsMajorRates || display.showAllExamsMajorChart);
    const showAnyExamSection =
      display.showExamTitle
      || display.showExamMetrics
      || display.showMajorCategoryRates
      || display.showMiddleCategoryRates
      || display.showWrongQuestions
      || display.showExamMajorChart
      || display.showTrendChart
      || display.showPrintChartTables
      || display.showTeacherComment;

    main.innerHTML = `
      ${renderPageGuidePanel('student-results')}
      <section class="card no-print">
        <div class="card-header"><h2>학생 결과</h2></div>
        <div class="card-body">
          <div class="form-grid form-grid--2">
            <label class="form-label">반
              <select data-filter="sr-classId">
                <option value="">선택</option>
                ${classes.map((c) => `<option value="${c.id}" ${classId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </label>
            <label class="form-label">학생
              <select data-filter="sr-studentId" ${!classId ? 'disabled' : ''}>
                <option value="">선택</option>
                ${students.map((s) => `<option value="${s.id}" ${studentId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>
      </section>

      ${
        student && results.length
          ? `
        <section class="card no-print">
          <div class="card-header">
            <h2>시험 선택</h2>
            <div class="btn-group btn-group--sm">
              ${this.renderSettingsGearButton()}
              <button class="btn btn-secondary btn-sm no-print" data-action="print-results">인쇄</button>
            </div>
          </div>
          <div class="card-body">
            <div class="btn-group">
              ${results
                .map((r) => {
                  const ex = exams.find((e) => e.id === r.examId);
                  const active = r.id === selectedResultId ? ' btn-primary' : ' btn-secondary';
                  return `<button class="btn${active} btn-sm" data-action="select-result" data-id="${r.id}">${escapeHtml(ex?.title || '—')} (${formatDate(ex?.date)})</button>`;
                })
                .join('')}
            </div>
          </div>
        </section>

        ${
          selectedResult && selectedExam
            ? `
          ${
            showAnyAllExams
              ? `
          <section class="card result-all-exams">
            <div class="card-header">
              <h2>전체 시험 합산</h2>
              <span class="badge">${allExamsStats.examCount}회 응시</span>
            </div>
            <div class="card-body">
              ${
                display.showAllExamsMetrics
                  ? `
              <div class="result-summary">
                <div class="result-metric"><span class="result-metric__value">${formatPercent(allExamsStats.avgExamPercentage)}</span><span class="result-metric__label">시험 평균</span></div>
                <div class="result-metric"><span class="result-metric__value">${allExamsStats.correctCount}/${allExamsStats.questionCount}</span><span class="result-metric__label">전체 정답</span></div>
                <div class="result-metric"><span class="result-metric__value">${allExamsStats.earnedPoints}/${allExamsStats.totalPoints}</span><span class="result-metric__label">전체 총점</span></div>
                <div class="result-metric"><span class="result-metric__value">${formatPercent(allExamsStats.percentage)}</span><span class="result-metric__label">전체 정답률</span></div>
              </div>`
                  : ''
              }
              ${
                display.showAllExamsMajorRates
                  ? `<h3>대분류별 정답률 (전체 시험)</h3>
              ${this.renderMajorCategoryList(allExamsStats.categoryStats.major)}`
                  : ''
              }
              ${
                display.showAllExamsMajorChart
                  ? `<h3>대분류별 그래프 (전체 시험)</h3>
              <div id="chart-major-all" class="chart-wrapper"></div>`
                  : ''
              }
            </div>
          </section>`
              : ''
          }
          <section class="card result-detail">
            <div class="print-header">
              <h2>${escapeHtml(student.name)}${student.englishName ? ` (${escapeHtml(student.englishName)})` : ''}</h2>
              <p>${APP_NAME} · 상담용 결과</p>
            </div>
            ${
              display.showExamTitle
                ? `<div class="card-header">
              <h2>${escapeHtml(selectedExam.title)}</h2>
              <span class="badge">${formatDate(selectedExam.date)}</span>
            </div>`
                : ''
            }
            <div class="card-body">
              ${
                !showAnyExamSection
                  ? '<p class="hint-text">표시 옵션에서 항목을 켜면 결과가 표시됩니다.</p>'
                  : ''
              }
              ${
                display.showExamMetrics
                  ? `
              <div class="result-summary">
                <div class="result-metric"><span class="result-metric__value">${displayMetrics.earnedPoints}/${displayMetrics.totalPoints}</span><span class="result-metric__label">총점</span></div>
                <div class="result-metric"><span class="result-metric__value">${displayMetrics.correctCount}/${questions.length}</span><span class="result-metric__label">정답 수</span></div>
                <div class="result-metric"><span class="result-metric__value">${formatPercent(displayMetrics.percentage)}</span><span class="result-metric__label">정답률</span></div>
                <div class="result-metric"><span class="result-metric__value">${classAvg != null ? formatPercent(classAvg) : '데이터 없음'}</span><span class="result-metric__label">반 평균</span></div>
              </div>`
                  : ''
              }

              ${
                display.showMajorCategoryRates
                  ? `<h3>대분류별 정답률</h3>
              ${this.renderMajorCategoryList(categoryStats.major)}`
                  : ''
              }

              ${
                display.showMiddleCategoryRates
                  ? `<h3>중분류별 정답률</h3>
              ${this.renderMiddleCategoryList(categoryStats.middle)}
              ${!hasMiddleData ? '<p class="hint-text">중분류 데이터가 없습니다.</p>' : ''}`
                  : ''
              }

              ${
                display.showWrongQuestions
                  ? `<h3>틀린 문항</h3>
              <p class="wrong-questions-list">${wrongNums.length ? wrongNums.join(', ') : '없음'}</p>`
                  : ''
              }

              ${
                display.showExamMajorChart
                  ? `<h3>대분류별 그래프 (이번 시험)</h3>
              <div id="chart-major" class="chart-wrapper"></div>`
                  : ''
              }

              ${
                display.showTrendChart
                  ? `<h3>시험별 점수 추이</h3>
              <div id="chart-trend" class="chart-wrapper"></div>`
                  : ''
              }
              ${display.showPrintChartTables ? renderPrintChartTables(categoryStats, trendData) : ''}
              ${this.renderTeacherCommentSection(selectedResult, display)}
            </div>
          </section>`
            : ''
        }`
          : student
            ? `<div class="card">${renderEmptyState('저장된 결과가 없습니다. 답안 입력 후 저장 및 채점을 진행해주세요.', {
                actionLabel: '답안 입력',
                actionNav: 'answer-entry',
              })}</div>`
            : `<div class="card">${renderEmptyState('반과 학생을 선택해주세요. 학생이 없다면 반·학생 메뉴에서 먼저 등록하세요.', {
                actionLabel: '반·학생으로 이동',
                actionNav: 'classes',
              })}</div>`
      }`;

    if (student && selectedResult && graded) {
      requestAnimationFrame(() => {
        if (display.showExamMajorChart) {
          renderMajorCategoryChart(document.getElementById('chart-major'), categoryStats, 'major');
        }
        if (display.showTrendChart) {
          renderTrendChart(document.getElementById('chart-trend'), trendData, 'trend');
        }
        if (display.showAllExamsMajorChart && allExamsStats?.examCount) {
          renderMajorCategoryChart(
            document.getElementById('chart-major-all'),
            allExamsStats.categoryStats,
            'major-all'
          );
        }
      });
    }

    if (this.app.state.srDisplayModalOpen) {
      requestAnimationFrame(() => this.app.syncSrDisplayModal());
    }
  }

  renderExamOverview(main, data) {
    const mode = this.app.state.examOverviewMode || 'single';
    const gradeOptions = { ignoreCase: data.settings?.ignoreCase !== false };
    const questionsByExam = {};
    data.exams.forEach((e) => {
      questionsByExam[e.id] = this.app.repository.getQuestionsByExam(e.id);
    });
    const allResults = data.results;
    const allOverview = data.exams.length
      ? computeAllExamsOverview(data.exams, data.students, allResults, questionsByExam, gradeOptions)
      : null;

    const overviewFilters = this.app.state.examOverviewFilters;
    const filteredExams = filterExams(data.exams, {
      classes: data.classes,
      ...overviewFilters,
    });
    const validOverviewId = ensureValidExamSelection(this.app.state.examOverviewId, filteredExams);
    if (validOverviewId !== this.app.state.examOverviewId) {
      this.app.state.examOverviewId = validOverviewId;
      this.app.saveUiPrefs();
    }
    const examId = this.app.state.examOverviewId || '';
    const exam = examId ? data.exams.find((e) => e.id === examId) : null;
    const cls = exam ? data.classes.find((c) => c.id === exam.classId) : null;
    const students = exam ? data.students.filter((s) => s.classId === exam.classId) : [];
    const questions = exam ? questionsByExam[exam.id] : [];
    const results = exam ? this.app.repository.getResults({ examId: exam.id }) : [];
    const overview = exam && questions.length
      ? computeExamOverview(results, students, questions, gradeOptions)
      : null;

    main.innerHTML = `
      ${renderPageGuidePanel('exam-overview')}
      <section class="card no-print">
        <div class="card-header">
          <h2>시험 전체 결과</h2>
          <button type="button" class="btn btn-secondary btn-sm" data-action="print-exam-overview">인쇄</button>
        </div>
        <div class="card-body">
          <div class="answer-mode-tabs">
            <button type="button" class="answer-mode-tab${mode === 'single' ? ' answer-mode-tab--active' : ''}" data-action="exam-overview-mode-single">개별 시험</button>
            <button type="button" class="answer-mode-tab${mode === 'all' ? ' answer-mode-tab--active' : ''}" data-action="exam-overview-mode-all">전체 시험 통합</button>
          </div>
          ${
            mode === 'single'
              ? `
          ${this.renderExamFiltersBar(overviewFilters, data.classes, data.exams, {
            showSearch: false,
            showExamType: false,
            classFilterKey: 'overview-filter-classId',
            levelFilterKey: 'overview-filter-level',
          })}
          <label class="form-label">시험 선택
            <select data-filter="overview-examId">
              <option value="">선택</option>
              ${filteredExams.length
                ? filteredExams
                  .map((e) => `<option value="${e.id}" ${e.id === examId ? 'selected' : ''}>${escapeHtml(formatExamOptionLabel(e))}</option>`)
                  .join('')
                : '<option value="" disabled>조건에 맞는 시험 없음</option>'}
            </select>
          </label>
          ${exam ? `<button class="btn btn-secondary" data-action="export-csv" data-exam-id="${exam.id}">CSV보내기</button>` : ''}`
              : '<p class="hint-text">등록된 모든 시험의 결과를 통합해 보여줍니다.</p>'
          }
        </div>
      </section>

      ${
        mode === 'all' && allOverview && allOverview.resultCount > 0
          ? `
        <section class="card exam-overview-print">
          <div class="print-header">
            <h2>전체 시험 통합 결과</h2>
            <p>${APP_NAME} · ${allOverview.examCount}개 시험 · ${allOverview.resultCount}건 결과</p>
          </div>
          <div class="card-body">
            <div class="stats-grid stats-grid--6">
              ${this.statCard('시험 수', allOverview.examCount)}
              ${this.statCard('결과 수', allOverview.resultCount)}
              ${this.statCard('전체 평균', allOverview.overallAvg != null ? formatPercent(allOverview.overallAvg) : '—')}
              ${this.statCard('전체 정답', `${allOverview.totalCorrect}/${allOverview.totalQuestions}`)}
              ${this.statCard('전체 총점', `${allOverview.totalEarned}/${allOverview.totalPoints}`)}
              ${this.statCard('전체 정답률', allOverview.totalPoints ? formatPercent(allOverview.totalEarned / allOverview.totalPoints) : '—')}
            </div>

            <h3>시험별 요약</h3>
            <div class="table-scroll">
              <table class="data-table data-table--results">
                <thead><tr><th>시험</th><th>반</th><th>날짜</th><th>응시</th><th>반 평균</th></tr></thead>
                <tbody>
                  ${allOverview.perExam
                    .map(({ exam: ex, resultCount, overview: ov }) => {
                      const c = data.classes.find((x) => x.id === ex.classId);
                      return `<tr>
                        <td>${escapeHtml(ex.title)}</td>
                        <td>${escapeHtml(c?.name || '—')}</td>
                        <td>${formatDate(ex.date)}</td>
                        <td>${resultCount}</td>
                        <td>${ov?.classAverage != null ? formatPercent(ov.classAverage) : '—'}</td>
                      </tr>`;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>

            <h3>대분류별 통합 평균</h3>
            ${this.renderMajorCategoryList(allOverview.majorAvgs)}

            <h3>중분류별 통합 평균</h3>
            ${this.renderMiddleCategoryList(allOverview.middleAvgs)}

            <h3>대분류별 그래프 (전체 시험)</h3>
            <div id="chart-overview-all" class="chart-wrapper"></div>
          </div>
        </section>`
          : mode === 'all'
            ? `<div class="card">${renderEmptyState('통합할 시험 결과가 없습니다. 답안 입력 후 저장 및 채점을 진행해주세요.', {
                actionLabel: '답안 입력',
                actionNav: 'answer-entry',
              })}</div>`
            : exam && overview
              ? `
        <section class="card exam-overview-print">
          <div class="print-header">
            <h2>${escapeHtml(exam.title)}</h2>
            <p>${APP_NAME} · ${escapeHtml(cls?.name || '')} · ${formatDate(exam.date)}</p>
          </div>
          <div class="card-header">
            <h2>${escapeHtml(exam.title)}</h2>
            <span class="badge">${escapeHtml(cls?.name || '')} · ${formatDate(exam.date)}</span>
          </div>
          <div class="card-body">
            <div class="stats-grid stats-grid--6">
              ${this.statCard('응시', overview.submittedCount)}
              ${this.statCard('미응시', overview.notSubmitted.length)}
              ${this.statCard('반 평균', overview.classAverage != null ? formatPercent(overview.classAverage) : '—')}
              ${this.statCard('최고', overview.highest != null ? formatPercent(overview.highest) : '—')}
              ${this.statCard('최저', overview.lowest != null ? formatPercent(overview.lowest) : '—')}
            </div>

            ${
              overview.notSubmitted.length
                ? `<p class="warning-text">미응시: ${overview.notSubmitted.map((s) => escapeHtml(s.name)).join(', ')}</p>`
                : ''
            }

            <h3>학생별 점수</h3>
            <div class="table-scroll">
              <table class="data-table data-table--results">
                <thead><tr><th>학생</th><th>총점</th><th>정답 수</th><th>정답률</th></tr></thead>
                <tbody>
                  ${overview.studentScores
                    .map((s) => {
                      const st = students.find((x) => x.id === s.studentId);
                      return `<tr>
                        <td>${escapeHtml(st?.name || '—')}</td>
                        <td>${s.earnedPoints}/${s.totalPoints}</td>
                        <td>${s.correctCount}</td>
                        <td>${formatPercent(s.percentage)}</td>
                      </tr>`;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>

            <h3>문항별 정답률</h3>
            <div class="table-scroll">
              <table class="data-table data-table--results">
                <thead><tr><th>#</th><th>대분류</th><th>중분류</th><th>정답률</th></tr></thead>
                <tbody>
                  ${overview.questionStats
                    .map((q) => `<tr>
                      <td>${q.number}</td>
                      <td>${escapeHtml(q.majorCategory) || '—'}</td>
                      <td>${q.middleCategory ? escapeHtml(q.middleCategory) : '미분류'}</td>
                      <td>${q.rate != null ? formatQuestionRateDisplay(q) : '데이터 없음'}</td>
                    </tr>`)
                    .join('')}
                </tbody>
              </table>
            </div>

            <h3>대분류별 반 평균</h3>
            ${this.renderMajorCategoryList(overview.majorAvgs)}

            <h3>중분류별 반 평균</h3>
            ${this.renderMiddleCategoryList(overview.middleAvgs)}
          </div>
        </section>`
              : `<div class="card">${renderEmptyState(
                  !examId && filteredExams.length
                    ? '시험을 선택해주세요.'
                    : !filteredExams.length && data.exams.length
                      ? '조건에 맞는 시험이 없습니다. 반·레벨 필터를 조정해주세요.'
                      : data.exams.length
                        ? '선택한 시험에 저장된 결과가 없습니다. 답안 입력 후 저장 및 채점을 진행해주세요.'
                        : '등록된 시험이 없습니다. 시험 설정에서 문항과 정답을 먼저 입력해주세요.',
                  {
                    actionLabel: data.exams.length ? '답안 입력' : '시험 설정',
                    actionNav: data.exams.length ? 'answer-entry' : 'exams',
                  }
                )}</div>`
      }`;

    if (mode === 'all' && allOverview?.resultCount) {
      requestAnimationFrame(() => {
        renderMajorCategoryChart(
          document.getElementById('chart-overview-all'),
          { major: allOverview.majorAvgs, middle: allOverview.middleAvgs },
          'overview-all'
        );
      });
    }
  }

  renderBackup(main, data) {
    const recovery = this.app.repository.isStorageRecoveryRequired?.();
    main.innerHTML = `
      ${renderPageGuidePanel('backup')}
      ${renderFieldHint('json-backup')}
      ${
        recovery
          ? `<section class="storage-recovery-banner" role="alert">
              <p>${escapeHtml(SAT.STORAGE_RECOVERY_MESSAGE).replace(/\n/g, '<br>')}</p>
              <div class="btn-group">
                <button type="button" class="btn btn-secondary btn-sm" data-action="download-corrupt-json">손상 원본 JSON 다운로드</button>
                <label class="btn btn-primary btn-sm">
                  JSON 백업 가져오기
                  <input type="file" accept=".json,application/json" class="hidden" data-action="recovery-import-json-input">
                </label>
                <button type="button" class="btn btn-danger btn-sm" data-action="recovery-start-fresh">빈 데이터로 새로 시작</button>
              </div>
            </section>`
          : ''
      }
      <section class="card">
        <div class="card-header"><h2>데이터 백업 및 복원</h2></div>
        <div class="card-body">
          <p class="privacy-notice">복원 전에 현재 데이터를 JSON으로 백업해두는 것을 권장합니다.</p>
          <p>마지막 백업: <strong>${data.settings.lastBackupAt ? formatDate(data.settings.lastBackupAt) : '없음'}</strong></p>
          ${daysSince(data.settings.lastBackupAt) >= 7 ? '<p class="warning-text">최근 백업이 7일 이상 경과했습니다.</p>' : ''}

          <div class="btn-group">
            <button class="btn btn-primary" data-action="export-json">JSON 전체 백업</button>
            <label class="btn btn-secondary">
              JSON 가져오기
              <input type="file" accept=".json,application/json" class="hidden" data-action="import-json-input">
            </label>
            <button class="btn btn-danger" data-action="reset-all">전체 데이터 초기화</button>
          </div>

          <div class="card card--nested">
            <h3>현재 데이터 요약</h3>
            <ul class="simple-list">
              <li>반: ${data.classes.length}개</li>
              <li>학생: ${data.students.length}명</li>
              <li>시험: ${data.exams.length}개</li>
              <li>문항: ${data.questions.length}개</li>
              <li>결과: ${data.results.length}건</li>
            </ul>
          </div>
        </div>
      </section>`;
  }
}

function normalizeOpt(v) {
  return String(v).trim().toUpperCase();
}

function getCurrentAnswer(answers, questions, num) {
  const q = questions.find((x) => x.number === num);
  if (!q) return '';
  return answers[q.id] ?? answers[String(q.number)] ?? '';
}

  SAT.Renderer = Renderer;
})(window.SAT = window.SAT || {});
