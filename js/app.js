(function (SAT) {
  const {
    APP_NAME,
    createRepository, Renderer, ImportExportManager,
    buildResultRecord, confirmDialog, choiceDialog, showToast, generateId,
    normalizeCategory, collectMiddleSuggestions,
    detectAnswerMode, keyToAnswerOption,
    parseBulkAnswerInput, validateBulkAnswers, tokensToAnswersMap,
    renderBulkValidationHtml,
    setPageGuideOpen, isPageGuideOpen, setChecklistOpen,
    renderHelpModalShell,
  } = SAT;

  class StudentAchievementApp {
  constructor() {
    this.repository = createRepository();
    this.importExport = new ImportExportManager(this.repository);
    this.renderer = new Renderer(this);
    this.state = {
      currentView: 'dashboard',
      selectedClassId: null,
      editingExamId: null,
      answerEntry: { classId: '', examId: '', studentId: '' },
      answerEntryMode: 'fast',
      bulkInputDraft: '',
      answerIssueQuestions: [],
      currentAnswers: null,
      currentQuestion: 1,
      studentResults: { classId: '', studentId: '' },
      selectedResultId: null,
      examOverviewId: null,
    };
  }

  init() {
    const data = this.repository.loadAll();
    if (data.classes.length) this.state.selectedClassId = data.classes[0].id;
    this.bindEvents();
    this.navigate('dashboard');
  }

  navigate(view, extras = {}) {
    this.state.currentView = view;
    if (extras.classId) this.state.selectedClassId = extras.classId;
    if (extras.examId) this.state.examOverviewId = extras.examId;
    if (extras.editingExamId !== undefined) {
      this.state.editingExamId = extras.editingExamId;
    } else if (view === 'exams') {
      this.state.editingExamId = null;
    }
    this.renderer.render(view);
  }

  bindEvents() {
    document.addEventListener('click', (e) => this.handleClick(e));
    document.addEventListener('change', (e) => this.handleChange(e));
    document.addEventListener('submit', (e) => this.handleSubmit(e));
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  handleClick(e) {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      e.preventDefault();
      const view = nav.dataset.nav;
      const extras = {};
      if (nav.dataset.examId) extras.examId = nav.dataset.examId;
      this.navigate(view, extras);
      return;
    }

    const gotoTarget = e.target.closest('[data-goto]');
    if (gotoTarget?.closest('#answer-entry-card')) {
      e.preventDefault();
      this.goToQuestion(Number(gotoTarget.dataset.goto));
      return;
    }

    const action = e.target.closest('[data-action]');
    if (!action) return;

    const act = action.dataset.action;
    const handlers = {
      'export-json': () => this.exportJson(),
      'export-csv': () => this.exportCsv(action.dataset.examId),
      'reset-all': () => this.resetAll(),
      'select-class': () => this.selectClass(action.dataset.id),
      'edit-class': () => this.editClass(action.dataset.id),
      'delete-class': () => this.deleteClass(action.dataset.id),
      'edit-student': () => this.editStudent(action.dataset.id),
      'archive-student': () => this.archiveStudent(action.dataset.id),
      'activate-student': () => this.activateStudent(action.dataset.id),
      'delete-student': () => this.deleteStudent(action.dataset.id),
      'edit-exam': () => this.navigate('exams', { editingExamId: action.dataset.id }),
      'cancel-edit-exam': () => {
        this.state.editingExamId = null;
        this.navigate('exams');
      },
      'duplicate-exam': () => this.duplicateExam(action.dataset.id),
      'delete-exam': () => this.deleteExam(action.dataset.id, Number(action.dataset.results)),
      'prev-question': () => this.moveQuestion(-1),
      'next-question': () => this.moveQuestion(1),
      'save-answers': () => this.saveAnswers(),
      'save-and-next-student': () => this.saveAnswers({ andNextStudent: true }),
      'answer-mode-fast': () => this.setAnswerEntryMode('fast'),
      'answer-mode-bulk': () => this.setAnswerEntryMode('bulk'),
      'apply-bulk': () => this.applyBulkAnswers(),
      'select-result': () => {
        this.state.selectedResultId = action.dataset.id;
        this.renderer.render('student-results');
      },
      'print-results': () => SAT.printStudentResults(),
      'copy-prev-categories': () => this.copyPrevCategories(Number(action.dataset.num)),
      'toggle-page-guide': () => this.togglePageGuide(action.dataset.guideView),
      'toggle-checklist': () => this.toggleChecklist(),
      'open-help': () => this.openHelp(action.dataset.helpSection),
      'close-help': () => this.closeHelp(),
    };

    if (act === 'help-scroll') {
      e.preventDefault();
      const el = document.getElementById(`help-${action.dataset.helpId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el?.focus({ preventScroll: true });
      return;
    }

    if (act === 'goto') {
      this.goToQuestion(Number(action.dataset.goto));
      return;
    }

    if (action.classList.contains('answer-btn')) {
      this.setAnswer(action.dataset.answer, true);
      return;
    }

    if (handlers[act]) handlers[act]();
  }

  handleChange(e) {
    const filter = e.target.dataset.filter;
    if (!filter) {
      if (e.target.matches('[data-question-major]')) {
        this.refreshMiddleDatalist(e.target);
      }
      if (e.target.name === 'questionCount') {
        this.handleQuestionCountChange(e.target);
      }
      return;
    }

    const filters = {
      classId: () => {
        this.state.answerEntry.classId = e.target.value;
        this.state.answerEntry.examId = '';
        this.state.answerEntry.studentId = '';
        this.state.currentAnswers = null;
        this.state.bulkInputDraft = '';
        this.state.answerIssueQuestions = [];
        this.renderer.render('answer-entry');
      },
      examId: () => {
        this.state.answerEntry.examId = e.target.value;
        this.state.answerEntry.studentId = '';
        this.state.currentAnswers = null;
        this.state.currentQuestion = 1;
        this.state.bulkInputDraft = '';
        this.state.answerIssueQuestions = [];
        this.renderer.render('answer-entry');
      },
      studentId: () => {
        this.state.answerEntry.studentId = e.target.value;
        this.state.currentAnswers = null;
        this.state.currentQuestion = 1;
        this.state.bulkInputDraft = '';
        this.state.answerIssueQuestions = [];
        this.renderer.render('answer-entry');
      },
      'sr-classId': () => {
        this.state.studentResults.classId = e.target.value;
        this.state.studentResults.studentId = '';
        this.state.selectedResultId = null;
        this.renderer.render('student-results');
      },
      'sr-studentId': () => {
        this.state.studentResults.studentId = e.target.value;
        const results = this.repository.getResults({ studentId: e.target.value });
        this.state.selectedResultId = results[results.length - 1]?.id || null;
        this.renderer.render('student-results');
      },
      'overview-examId': () => {
        this.state.examOverviewId = e.target.value;
        this.renderer.render('exam-overview');
      },
    };

    if (filters[filter]) filters[filter]();
  }

  handleSubmit(e) {
    e.preventDefault();
    const form = e.target;

    if (form.dataset.form === 'add-class') {
      const fd = new FormData(form);
      this.repository.saveClass({ name: fd.get('name'), level: fd.get('level') });
      showToast('반이 추가되었습니다.');
      form.reset();
      this.navigate('classes');
      return;
    }

    if (form.dataset.form === 'add-student') {
      const fd = new FormData(form);
      this.repository.saveStudent({
        classId: fd.get('classId'),
        name: fd.get('name'),
        englishName: fd.get('englishName'),
      });
      showToast('학생이 추가되었습니다.');
      form.reset();
      this.navigate('classes');
      return;
    }

    if (form.dataset.form === 'exam-setup') {
      this.saveExamSetup(form);
    }
  }

  handleKeydown(e) {
    if (e.key === 'Escape') {
      const helpModal = document.getElementById('help-modal');
      if (helpModal && !helpModal.classList.contains('hidden')) {
        this.closeHelp();
      }
    }
  }

  togglePageGuide(view) {
    if (!view) return;
    const open = !isPageGuideOpen(view);
    setPageGuideOpen(view, open);
    const panel = document.querySelector(`[data-page-guide="${view}"]`);
    if (!panel) return;
    const body = panel.querySelector('.page-guide__body');
    const btn = panel.querySelector('[data-action="toggle-page-guide"]');
    const icon = panel.querySelector('.page-guide__toggle-icon');
    if (body) body.classList.toggle('page-guide__body--collapsed', !open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (icon) icon.textContent = open ? '▼' : '▶';
  }

  toggleChecklist() {
    const data = this.repository.loadAll();
    const open = !isChecklistOpen(data);
    setChecklistOpen(open);
    const panel = document.querySelector('.onboard-checklist');
    if (!panel) return;
    const body = panel.querySelector('.onboard-checklist__body');
    const btn = panel.querySelector('[data-action="toggle-checklist"]');
    const icon = panel.querySelector('.page-guide__toggle-icon');
    if (body) body.classList.toggle('page-guide__body--collapsed', !open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (icon) icon.textContent = open ? '▼' : '▶';
  }

  openHelp(scrollToSection) {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('help-modal');
    const content = document.getElementById('help-modal-content');
    if (!overlay || !modal || !content) return;

    content.innerHTML = renderHelpModalShell();
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    if (this._helpOverlayHandler) {
      overlay.removeEventListener('click', this._helpOverlayHandler);
    }
    this._helpOverlayHandler = (ev) => {
      if (ev.target === overlay) this.closeHelp();
    };
    overlay.addEventListener('click', this._helpOverlayHandler);

    if (scrollToSection) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`help-${scrollToSection}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  closeHelp() {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('help-modal');
    if (overlay) overlay.classList.add('hidden');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    if (this._helpOverlayHandler && overlay) {
      overlay.removeEventListener('click', this._helpOverlayHandler);
      this._helpOverlayHandler = null;
    }
  }

  getAnswerEntryQuestions() {
    const { examId } = this.state.answerEntry;
    return examId ? this.repository.getQuestionsByExam(examId) : [];
  }

  getAnswerMode() {
    const questions = this.getAnswerEntryQuestions();
    return questions.length ? detectAnswerMode(questions) : 'numeric';
  }

  getAnswerEntryStudents() {
    const { classId } = this.state.answerEntry;
    return this.repository.getStudents({ classId, activeOnly: true });
  }

  hasNextAnswerStudent() {
    return !!this.getNextStudentId();
  }

  getNextStudentId() {
    const { studentId } = this.state.answerEntry;
    const students = this.getAnswerEntryStudents();
    const idx = students.findIndex((s) => s.id === studentId);
    if (idx < 0 || idx >= students.length - 1) return null;
    return students[idx + 1].id;
  }

  isAnswerShortcutBlocked(target) {
    if (!target) return true;
    if (target.matches('select')) return true;
    if (target.matches('#answer-text-input, #bulk-answer-input, select, textarea, input')) return true;
    const modal = document.getElementById('confirm-modal');
    if (modal && !modal.classList.contains('hidden')) return true;
    return false;
  }

  initAnswerEntryPanel() {
    const panel = document.getElementById('answer-capture-panel');
    if (!panel) return;

    if (this._answerPanelKeyHandler) {
      panel.removeEventListener('keydown', this._answerPanelKeyHandler);
    }
    this._answerPanelKeyHandler = (e) => this.handleAnswerPanelKeydown(e);
    panel.addEventListener('keydown', this._answerPanelKeyHandler);

    const textInput = document.getElementById('answer-text-input');
    if (textInput) {
      if (this._answerTextKeyHandler) {
        textInput.removeEventListener('keydown', this._answerTextKeyHandler);
      }
      this._answerTextKeyHandler = (e) => this.handleAnswerTextKeydown(e);
      textInput.addEventListener('keydown', this._answerTextKeyHandler);
    }

    if (this.state.answerEntryMode === 'fast') {
      requestAnimationFrame(() => this.focusAnswerPanel());
    }
  }

  focusAnswerPanel() {
    const panel = document.getElementById('answer-capture-panel');
    if (panel && this.state.answerEntryMode === 'fast') {
      panel.focus({ preventScroll: true });
    }
  }

  handleAnswerPanelKeydown(e) {
    if (this.state.currentView !== 'answer-entry' || this.state.answerEntryMode !== 'fast') return;
    if (this.isAnswerShortcutBlocked(e.target)) return;

    const questions = this.getAnswerEntryQuestions();
    if (!questions.length) return;
    const mode = this.getAnswerMode();

    if (e.key >= '1' && e.key <= '5' && mode !== 'text') {
      const opt = keyToAnswerOption(e.key, mode);
      if (opt) {
        e.preventDefault();
        this.setAnswer(opt, true);
      }
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.moveQuestion(1);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.moveQuestion(-1);
    }
  }

  handleAnswerTextKeydown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = e.target.value.trim();
    if (!value) return;
    const mode = this.getAnswerMode();
    if (mode === 'numeric' && !/^[1-5]$/.test(value) && !/^\d+$/.test(value)) {
      showToast('1~5 사이의 값을 입력해주세요.', 'error');
      this.focusQuestionIssues([this.state.currentQuestion]);
      return;
    }
    if (mode === 'alpha' && !/^[A-Ea-e]$/.test(value)) {
      showToast('A~E 사이의 값을 입력해주세요.', 'error');
      this.focusQuestionIssues([this.state.currentQuestion]);
      return;
    }
    const normalized = mode === 'alpha' ? value.toUpperCase() : (/^\d+$/.test(value) ? String(parseInt(value, 10)) : value);
    this.setAnswer(normalized, true);
  }

  setAnswerEntryMode(mode) {
    this.state.answerEntryMode = mode;
    const bulk = document.getElementById('bulk-answer-input');
    if (bulk) this.state.bulkInputDraft = bulk.value;
    const fastPanel = document.getElementById('answer-fast-panel');
    const bulkPanel = document.getElementById('answer-bulk-panel');
    document.querySelectorAll('.answer-mode-tab').forEach((tab) => {
      tab.classList.toggle('answer-mode-tab--active', tab.dataset.action === `answer-mode-${mode}`);
    });
    if (fastPanel) fastPanel.classList.toggle('hidden', mode !== 'fast');
    if (bulkPanel) bulkPanel.classList.toggle('hidden', mode !== 'bulk');
    if (mode === 'fast') this.focusAnswerPanel();
  }

  patchAnswerEntryUI() {
    const card = document.getElementById('answer-entry-card');
    if (!card) {
      this.renderer.render('answer-entry');
      return;
    }

    const questions = this.getAnswerEntryQuestions();
    const answers = this.getCurrentAnswers();
    const currentQ = this.state.currentQuestion;
    const mode = this.getAnswerMode();
    const options = mode === 'alpha' ? ['A', 'B', 'C', 'D', 'E'] : mode === 'numeric' ? ['1', '2', '3', '4', '5'] : [];

    const numEl = document.getElementById('answer-current-num');
    if (numEl) numEl.textContent = String(currentQ);

    const grid = document.getElementById('answer-grid');
    if (grid) {
      grid.innerHTML = this.renderer.renderAnswerGridHtml(
        questions,
        answers,
        currentQ,
        this.state.answerIssueQuestions || []
      );
    }

    const opts = document.getElementById('answer-options');
    if (opts) {
      opts.classList.toggle('hidden', mode === 'text');
      opts.innerHTML = this.renderer.renderAnswerOptionsHtml(questions, answers, currentQ, options);
    }

    const directWrap = document.getElementById('answer-direct-wrap');
    if (directWrap) {
      directWrap.classList.toggle('answer-direct-wrap--collapsed', mode !== 'text');
    }

    const textInput = document.getElementById('answer-text-input');
    if (textInput) {
      const q = questions.find((x) => x.number === currentQ);
      const val = q ? (answers[q.id] ?? answers[String(q.number)] ?? '') : '';
      textInput.value = val;
    }

    const prevBtn = document.getElementById('btn-prev-question');
    const nextBtn = document.getElementById('btn-next-question');
    if (prevBtn) prevBtn.disabled = currentQ <= 1;
    if (nextBtn) nextBtn.disabled = currentQ >= questions.length;

    const nextStudentBtn = document.getElementById('btn-save-next-student');
    if (nextStudentBtn) {
      nextStudentBtn.disabled = !this.hasNextAnswerStudent();
      nextStudentBtn.title = this.hasNextAnswerStudent() ? '' : '마지막 학생입니다.';
    }

    const panel = document.getElementById('answer-capture-panel');
    if (panel) panel.classList.add('answer-panel--pulse');
    requestAnimationFrame(() => {
      panel?.classList.remove('answer-panel--pulse');
    });
  }

  goToQuestion(num) {
    const questions = this.getAnswerEntryQuestions();
    if (num < 1 || num > questions.length) return;
    this.syncCurrentTextInput();
    if (this.state.answerEntryMode === 'bulk') {
      this.setAnswerEntryMode('fast');
    }
    this.state.currentQuestion = num;
    this.patchAnswerEntryUI();
    requestAnimationFrame(() => {
      document.querySelector(`.answer-grid-item[data-goto="${num}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      this.focusAnswerPanel();
    });
  }

  focusQuestionIssues(questionNumbers) {
    const nums = (questionNumbers || []).filter((n) => n >= 1);
    if (!nums.length) return;
    this.state.answerIssueQuestions = [...new Set(nums)];
    this.goToQuestion(nums[0]);
  }

  syncCurrentTextInput() {
    const textInput = document.getElementById('answer-text-input');
    if (!textInput || !textInput.value.trim()) return;
    const questions = this.getAnswerEntryQuestions();
    const q = questions.find((x) => x.number === this.state.currentQuestion);
    if (!q) return;
    const answers = this.getCurrentAnswers();
    answers[q.id] = textInput.value.trim();
    this.state.currentAnswers = answers;
  }

  async handleQuestionCountChange(input) {
    const form = input.closest('form');
    const newCount = Number(input.value);
    const oldCount = form.querySelectorAll('.question-row').length;
    if (newCount < oldCount) {
      const ok = await confirmDialog(
        `문항 수를 ${oldCount}에서 ${newCount}로 줄이면 초과 문항의 입력 내용이 삭제될 수 있습니다. 계속하시겠습니까?`,
        { title: '문항 수 변경', danger: true }
      );
      if (!ok) {
        input.value = oldCount;
        return;
      }
    }
    const container = document.getElementById('questions-container');
    if (!container) return;
    const existing = [];
    form.querySelectorAll('.question-row').forEach((row) => {
      const n = Number(row.dataset.number);
      existing.push({
        number: n,
        correctAnswer: form.querySelector(`[name="q_${n}_answer"]`)?.value,
        points: form.querySelector(`[name="q_${n}_points"]`)?.value,
        majorCategory: form.querySelector(`[name="q_${n}_major"]`)?.value,
        middleCategory: form.querySelector(`[name="q_${n}_middle"]`)?.value,
        note: form.querySelector(`[name="q_${n}_note"]`)?.value,
        id: form.querySelector(`[name="q_${n}_id"]`)?.value,
      });
    });
    const trimmed = existing.slice(0, newCount);
    while (trimmed.length < newCount) {
      trimmed.push({ number: trimmed.length + 1 });
    }
    container.innerHTML = this.renderer.renderQuestionRows(trimmed, newCount, this.repository.loadAll().questions);
  }

  refreshMiddleDatalist(majorInput) {
    const num = majorInput.dataset.questionMajor;
    const list = document.getElementById(`middle-list-${num}`);
    if (!list) return;
    const allQuestions = this.repository.loadAll().questions;
    const suggestions = collectMiddleSuggestions(allQuestions, majorInput.value);
    list.innerHTML = suggestions.map((m) => `<option value="${m.replace(/"/g, '&quot;')}">`).join('');
  }

  copyPrevCategories(num) {
    if (num <= 1) return;
    const form = document.querySelector('[data-form="exam-setup"]');
    if (!form) return;
    const prevMajor = form.querySelector(`[name="q_${num - 1}_major"]`);
    const prevMiddle = form.querySelector(`[name="q_${num - 1}_middle"]`);
    const majorInput = form.querySelector(`[name="q_${num}_major"]`);
    const middleInput = form.querySelector(`[name="q_${num}_middle"]`);
    if (majorInput && prevMajor) majorInput.value = prevMajor.value;
    if (middleInput && prevMiddle) middleInput.value = prevMiddle.value;
    if (majorInput) this.refreshMiddleDatalist(majorInput);
    showToast(`${num - 1}번 문항 분류를 복사했습니다.`);
  }

  selectClass(id) {
    this.state.selectedClassId = id;
    this.navigate('classes');
  }

  async editClass(id) {
    const cls = this.repository.getClass(id);
    if (!cls) return;
    const name = prompt('반 이름', cls.name);
    if (name === null) return;
    const level = prompt('레벨', cls.level);
    if (level === null) return;
    this.repository.saveClass({ ...cls, name, level });
    showToast('반이 수정되었습니다.');
    this.navigate('classes');
  }

  async deleteClass(id) {
    const cls = this.repository.getClass(id);
    if (!cls) return;
    const ok = await confirmDialog(
      `"${cls.name}" 반을 삭제하면 연결된 학생, 시험, 결과도 함께 삭제됩니다. 계속하시겠습니까?`,
      { title: '반 삭제', danger: true, confirmLabel: '삭제' }
    );
    if (!ok) return;
    this.repository.deleteClass(id);
    if (this.state.selectedClassId === id) this.state.selectedClassId = null;
    showToast('반이 삭제되었습니다.');
    this.navigate('classes');
  }

  async editStudent(id) {
    const student = this.repository.getStudent(id);
    if (!student) return;
    const name = prompt('학생 이름', student.name);
    if (name === null) return;
    const englishName = prompt('영어 이름', student.englishName);
    if (englishName === null) return;
    this.repository.saveStudent({ ...student, name, englishName });
    showToast('학생 정보가 수정되었습니다.');
    this.navigate('classes');
  }

  archiveStudent(id) {
    this.repository.archiveStudent(id);
    showToast('학생이 비활성화되었습니다.');
    this.navigate('classes');
  }

  activateStudent(id) {
    const student = this.repository.getStudent(id);
    if (student) {
      this.repository.saveStudent({ ...student, active: true });
      showToast('학생이 활성화되었습니다.');
    }
    this.navigate('classes');
  }

  async deleteStudent(id) {
    const student = this.repository.getStudent(id);
    if (!student) return;
    const hasResults = this.repository.getResults({ studentId: id }).length > 0;
    const msg = hasResults
      ? `"${student.name}" 학생에게 연결된 결과가 있습니다. 삭제 대신 비활성화를 권장합니다. 그래도 삭제하시겠습니까?`
      : `"${student.name}" 학생을 삭제하시겠습니까?`;
    const ok = await confirmDialog(msg, { title: '학생 삭제', danger: true, confirmLabel: '삭제' });
    if (!ok) return;
    this.repository.deleteStudent(id);
    showToast('학생이 삭제되었습니다.');
    this.navigate('classes');
  }

  saveExamSetup(form) {
    const fd = new FormData(form);
    const examId = fd.get('examId') || generateId();
    const questionCount = Number(fd.get('questionCount'));
    const questions = [];

    for (let i = 1; i <= questionCount; i++) {
      questions.push({
        id: fd.get(`q_${i}_id`) || undefined,
        number: i,
        correctAnswer: String(fd.get(`q_${i}_answer`) ?? '').trim(),
        points: fd.get(`q_${i}_points`),
        majorCategory: normalizeCategory(fd.get(`q_${i}_major`)),
        middleCategory: normalizeCategory(fd.get(`q_${i}_middle`)),
        note: String(fd.get(`q_${i}_note`) ?? '').trim(),
      });
    }

    const missingAnswer = questions.filter((q) => !q.correctAnswer).map((q) => q.number);
    const missingMajor = questions.filter((q) => !q.majorCategory).map((q) => q.number);

    if (missingAnswer.length) {
      showToast(`${missingAnswer.join(', ')}번 문항의 정답이 입력되지 않았습니다.`, 'error');
      return;
    }
    if (missingMajor.length) {
      showToast(`${missingMajor.join(', ')}번 문항의 대분류가 입력되지 않았습니다.`, 'error');
      return;
    }

    this.repository.saveExam({
      id: examId,
      classId: fd.get('classId'),
      title: fd.get('title'),
      examType: normalizeCategory(fd.get('examType')),
      date: fd.get('date'),
      questionCount,
    });
    this.repository.saveQuestions(examId, questions);
    this.state.editingExamId = null;
    showToast('시험이 저장되었습니다.');
    this.navigate('exams');
  }

  async duplicateExam(id) {
    const exam = this.repository.getExam(id);
    if (!exam) return;
    const title = prompt('새 시험명', `${exam.title} (복제)`);
    if (!title) return;
    const date = prompt('새 시험일 (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
    if (!date) return;

    const newId = generateId();
    this.repository.saveExam({
      ...exam,
      id: newId,
      title,
      date,
      createdAt: undefined,
    });
    const questions = this.repository.getQuestionsByExam(id).map((q) => ({
      ...q,
      id: generateId(),
      examId: newId,
    }));
    this.repository.saveQuestions(newId, questions);
    showToast('시험이 복제되었습니다.');
    this.navigate('exams');
  }

  async deleteExam(id, resultCount) {
    const exam = this.repository.getExam(id);
    if (!exam) return;
    const ok = await confirmDialog(
      `"${exam.title}" 시험을 삭제하면 연결된 문항 ${this.repository.getQuestionsByExam(id).length}개와 결과 ${resultCount}건이 함께 삭제됩니다. 계속하시겠습니까?`,
      { title: '시험 삭제', danger: true, confirmLabel: '삭제' }
    );
    if (!ok) return;
    this.repository.deleteExam(id);
    if (this.state.editingExamId === id) this.state.editingExamId = null;
    showToast('시험이 삭제되었습니다.');
    this.navigate('exams');
  }

  getCurrentAnswers() {
    if (this.state.currentAnswers) return { ...this.state.currentAnswers };
    const { examId, studentId } = this.state.answerEntry;
    const existing = this.repository.getResultByExamStudent(examId, studentId);
    return { ...(existing?.answers || {}) };
  }

  setAnswer(value, autoNext = true) {
    const questions = this.getAnswerEntryQuestions();
    const q = questions.find((x) => x.number === this.state.currentQuestion);
    if (!q) return;

    const answers = this.getCurrentAnswers();
    answers[q.id] = value;
    this.state.currentAnswers = answers;

    if (this.state.answerIssueQuestions?.length) {
      this.state.answerIssueQuestions = this.state.answerIssueQuestions.filter((n) => n !== q.number);
    }

    if (autoNext && this.state.currentQuestion < questions.length) {
      this.state.currentQuestion += 1;
    }
    this.patchAnswerEntryUI();
    this.focusAnswerPanel();
  }

  moveQuestion(delta) {
    this.syncCurrentTextInput();
    const questions = this.getAnswerEntryQuestions();
    const next = this.state.currentQuestion + delta;
    if (next < 1 || next > questions.length) return;
    this.state.currentQuestion = next;
    this.patchAnswerEntryUI();
    this.focusAnswerPanel();
  }

  async applyBulkAnswers() {
    const textarea = document.getElementById('bulk-answer-input');
    const msgEl = document.getElementById('bulk-validation-msg');
    if (!textarea) return;

    this.state.bulkInputDraft = textarea.value;
    const questions = this.getAnswerEntryQuestions();
    const mode = this.getAnswerMode();
    const tokens = parseBulkAnswerInput(textarea.value, mode);
    const validation = validateBulkAnswers(tokens, questions.length, mode);
    const { valid, errors, warnings, errorQuestionNumbers } = validation;

    if (msgEl) {
      if (errors.length) {
        msgEl.className = 'bulk-validation-msg bulk-validation-msg--error';
        msgEl.innerHTML = renderBulkValidationHtml(errors, warnings);
        this.focusQuestionIssues(errorQuestionNumbers);
        return;
      }
      const lines = [...warnings];
      if (lines.length) msgEl.className = 'bulk-validation-msg bulk-validation-msg--warn';
      else msgEl.className = 'bulk-validation-msg bulk-validation-msg--ok';
      msgEl.innerHTML = lines.length
        ? renderBulkValidationHtml([], warnings)
        : `${Math.min(tokens.length, questions.length)}개 답안을 적용할 수 있습니다.`;
    }

    if (!valid) return;

    const current = this.getCurrentAnswers();
    const hasExisting = questions.some((q) => String(current[q.id] ?? current[String(q.number)] ?? '').trim());

    let proceed = true;
    if (warnings.length || hasExisting) {
      const parts = [];
      if (warnings.length) {
        parts.push(
          warnings
            .map((w) => (typeof w === 'string' ? w : [w.message, w.detail].filter(Boolean).join('\n')))
            .join('\n\n')
        );
      }
      if (hasExisting) parts.push('기존에 입력된 답안을 덮어씁니다.');
      parts.push('적용하시겠습니까?');
      proceed = await confirmDialog(parts.join('\n\n'), { title: '일괄 입력 적용', confirmLabel: '적용' });
    }
    if (!proceed) {
      const warnNums = warnings.flatMap((w) => (typeof w === 'object' && w.questionNumbers ? w.questionNumbers : []));
      if (warnNums.length) this.focusQuestionIssues(warnNums);
      return;
    }

    const mapped = tokensToAnswersMap(tokens, questions, mode);
    this.state.currentAnswers = { ...current, ...mapped };
    this.state.currentQuestion = 1;
    this.state.answerIssueQuestions = [];
    if (msgEl) {
      msgEl.className = 'bulk-validation-msg bulk-validation-msg--ok';
      msgEl.textContent = '답안이 적용되었습니다. 빠른 입력에서 개별 수정할 수 있습니다.';
    }
    showToast('일괄 답안이 적용되었습니다.');
    this.setAnswerEntryMode('fast');
    this.patchAnswerEntryUI();
    this.focusAnswerPanel();
  }

  async saveAnswers(options = {}) {
    const { andNextStudent = false } = options;
    const { examId, studentId } = this.state.answerEntry;
    if (!examId || !studentId) return;

    this.syncCurrentTextInput();
    const questions = this.getAnswerEntryQuestions();
    const answers = this.getCurrentAnswers();

    const missing = questions.filter((q) => {
      const ans = answers[q.id] ?? answers[String(q.number)];
      return !String(ans ?? '').trim();
    });

    if (missing.length) {
      const missingNums = missing.map((q) => q.number);
      this.state.answerIssueQuestions = missingNums;
      this.patchAnswerEntryUI();
      const ok = await confirmDialog(
        `미입력 문항이 ${missing.length}개 있습니다 (${missingNums.join(', ')}).\n\n답안표에서 문항 번호를 클릭하면 해당 문항으로 이동할 수 있습니다. 그래도 저장하시겠습니까?`,
        { title: '미입력 문항', confirmLabel: '저장' }
      );
      if (!ok) {
        this.focusQuestionIssues(missingNums);
        return;
      }
      this.state.answerIssueQuestions = [];
    }

    const data = this.repository.loadAll();
    const existing = this.repository.getResultByExamStudent(examId, studentId);
    const result = buildResultRecord({
      examId,
      studentId,
      questions,
      answers,
      existingId: existing?.id,
      options: { ignoreCase: data.settings.ignoreCase !== false },
    });

    this.repository.saveResult(result);
    this.state.currentAnswers = null;
    showToast('답안이 저장되고 채점되었습니다.');

    if (andNextStudent) {
      const nextId = this.getNextStudentId();
      if (!nextId) {
        showToast('마지막 학생입니다.');
        this.renderer.render('answer-entry');
        return;
      }
      this.state.answerEntry.studentId = nextId;
      this.state.currentQuestion = 1;
      this.state.bulkInputDraft = '';
      this.renderer.render('answer-entry');
      return;
    }

    const exam = this.repository.getExam(examId);
    const hasNext = this.hasNextAnswerStudent();
    const choice = await choiceDialog('답안이 저장되었습니다. 다음 작업을 선택하세요.', {
      title: '저장 완료',
      choices: [
        { id: 'results', label: '결과 보기', primary: true },
        { id: 'continue', label: '현재 학생 계속 수정' },
        { id: 'next', label: hasNext ? '다음 학생 답안 입력' : '마지막 학생입니다.', disabled: !hasNext },
      ],
    });

    if (choice === 'results') {
      this.state.studentResults = { classId: exam?.classId || '', studentId };
      this.state.selectedResultId = result.id;
      this.navigate('student-results');
      return;
    }

    if (choice === 'next' && hasNext) {
      const nextId = this.getNextStudentId();
      if (nextId) {
        this.state.answerEntry.studentId = nextId;
        this.state.currentQuestion = 1;
        this.state.bulkInputDraft = '';
        this.renderer.render('answer-entry');
        return;
      }
    }

    this.state.currentQuestion = 1;
    this.renderer.render('answer-entry');
  }

  exportJson() {
    const filename = this.importExport.exportJson();
    showToast(`백업 완료: ${filename}`);
    if (this.state.currentView === 'dashboard' || this.state.currentView === 'backup') {
      this.renderer.render(this.state.currentView);
    }
  }

  exportCsv(examId) {
    const exam = this.repository.getExam(examId);
    if (!exam) return;
    const results = this.repository.getResults({ examId });
    const data = this.repository.loadAll();
    const questions = this.repository.getQuestionsByExam(examId);
    const filename = this.importExport.exportCsvForExam(exam, results, data.students, data.classes, questions);
    showToast(`CSV보내기 완료: ${filename}`);
  }

  async resetAll() {
    const ok = await confirmDialog(
      '모든 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?',
      { title: '전체 초기화', danger: true, confirmLabel: '초기화' }
    );
    if (!ok) return;
    this.repository.resetAllData();
    this.state = {
      currentView: 'backup',
      selectedClassId: null,
      editingExamId: null,
      answerEntry: { classId: '', examId: '', studentId: '' },
      answerEntryMode: 'fast',
      bulkInputDraft: '',
      answerIssueQuestions: [],
      currentAnswers: null,
      currentQuestion: 1,
      studentResults: { classId: '', studentId: '' },
      selectedResultId: null,
      examOverviewId: null,
    };
    showToast('모든 데이터가 초기화되었습니다.');
    this.navigate('dashboard');
  }
}

  document.addEventListener('DOMContentLoaded', () => {
    document.title = APP_NAME;
    const app = new StudentAchievementApp();
    app.init();

    document.addEventListener('change', async (e) => {
      if (e.target.matches('[data-action="import-json-input"]')) {
        const file = e.target.files?.[0];
        if (!file) return;
        const ok = await confirmDialog(
          '가져온 데이터로 현재 데이터를 덮어씁니다. 복원 전에 백업을 권장합니다. 계속하시겠습니까?',
          { title: 'JSON 복원', danger: true, confirmLabel: '복원' }
        );
        if (!ok) {
          e.target.value = '';
          return;
        }
        try {
          await app.importExport.importJsonFile(file);
          showToast('데이터가 복원되었습니다.');
          app.navigate('dashboard');
        } catch (err) {
          showToast(err.message, 'error');
        }
        e.target.value = '';
      }
    });

    document.addEventListener('input', (e) => {
      if (e.target.matches('[data-question-major]')) {
        app.refreshMiddleDatalist(e.target);
      }
      if (e.target.matches('#bulk-answer-input')) {
        app.state.bulkInputDraft = e.target.value;
      }
    });
  });
})(window.SAT = window.SAT || {});
