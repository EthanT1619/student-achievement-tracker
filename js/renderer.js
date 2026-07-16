(function (SAT) {
  const {
    APP_NAME,
    escapeHtml, formatDate, formatPercent, formatRatio, daysSince,
    getMajorRate, getStudentExamTrend, computeExamOverview, getClassAverageForExam,
    detectAnswerMode, renderMajorCategoryChart, renderTrendChart, renderPrintChartTables,
    destroyAllCharts, getWrongQuestionNumbers, recomputeResultStats,
    collectMajorSuggestions, collectMiddleSuggestions,
    getMiddleDisplayName, getMiddleStatText, formatQuestionRateDisplay,
    collectExamTypeSuggestions,
  } = SAT;

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
    this.updateNavActive(view);
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
              : '<div class="empty-state"><p>등록된 시험이 없습니다.</p><button class="btn btn-primary" data-nav="exams">시험 만들기</button></div>'
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

  renderClasses(main, data) {
    const selectedClassId = this.app.state.selectedClassId || data.classes[0]?.id || '';
    const selectedClass = data.classes.find((c) => c.id === selectedClassId);
    const classStudents = data.students.filter((s) => s.classId === selectedClassId);

    main.innerHTML = `
      <section class="card">
        <div class="card-header"><h2>반 관리</h2></div>
        <div class="card-body">
          <form class="inline-form" data-form="add-class">
            <div class="form-row">
              <label class="form-label">반 이름<input type="text" name="name" required></label>
              <label class="form-label">레벨<input type="text" name="level"></label>
              <button type="submit" class="btn btn-primary">반 추가</button>
            </div>
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
                    : '<tr><td colspan="4"><div class="empty-state"><p>등록된 반이 없습니다.</p></div></td></tr>'
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
                      : '<tr><td colspan="4"><div class="empty-state"><p>이 반에 등록된 학생이 없습니다.</p></div></td></tr>'
                  }
                </tbody>
              </table>
            </div>`
              : '<div class="empty-state"><p>먼저 반을 등록하고 선택해주세요.</p></div>'
          }
        </div>
      </section>`;
  }

  renderExams(main, data) {
    const editingId = this.app.state.editingExamId;
    const editingExam = editingId ? data.exams.find((e) => e.id === editingId) : null;
    const questions = editingId ? this.app.repository.getQuestionsByExam(editingId) : [];
    const examTypeSuggestions = collectExamTypeSuggestions(data.exams);

    main.innerHTML = `
      <section class="card no-print">
        <div class="card-header"><h2>${editingExam ? '시험 수정' : '시험 생성'}</h2></div>
        <div class="card-body">
          <form data-form="exam-setup">
            ${editingId ? `<input type="hidden" name="examId" value="${editingId}">` : ''}
            <div class="form-grid">
              <label class="form-label">시험명<input type="text" name="title" required value="${escapeHtml(editingExam?.title || '')}"></label>
              <label class="form-label">반
                <select name="classId" required>
                  <option value="">선택</option>
                  ${data.classes.map((c) => `<option value="${c.id}" ${editingExam?.classId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </label>
              <label class="form-label">시험일<input type="date" name="date" required value="${editingExam?.date || new Date().toISOString().slice(0, 10)}"></label>
              <label class="form-label">시험 유형
                <input type="text" name="examType" list="exam-type-list" value="${escapeHtml(editingExam?.examType || '')}" autocomplete="off">
                <datalist id="exam-type-list">${examTypeSuggestions.map((t) => `<option value="${escapeHtml(t)}">`).join('')}</datalist>
              </label>
              <label class="form-label">문항 수<input type="number" name="questionCount" min="1" max="100" required value="${editingExam?.questionCount || 10}"></label>
            </div>
            <div id="questions-container" class="questions-container">
              ${this.renderQuestionRows(questions, editingExam?.questionCount || 10, data.questions)}
            </div>
            <div class="btn-group">
              <button type="submit" class="btn btn-primary">${editingExam ? '시험 저장' : '시험 생성'}</button>
              ${editingExam ? '<button type="button" class="btn btn-secondary" data-action="cancel-edit-exam">취소</button>' : ''}
            </div>
          </form>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2>등록된 시험</h2></div>
        <div class="card-body">
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>시험명</th><th>반</th><th>날짜</th><th>문항</th><th>작업</th></tr></thead>
              <tbody>
                ${
                  data.exams.length
                    ? data.exams
                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                        .map((e) => {
                          const cls = data.classes.find((c) => c.id === e.classId);
                          const resultCount = data.results.filter((r) => r.examId === e.id).length;
                          return `<tr>
                            <td>${escapeHtml(e.title)}</td>
                            <td>${escapeHtml(cls?.name || '—')}</td>
                            <td>${formatDate(e.date)}</td>
                            <td>${e.questionCount}</td>
                            <td class="actions-cell">
                              <button class="btn btn-secondary btn-sm" data-action="edit-exam" data-id="${e.id}">수정</button>
                              <button class="btn btn-secondary btn-sm" data-action="duplicate-exam" data-id="${e.id}">복제</button>
                              <button class="btn btn-secondary btn-sm" data-nav="exam-overview" data-exam-id="${e.id}">결과</button>
                              <button class="btn btn-danger btn-sm" data-action="delete-exam" data-id="${e.id}" data-results="${resultCount}">삭제</button>
                            </td>
                          </tr>`;
                        })
                        .join('')
                    : '<tr><td colspan="5"><div class="empty-state"><p>등록된 시험이 없습니다.</p></div></td></tr>'
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
          <label class="form-label">
            <span class="form-label__title">대분류<span class="required-mark" aria-hidden="true">*</span></span>
            <input type="text" name="q_${i}_major" list="major-list-${i}" value="${escapeHtml(q.majorCategory || '')}" placeholder="직접 입력" data-question-major="${i}" required autocomplete="off">
            <datalist id="major-list-${i}">${majorSuggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('')}</datalist>
          </label>
          <label class="form-label">중분류
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
    const exams = classId ? data.exams.filter((e) => e.classId === classId) : [];
    const students = classId ? data.students.filter((s) => s.classId === classId && s.active !== false) : [];
    const exam = examId ? data.exams.find((e) => e.id === examId) : null;
    const questions = examId ? this.app.repository.getQuestionsByExam(examId) : [];
    const existing = examId && studentId ? this.app.repository.getResultByExamStudent(examId, studentId) : null;
    const answers = { ...(this.app.state.currentAnswers || existing?.answers || {}) };
    const currentQ = this.app.state.currentQuestion || 1;
    const answerMode = questions.length ? detectAnswerMode(questions) : 'numeric';
    const options = answerMode === 'alpha' ? ['A', 'B', 'C', 'D', 'E'] : ['1', '2', '3', '4', '5'];

    main.innerHTML = `
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
                ${exams.map((e) => `<option value="${e.id}" ${examId === e.id ? 'selected' : ''}>${escapeHtml(e.title)}</option>`).join('')}
              </select>
            </label>
            <label class="form-label">학생
              <select data-filter="studentId" ${!examId ? 'disabled' : ''}>
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
        <section class="card">
          <div class="card-header">
            <h2>${escapeHtml(exam.title)} — ${escapeHtml(students.find((s) => s.id === studentId)?.name || '')}</h2>
            ${existing ? '<span class="badge badge--info">기존 결과 불러옴</span>' : ''}
          </div>
          <div class="card-body">
            <div class="question-nav">
              ${questions
                .map((q) => {
                  const ans = answers[q.id] ?? answers[String(q.number)] ?? '';
                  const missing = !String(ans).trim();
                  const active = q.number === currentQ ? ' question-pill--active' : '';
                  const missClass = missing ? ' question-pill--missing' : '';
                  return `<button type="button" class="question-pill${active}${missClass}" data-goto="${q.number}">${q.number}</button>`;
                })
                .join('')}
            </div>

            <div class="answer-panel" data-current="${currentQ}">
              <h3>문항 ${currentQ}</h3>
              <div class="answer-options">
                ${options
                  .map((opt) => {
                    const q = questions.find((x) => x.number === currentQ);
                    const currentAns = q ? (answers[q.id] ?? answers[String(q.number)] ?? '') : '';
                    const selected = normalizeOpt(currentAns) === normalizeOpt(opt) ? ' answer-btn--selected' : '';
                    return `<button type="button" class="answer-btn${selected}" data-answer="${opt}">${opt}</button>`;
                  })
                  .join('')}
              </div>
              <label class="form-label">직접 입력
                <input type="text" class="answer-text-input" value="${escapeHtml(getCurrentAnswer(answers, questions, currentQ))}" placeholder="답안 직접 입력">
              </label>
              <p class="hint-text">숫자키 1~5로 선택 · 선택 후 다음 문항으로 이동 · Tab/방향키로 문항 이동</p>
            </div>

            <div class="btn-group no-print">
              <button class="btn btn-secondary" data-action="prev-question" ${currentQ <= 1 ? 'disabled' : ''}>이전</button>
              <button class="btn btn-secondary" data-action="next-question" ${currentQ >= questions.length ? 'disabled' : ''}>다음</button>
              <button class="btn btn-primary" data-action="save-answers">저장 및 채점</button>
            </div>
          </div>
        </section>`
          : '<div class="empty-state card"><p>반, 시험, 학생을 선택해주세요.</p></div>'
      }`;
  }

  renderStudentResults(main, data) {
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

    main.innerHTML = `
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
        <div class="print-header">
          <h2>${escapeHtml(student.name)}${student.englishName ? ` (${escapeHtml(student.englishName)})` : ''}</h2>
          <p>${APP_NAME} · 상담용 결과</p>
        </div>

        <section class="card">
          <div class="card-header">
            <h2>시험 선택</h2>
            <button class="btn btn-secondary btn-sm no-print" data-action="print-results">인쇄</button>
          </div>
          <div class="card-body no-print">
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
          <section class="card result-detail">
            <div class="card-header">
              <h2>${escapeHtml(selectedExam.title)}</h2>
              <span class="badge">${formatDate(selectedExam.date)}</span>
            </div>
            <div class="card-body">
              <div class="result-summary">
                <div class="result-metric"><span class="result-metric__value">${displayMetrics.earnedPoints}/${displayMetrics.totalPoints}</span><span class="result-metric__label">총점</span></div>
                <div class="result-metric"><span class="result-metric__value">${displayMetrics.correctCount}/${questions.length}</span><span class="result-metric__label">정답 수</span></div>
                <div class="result-metric"><span class="result-metric__value">${formatPercent(displayMetrics.percentage)}</span><span class="result-metric__label">정답률</span></div>
                <div class="result-metric"><span class="result-metric__value">${classAvg != null ? formatPercent(classAvg) : '데이터 없음'}</span><span class="result-metric__label">반 평균</span></div>
              </div>

              <h3>대분류별 정답률</h3>
              <ul class="category-list">
                ${Object.entries(categoryStats.major || {})
                  .filter(([, b]) => b.total > 0)
                  .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
                  .map(([cat, bucket]) => `<li><strong>${escapeHtml(cat)}</strong>: ${formatRatio(bucket.correct, bucket.total)}</li>`)
                  .join('') || '<li>데이터 없음</li>'}
              </ul>

              <h3>중분류별 정답률</h3>
              <ul class="category-list">
                ${Object.entries(categoryStats.middle || {})
                  .filter(([, b]) => b.total > 0)
                  .sort((a, b) => getMiddleStatText(a[1]).localeCompare(getMiddleStatText(b[1]), 'ko'))
                  .map(([, b]) => `<li><strong>${escapeHtml(b.major)}</strong> · ${escapeHtml(getMiddleDisplayName(b.middle))}: ${formatRatio(b.correct, b.total)}</li>`)
                  .join('') || '<li>데이터 없음</li>'}
              </ul>

              <h3>틀린 문항</h3>
              <p>${wrongNums.length ? wrongNums.join(', ') : '없음'}</p>

              <h3>대분류별 그래프</h3>
              <div id="chart-major" class="chart-wrapper"></div>

              <h3>시험별 점수 추이</h3>
              <div id="chart-trend" class="chart-wrapper"></div>
              ${renderPrintChartTables(categoryStats, trendData)}
            </div>
          </section>`
            : ''
        }`
          : student
            ? '<div class="empty-state card"><p>이 학생의 시험 결과가 없습니다.</p><button class="btn btn-primary no-print" data-nav="answer-entry">답안 입력</button></div>'
            : '<div class="empty-state card"><p>반과 학생을 선택해주세요.</p></div>'
      }`;

    if (student && selectedResult && graded) {
      requestAnimationFrame(() => {
        renderMajorCategoryChart(document.getElementById('chart-major'), categoryStats, 'major');
        renderTrendChart(document.getElementById('chart-trend'), trendData, 'trend');
      });
    }
  }

  renderExamOverview(main, data) {
    const examId = this.app.state.examOverviewId || data.exams[0]?.id;
    const exam = examId ? data.exams.find((e) => e.id === examId) : null;
    const cls = exam ? data.classes.find((c) => c.id === exam.classId) : null;
    const students = exam ? data.students.filter((s) => s.classId === exam.classId) : [];
    const questions = exam ? this.app.repository.getQuestionsByExam(exam.id) : [];
    const results = exam ? this.app.repository.getResults({ examId: exam.id }) : [];
    const overview = exam ? computeExamOverview(results, students, questions, { ignoreCase: data.settings?.ignoreCase !== false }) : null;

    main.innerHTML = `
      <section class="card no-print">
        <div class="card-header"><h2>시험 전체 결과</h2></div>
        <div class="card-body">
          <label class="form-label">시험 선택
            <select data-filter="overview-examId">
              ${data.exams.length ? data.exams
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map((e) => `<option value="${e.id}" ${e.id === examId ? 'selected' : ''}>${escapeHtml(e.title)} (${formatDate(e.date)})</option>`)
                .join('') : '<option value="">시험 없음</option>'}
            </select>
          </label>
          ${exam ? `<button class="btn btn-secondary" data-action="export-csv" data-exam-id="${exam.id}">CSV보내기</button>` : ''}
        </div>
      </section>

      ${
        exam && overview
          ? `
        <section class="card">
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
            <ul class="category-list">
              ${Object.entries(overview.majorAvgs)
                .filter(([, b]) => b.total > 0)
                .map(([cat, b]) => `<li><strong>${escapeHtml(cat)}</strong>: ${formatRatio(b.correct, b.total)}</li>`)
                .join('') || '<li>데이터 없음</li>'}
            </ul>

            <h3>중분류별 반 평균</h3>
            <ul class="category-list">
              ${Object.entries(overview.middleAvgs)
                .filter(([, b]) => b.total > 0)
                .sort((a, b) => getMiddleStatText(a[1]).localeCompare(getMiddleStatText(b[1]), 'ko'))
                .map(([, b]) => `<li><strong>${escapeHtml(b.major)}</strong> · ${escapeHtml(getMiddleDisplayName(b.middle))}: ${formatRatio(b.correct, b.total)}</li>`)
                .join('') || '<li>데이터 없음</li>'}
            </ul>
          </div>
        </section>`
          : '<div class="empty-state card"><p>시험을 선택하거나 먼저 시험을 등록해주세요.</p></div>'
      }`;
  }

  renderBackup(main, data) {
    main.innerHTML = `
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
