(function (SAT) {
  const {
    APP_NAME,
    createRepository, Renderer, ImportExportManager,
    buildResultRecord, confirmDialog, choiceDialog, showToast, generateId, escapeHtml,
    normalizeCategory, collectMiddleSuggestions,
    detectAnswerMode, keyToAnswerOption,
    parseBulkAnswerInput, validateBulkAnswers, tokensToAnswersMap,
    renderBulkValidationHtml,
    setPageGuideOpen, isPageGuideOpen, setChecklistOpen,
    renderHelpModalShell,
    DEFAULT_STUDENT_RESULT_DISPLAY, normalizeStudentResultDisplay,
    DEFAULT_UI_PREFS, normalizeUiPrefs,
    filterExams, sortExamsByDateDesc, formatExamOptionLabel,
    collectDistinctClassLevels, collectDistinctExamTypes, ensureValidExamSelection,
    filterTemplatesByLevel, templateQuestionsToExamQuestions, hasDuplicateTemplateName,
    buildPresetAssessmentTemplate, examQuestionsToTemplateQuestions, PRESET_ASSESSMENT_TEMPLATES,
    resizeQuestions, getRemovedQuestions, hasMeaningfulQuestionData,
    buildQuestionCountReductionMessage, needsQuestionCountReductionConfirm,
    mergeQuestionsForReductionCheck,
    prepareQuestionRangePatch, applyQuestionRangePatch,
    isSaveFailure, STORAGE_RECOVERY_MESSAGE, STORAGE_RECOVERY_START_FRESH_MESSAGE,
  } = SAT;

  class StudentAchievementApp {
  constructor() {
    this.repository = createRepository();
    this.importExport = new ImportExportManager(this.repository);
    this.renderer = new Renderer(this);
    this._commentSaveTimer = null;
    this._commentDirtyResultId = null;
    this._examSearchTimer = null;
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
      studentResultDisplay: { ...DEFAULT_STUDENT_RESULT_DISPLAY },
      srDisplayModalOpen: false,
      examOverviewId: null,
      examOverviewMode: 'single',
      examsListFilters: { ...DEFAULT_UI_PREFS.examsListFilters },
      examOverviewFilters: { ...DEFAULT_UI_PREFS.examOverviewFilters },
      examSetup: { classId: '', templateId: '' },
      editingTemplateId: null,
    };
  }

  init() {
    const data = this.repository.loadAll();
    if (this.repository.isStorageRecoveryRequired()) {
      showToast(STORAGE_RECOVERY_MESSAGE, 'error');
    }
    const structureWarnings = this.repository.getStructureWarnings();
    if (structureWarnings.length) {
      showToast(
        `저장 데이터 문항 구조 문제: ${structureWarnings[0]}${
          structureWarnings.length > 1 ? ` 외 ${structureWarnings.length - 1}건` : ''
        }`,
        'error'
      );
    }
    if (data.classes.length) this.state.selectedClassId = data.classes[0].id;
    this.hydrateUiPrefs(data);
    this.bindEvents();
    this.navigate('dashboard');
  }

  navigate(view, extras = {}) {
    if (this.state.currentView === 'student-results' && view !== 'student-results') {
      this.flushTeacherCommentSave();
    }
    if (view !== 'student-results') this.closeSrDisplayModal();
    this.state.currentView = view;
    if (extras.classId) this.state.selectedClassId = extras.classId;
    if (extras.examId) {
      this.state.examOverviewId = extras.examId;
      const examData = this.repository.loadAll();
      const pickedExam = examData.exams.find((e) => e.id === extras.examId);
      if (pickedExam) {
        this.state.examOverviewFilters.classId = pickedExam.classId;
      }
      this.saveUiPrefs();
    }
    if (extras.editingExamId !== undefined) {
      this.state.editingExamId = extras.editingExamId;
      this.state.editingTemplateId = null;
    } else if (view === 'exams') {
      this.state.editingExamId = null;
      if (!extras.editingExamId && extras.editingTemplateId === undefined) {
        this.state.editingTemplateId = null;
      }
      if (!this.state.examSetup.classId && this.state.examsListFilters.classId) {
        this.state.examSetup.classId = this.state.examsListFilters.classId;
      }
    }
    this.renderer.render(view);
  }

  hydrateUiPrefs(data) {
    const prefs = normalizeUiPrefs(data.settings?.uiPrefs);
    this.state.examsListFilters = { ...prefs.examsListFilters };
    this.state.examOverviewFilters = { ...prefs.examOverviewFilters };
    if (prefs.answerEntry.classId) {
      this.state.answerEntry.classId = prefs.answerEntry.classId;
    }
    if (prefs.answerEntry.examId) {
      this.state.answerEntry.examId = prefs.answerEntry.examId;
    }
    if (prefs.examOverviewId) {
      this.state.examOverviewId = prefs.examOverviewId;
    }
    this.validatePersistedExamSelections(data);
  }

  validatePersistedExamSelections(data) {
    const { classes, exams } = data;
    if (this.state.answerEntry.classId) {
      const classExams = sortExamsByDateDesc(
        exams.filter((e) => e.classId === this.state.answerEntry.classId)
      );
      this.state.answerEntry.examId = ensureValidExamSelection(
        this.state.answerEntry.examId,
        classExams
      );
    } else {
      this.state.answerEntry.examId = '';
    }

    const overviewExams = filterExams(exams, {
      classes,
      ...this.state.examOverviewFilters,
    });
    this.state.examOverviewId = ensureValidExamSelection(
      this.state.examOverviewId,
      overviewExams
    );
  }

  saveUiPrefs() {
    const result = this.repository.updateUiPrefs({
      examsListFilters: { ...this.state.examsListFilters },
      examOverviewFilters: { ...this.state.examOverviewFilters },
      answerEntry: {
        classId: this.state.answerEntry.classId,
        examId: this.state.answerEntry.examId,
      },
      examOverviewId: this.state.examOverviewId || '',
    });
    if (isSaveFailure(result)) {
      this.showStorageError(result);
    }
  }

  showStorageError(result) {
    showToast(result?.message || '데이터 저장에 실패했습니다.', 'error');
  }

  applySaveResult(result, { successMessage, onSuccess } = {}) {
    if (isSaveFailure(result)) {
      this.showStorageError(result);
      return false;
    }
    if (successMessage) showToast(successMessage);
    if (onSuccess) onSuccess(result?.data);
    return true;
  }

  downloadCorruptJson() {
    try {
      const filename = this.importExport.exportCorruptJson();
      showToast(`손상 원본 다운로드: ${filename}`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async recoveryStartFresh() {
    const ok = await confirmDialog(STORAGE_RECOVERY_START_FRESH_MESSAGE, {
      title: '저장 데이터 초기화',
      danger: true,
      confirmLabel: '빈 데이터로 시작',
    });
    if (!ok) return;
    const result = this.repository.startFreshAfterRecovery();
    if (!this.applySaveResult(result, { successMessage: '빈 데이터로 시작했습니다.' })) {
      return;
    }
    this.state.selectedClassId = null;
    this.navigate('dashboard');
  }

  async importJsonFile(file, { skipOverwriteConfirm = false } = {}) {
    if (!skipOverwriteConfirm) {
      const ok = await confirmDialog(
        '가져온 데이터로 현재 데이터를 덮어씁니다. 복원 전에 백업을 권장합니다. 계속하시겠습니까?',
        { title: 'JSON 복원', danger: true, confirmLabel: '복원' }
      );
      if (!ok) return false;
    }
    try {
      await this.importExport.importJsonFile(file);
      this.repository.invalidateCache();
      this.hydrateUiPrefs(this.repository.loadAll());
      showToast('데이터가 복원되었습니다.');
      this.navigate('dashboard');
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    }
  }

  bindEvents() {
    document.addEventListener('click', (e) => this.handleClick(e));
    document.addEventListener('change', (e) => this.handleChange(e));
    document.addEventListener('submit', (e) => this.handleSubmit(e));
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    document.addEventListener('input', (e) => {
      if (e.target.matches('[data-field="teacher-comment"]')) {
        this.onTeacherCommentInput(e.target);
      }
      if (e.target.matches('[data-filter="exams-filter-search"]')) {
        this.state.examsListFilters.search = e.target.value;
        if (this._examSearchTimer) clearTimeout(this._examSearchTimer);
        this._examSearchTimer = setTimeout(() => {
          this._examSearchTimer = null;
          this.saveUiPrefs();
          if (this.state.currentView === 'exams') this.renderer.render('exams');
        }, 300);
      }
    });
    document.addEventListener(
      'blur',
      (e) => {
        if (e.target.matches('[data-field="teacher-comment"]')) {
          this.flushTeacherCommentSave();
        }
      },
      true
    );
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
      'download-corrupt-json': () => this.downloadCorruptJson(),
      'recovery-start-fresh': () => void this.recoveryStartFresh(),
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
      'create-template-from-exam': () => this.createTemplateFromExam(action.dataset.id),
      'edit-template': () => {
        this.state.editingTemplateId = action.dataset.id;
        this.state.editingExamId = null;
        this.renderer.render('exams');
      },
      'duplicate-template': () => this.duplicateAssessmentTemplate(action.dataset.id),
      'delete-template': () => this.deleteAssessmentTemplate(action.dataset.id),
      'cancel-edit-template': () => {
        this.state.editingTemplateId = null;
        this.renderer.render('exams');
      },
      'add-preset-template': () => this.addPresetTemplate(action.dataset.preset),
      'new-template': () => {
        this.state.editingTemplateId = '__new__';
        this.state.editingExamId = null;
        this.renderer.render('exams');
      },
      'select-exam-template': () => {
        this.state.examSetup.templateId = action.dataset.id;
        this.renderer.render('exams');
      },
      'delete-exam': () => this.deleteExam(action.dataset.id, Number(action.dataset.results)),
      'prev-question': () => this.moveQuestion(-1),
      'next-question': () => this.moveQuestion(1),
      'save-answers': () => this.saveAnswers(),
      'save-and-next-student': () => this.saveAnswers({ andNextStudent: true }),
      'answer-mode-fast': () => this.setAnswerEntryMode('fast'),
      'answer-mode-bulk': () => this.setAnswerEntryMode('bulk'),
      'apply-bulk': () => this.applyBulkAnswers(),
      'select-result': () => {
        this.flushTeacherCommentSave();
        this.state.selectedResultId = action.dataset.id;
        this.renderer.render('student-results');
      },
      'print-results': () => {
        this.flushTeacherCommentSave();
        SAT.printStudentResults();
      },
      'print-exam-overview': () => SAT.printExamOverview(),
      'toggle-sr-display': () => this.toggleStudentResultDisplay(action.dataset.displayKey),
      'sr-display-all-on': () => this.setStudentResultDisplayAll(true),
      'sr-display-all-off': () => this.setStudentResultDisplayAll(false),
      'open-sr-display': () => this.openSrDisplayModal(),
      'close-sr-display': () => this.closeSrDisplayModal(),
      'exam-overview-mode-single': () => this.setExamOverviewMode('single'),
      'exam-overview-mode-all': () => this.setExamOverviewMode('all'),
      'copy-prev-categories': () => this.copyPrevCategories(Number(action.dataset.num)),
      'apply-question-range-patch': () => {
        void this.applyQuestionRangePatch();
      },
      'range-patch-preset': () => this.handleRangePatchPreset(action.dataset.preset),
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
        this.saveUiPrefs();
        this.renderer.render('answer-entry');
      },
      examId: () => {
        this.state.answerEntry.examId = e.target.value;
        this.state.answerEntry.studentId = '';
        this.state.currentAnswers = null;
        this.state.currentQuestion = 1;
        this.state.bulkInputDraft = '';
        this.state.answerIssueQuestions = [];
        this.saveUiPrefs();
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
        this.flushTeacherCommentSave();
        this.state.studentResults.classId = e.target.value;
        this.state.studentResults.studentId = '';
        this.state.selectedResultId = null;
        this.renderer.render('student-results');
      },
      'sr-studentId': () => {
        this.flushTeacherCommentSave();
        this.state.studentResults.studentId = e.target.value;
        const results = this.repository.getResults({ studentId: e.target.value });
        this.state.selectedResultId = results[results.length - 1]?.id || null;
        this.renderer.render('student-results');
      },
      'overview-examId': () => {
        this.state.examOverviewId = e.target.value;
        this.saveUiPrefs();
        this.renderer.render('exam-overview');
      },
      'exams-filter-classId': () => {
        this.state.examsListFilters.classId = e.target.value;
        this.saveUiPrefs();
        this.renderer.render('exams');
      },
      'exams-filter-level': () => {
        this.state.examsListFilters.level = e.target.value;
        this.saveUiPrefs();
        this.renderer.render('exams');
      },
      'exams-filter-examType': () => {
        this.state.examsListFilters.examType = e.target.value;
        this.saveUiPrefs();
        this.renderer.render('exams');
      },
      'overview-filter-classId': () => {
        this.state.examOverviewFilters.classId = e.target.value;
        this.applyExamOverviewFilterChange();
      },
      'overview-filter-level': () => {
        this.state.examOverviewFilters.level = e.target.value;
        this.applyExamOverviewFilterChange();
      },
      'exam-setup-classId': () => {
        this.state.examSetup.classId = e.target.value;
        this.state.examSetup.templateId = '';
        this.renderer.render('exams');
      },
    };

    if (filters[filter]) filters[filter]();
  }

  handleSubmit(e) {
    e.preventDefault();
    const form = e.target;

    if (form.dataset.form === 'add-class') {
      const fd = new FormData(form);
      const result = this.repository.saveClass({ name: fd.get('name'), level: fd.get('level') });
      if (!this.applySaveResult(result, { successMessage: '반이 추가되었습니다.', onSuccess: () => form.reset() })) {
        return;
      }
      this.navigate('classes');
      return;
    }

    if (form.dataset.form === 'add-student') {
      const fd = new FormData(form);
      const result = this.repository.saveStudent({
        classId: fd.get('classId'),
        name: fd.get('name'),
        englishName: fd.get('englishName'),
      });
      if (!this.applySaveResult(result, { successMessage: '학생이 추가되었습니다.', onSuccess: () => form.reset() })) {
        return;
      }
      this.navigate('classes');
      return;
    }

    if (form.dataset.form === 'exam-setup') {
      void this.saveExamSetup(form);
      return;
    }

    if (form.dataset.form === 'template-setup') {
      void this.saveTemplateSetup(form);
    }
  }

  handleKeydown(e) {
    if (e.key === 'Escape') {
      const srModal = document.getElementById('sr-display-modal');
      if (srModal && !srModal.classList.contains('hidden')) {
        this.closeSrDisplayModal();
        return;
      }
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
    this.closeSrDisplayModal();
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
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    if (overlay && document.getElementById('sr-display-modal')?.classList.contains('hidden')) {
      overlay.classList.add('hidden');
    }
    if (this._helpOverlayHandler && overlay) {
      overlay.removeEventListener('click', this._helpOverlayHandler);
      this._helpOverlayHandler = null;
    }
  }

  openSrDisplayModal() {
    if (this.state.currentView !== 'student-results') return;
    this.closeHelp();
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('sr-display-modal');
    const content = document.getElementById('sr-display-modal-content');
    if (!overlay || !modal || !content) return;

    this.state.srDisplayModalOpen = true;
    this.syncSrDisplayModal();
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    if (this._srDisplayOverlayHandler) {
      overlay.removeEventListener('click', this._srDisplayOverlayHandler);
    }
    this._srDisplayOverlayHandler = (ev) => {
      if (ev.target === overlay) this.closeSrDisplayModal();
    };
    overlay.addEventListener('click', this._srDisplayOverlayHandler);
  }

  closeSrDisplayModal() {
    this.state.srDisplayModalOpen = false;
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('sr-display-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    if (overlay && document.getElementById('help-modal')?.classList.contains('hidden')) {
      overlay.classList.add('hidden');
    }
    if (this._srDisplayOverlayHandler && overlay) {
      overlay.removeEventListener('click', this._srDisplayOverlayHandler);
      this._srDisplayOverlayHandler = null;
    }
  }

  syncSrDisplayModal() {
    if (!this.state.srDisplayModalOpen) return;
    const content = document.getElementById('sr-display-modal-content');
    if (!content) return;
    content.innerHTML = this.renderer.renderStudentResultDisplayPanel(
      normalizeStudentResultDisplay(this.state.studentResultDisplay)
    );
  }

  flushTeacherCommentSave() {
    if (this._commentSaveTimer) {
      clearTimeout(this._commentSaveTimer);
      this._commentSaveTimer = null;
    }
    const textarea = document.getElementById('teacher-comment-input');
    if (!textarea || !this._commentDirtyResultId) return;
    const resultId = textarea.dataset.resultId;
    if (!resultId) return;
    const result = this.repository.updateResultTeacherComment(resultId, textarea.value);
    if (isSaveFailure(result)) {
      this.showStorageError(result);
      this.updateCommentSaveStatus('error');
      return;
    }
    this._commentDirtyResultId = null;
    this.updateCommentSaveStatus('saved');
    this.refreshTeacherCommentPrintBlock(resultId, textarea.value);
  }

  onTeacherCommentInput(textarea) {
    const resultId = textarea.dataset.resultId;
    if (!resultId) return;
    this._commentDirtyResultId = resultId;
    this.updateCommentSaveStatus('pending');
    if (this._commentSaveTimer) clearTimeout(this._commentSaveTimer);
    this._commentSaveTimer = setTimeout(() => {
      const result = this.repository.updateResultTeacherComment(resultId, textarea.value);
      if (isSaveFailure(result)) {
        this.showStorageError(result);
        this.updateCommentSaveStatus('error');
        this._commentSaveTimer = null;
        return;
      }
      this._commentDirtyResultId = null;
      this._commentSaveTimer = null;
      this.updateCommentSaveStatus('saved');
      this.refreshTeacherCommentPrintBlock(resultId, textarea.value);
    }, 600);
  }

  updateCommentSaveStatus(state) {
    const el = document.getElementById('teacher-comment-status');
    if (!el) return;
    if (state === 'pending') {
      el.textContent = '저장 중…';
      el.className = 'teacher-comment__save-status teacher-comment__save-status--pending';
    } else if (state === 'saved') {
      el.textContent = '저장됨';
      el.className = 'teacher-comment__save-status teacher-comment__save-status--saved';
    } else if (state === 'error') {
      el.textContent = '저장 실패';
      el.className = 'teacher-comment__save-status teacher-comment__save-status--error';
    } else {
      el.textContent = '';
      el.className = 'teacher-comment__save-status';
    }
  }

  refreshTeacherCommentPrintBlock(resultId, text) {
    const display = normalizeStudentResultDisplay(this.state.studentResultDisplay);
    if (!display.showTeacherComment) return;
    const wrap = document.querySelector('.teacher-comment-wrap');
    if (!wrap) return;
    const trimmed = String(text ?? '').trim();
    let printEl = wrap.querySelector('.teacher-comment--print');
    if (!trimmed) {
      printEl?.remove();
      return;
    }
    const escaped = SAT.escapeHtml(trimmed).replace(/\n/g, '<br>');
    if (!printEl) {
      printEl = document.createElement('div');
      printEl.className = 'teacher-comment teacher-comment--print';
      wrap.appendChild(printEl);
    }
    printEl.innerHTML = `<h3>선생님 코멘트</h3><div class="teacher-comment__text">${escaped}</div>`;
  }

  toggleStudentResultDisplay(key) {
    if (!key) return;
    const display = normalizeStudentResultDisplay(this.state.studentResultDisplay);
    if (!Object.prototype.hasOwnProperty.call(display, key)) return;
    display[key] = !display[key];
    this.state.studentResultDisplay = display;
    this.renderer.render('student-results');
  }

  setStudentResultDisplayAll(on) {
    const display = { ...DEFAULT_STUDENT_RESULT_DISPLAY };
    Object.keys(display).forEach((k) => {
      display[k] = !!on;
    });
    this.state.studentResultDisplay = display;
    this.renderer.render('student-results');
  }

  setExamOverviewMode(mode) {
    this.state.examOverviewMode = mode;
    this.renderer.render('exam-overview');
  }

  applyExamOverviewFilterChange() {
    const data = this.repository.loadAll();
    const filtered = filterExams(data.exams, {
      classes: data.classes,
      ...this.state.examOverviewFilters,
    });
    this.state.examOverviewId = ensureValidExamSelection(this.state.examOverviewId, filtered);
    this.saveUiPrefs();
    this.renderer.render('exam-overview');
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

  parseQuestionsFromForm(form, upTo) {
    const fd = new FormData(form);
    const questions = [];
    for (let i = 1; i <= upTo; i += 1) {
      questions.push({
        number: i,
        id: fd.get(`q_${i}_id`) || undefined,
        correctAnswer: String(fd.get(`q_${i}_answer`) ?? '').trim(),
        points: fd.get(`q_${i}_points`),
        majorCategory: normalizeCategory(fd.get(`q_${i}_major`)),
        middleCategory: normalizeCategory(fd.get(`q_${i}_middle`)),
        note: String(fd.get(`q_${i}_note`) ?? '').trim(),
      });
    }
    return questions;
  }

  isTemplateSetupForm(form) {
    return form?.dataset?.form === 'template-setup';
  }

  rerenderQuestionRows(form, questions, count) {
    const isTemplate = this.isTemplateSetupForm(form);
    const container = isTemplate
      ? document.getElementById('template-questions-container')
      : document.getElementById('questions-container');
    if (!container) return;
    const allQuestions = this.repository.loadAll().questions;
    container.innerHTML = isTemplate
      ? this.renderer.renderTemplateQuestionRows(questions, count, allQuestions)
      : this.renderer.renderQuestionRows(questions, count, allQuestions);
  }

  restoreQuestionRowsAfterCancel(form, originalCount, persistedQuestions) {
    const visibleCount = form.querySelectorAll('.question-row').length;
    const fromForm = this.parseQuestionsFromForm(form, visibleCount);
    const byNumber = new Map((persistedQuestions || []).map((q) => [Number(q.number), { ...q }]));
    fromForm.forEach((q) => {
      if (q.number <= originalCount) {
        byNumber.set(q.number, { ...byNumber.get(q.number), ...q, number: q.number });
      }
    });
    const merged = [];
    for (let i = 1; i <= originalCount; i += 1) {
      merged.push(
        byNumber.get(i) || {
          number: i,
          correctAnswer: '',
          points: 1,
          majorCategory: '',
          middleCategory: '',
          note: '',
        }
      );
    }
    this.rerenderQuestionRows(form, resizeQuestions(merged, originalCount), originalCount);
  }

  async confirmQuestionCountReductionBeforeSave(form, { originalCount, isNewRecord, persistedQuestions }) {
    const fd = new FormData(form);
    const newCount = Number(fd.get('questionCount'));
    if (!needsQuestionCountReductionConfirm(originalCount, newCount, isNewRecord)) {
      return true;
    }

    const domCount = form.querySelectorAll('.question-row').length;
    const parseUpTo = Math.max(originalCount, domCount);
    const formQuestions = this.parseQuestionsFromForm(form, parseUpTo);
    const removedQuestions = mergeQuestionsForReductionCheck(
      persistedQuestions,
      formQuestions,
      newCount,
      originalCount
    );
    const message = buildQuestionCountReductionMessage(originalCount, newCount, removedQuestions);
    const hasData = removedQuestions.some((q) => hasMeaningfulQuestionData(q));
    const ok = await confirmDialog(message, {
      title: '문항 수 줄이기',
      danger: hasData,
      confirmLabel: '계속',
    });
    if (!ok) {
      const countInput = form.querySelector('[name="questionCount"]');
      if (countInput) countInput.value = String(originalCount);
      this.restoreQuestionRowsAfterCancel(form, originalCount, persistedQuestions);
      return false;
    }
    return true;
  }

  handleQuestionCountChange(input) {
    const form = input.closest('form');
    if (!form) return;
    const newCount = Math.max(1, Number(input.value) || 1);
    const oldCount = form.querySelectorAll('.question-row').length;
    if (newCount === oldCount) return;

    const existing = this.parseQuestionsFromForm(form, oldCount);
    const resized = resizeQuestions(existing, newCount);
    this.rerenderQuestionRows(form, resized, newCount);
    input.value = String(newCount);

    const panel = form.querySelector('[data-question-range-patch]');
    if (panel) {
      const rangeEnd = panel.querySelector('[name="range_end"]');
      const rangeStart = panel.querySelector('[name="range_start"]');
      if (rangeEnd) {
        rangeEnd.max = String(newCount);
        if (Number(rangeEnd.value) > newCount) rangeEnd.value = String(newCount);
      }
      if (rangeStart) {
        rangeStart.max = String(newCount);
        if (Number(rangeStart.value) > newCount) rangeStart.value = String(newCount);
      }
    }
  }

  readQuestionRangePatchInput(form) {
    const fd = new FormData(form);
    return {
      startNumber: fd.get('range_start'),
      endNumber: fd.get('range_end'),
      applyMajorCategory: fd.get('range_apply_major') === 'on',
      applyMiddleCategory: fd.get('range_apply_middle') === 'on',
      applyPoints: fd.get('range_apply_points') === 'on',
      applyNote: fd.get('range_apply_note') === 'on',
      majorCategory: fd.get('range_major'),
      middleCategory: fd.get('range_middle'),
      points: fd.get('range_points'),
      note: fd.get('range_note'),
    };
  }

  async applyQuestionRangePatch() {
    const form = document.querySelector('[data-form="exam-setup"], [data-form="template-setup"]');
    if (!form) return;

    const questionCount = Number(new FormData(form).get('questionCount'));
    const prepared = prepareQuestionRangePatch(this.readQuestionRangePatchInput(form), questionCount);
    if (!prepared.valid) {
      showToast(prepared.error, 'error');
      return;
    }

    const ok = await confirmDialog(prepared.summary, {
      title: '범위 일괄 적용',
      confirmLabel: '적용',
    });
    if (!ok) return;

    const currentCount = form.querySelectorAll('.question-row').length;
    const questions = this.parseQuestionsFromForm(form, currentCount);
    const patched = applyQuestionRangePatch(questions, {
      startNumber: prepared.startNumber,
      endNumber: prepared.endNumber,
      fields: prepared.fields,
    });
    this.rerenderQuestionRows(form, patched, questionCount);
    showToast(`${prepared.affectedCount}개 문항에 일괄 적용했습니다.`);
  }

  handleRangePatchPreset(preset) {
    const form = document.querySelector('[data-form="exam-setup"], [data-form="template-setup"]');
    if (!form) return;
    const panel = form.querySelector('[data-question-range-patch]');
    if (!panel) return;

    const questionCount =
      Number(new FormData(form).get('questionCount')) || form.querySelectorAll('.question-row').length;
    const start = panel.querySelector('[name="range_start"]');
    const end = panel.querySelector('[name="range_end"]');
    const applyMajor = panel.querySelector('[name="range_apply_major"]');
    const applyMiddle = panel.querySelector('[name="range_apply_middle"]');
    const applyPoints = panel.querySelector('[name="range_apply_points"]');
    const applyNote = panel.querySelector('[name="range_apply_note"]');

    if (preset === 'full-range') {
      if (start) start.value = '1';
      if (end) end.value = String(questionCount);
      return;
    }
    if (preset === 'major-only') {
      if (applyMajor) applyMajor.checked = true;
      if (applyMiddle) applyMiddle.checked = false;
      if (applyPoints) applyPoints.checked = false;
      if (applyNote) applyNote.checked = false;
      return;
    }
    if (preset === 'major-middle') {
      if (applyMajor) applyMajor.checked = true;
      if (applyMiddle) applyMiddle.checked = true;
      if (applyPoints) applyPoints.checked = false;
      if (applyNote) applyNote.checked = false;
    }
  }

  refreshMiddleDatalist(majorInput) {
    const num = majorInput.dataset.questionMajor;
    const list = document.getElementById(`middle-list-${num}`);
    if (!list) return;
    const allQuestions = this.repository.loadAll().questions;
    const suggestions = collectMiddleSuggestions(allQuestions, majorInput.value);
    list.innerHTML = suggestions.map((m) => `<option value="${escapeHtml(m)}">`).join('');
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
    const result = this.repository.saveClass({ ...cls, name, level });
    if (!this.applySaveResult(result, { successMessage: '반이 수정되었습니다.' })) return;
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
    const result = this.repository.deleteClass(id);
    if (!this.applySaveResult(result, { successMessage: '반이 삭제되었습니다.' })) return;
    if (this.state.selectedClassId === id) this.state.selectedClassId = null;
    this.navigate('classes');
  }

  async editStudent(id) {
    const student = this.repository.getStudent(id);
    if (!student) return;
    const name = prompt('학생 이름', student.name);
    if (name === null) return;
    const englishName = prompt('영어 이름', student.englishName);
    if (englishName === null) return;
    const result = this.repository.saveStudent({ ...student, name, englishName });
    if (!this.applySaveResult(result, { successMessage: '학생 정보가 수정되었습니다.' })) return;
    this.navigate('classes');
  }

  archiveStudent(id) {
    const result = this.repository.archiveStudent(id);
    if (!this.applySaveResult(result, { successMessage: '학생이 비활성화되었습니다.' })) return;
    this.navigate('classes');
  }

  activateStudent(id) {
    const student = this.repository.getStudent(id);
    if (!student) return;
    const result = this.repository.saveStudent({ ...student, active: true });
    if (!this.applySaveResult(result, { successMessage: '학생이 활성화되었습니다.' })) return;
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
    const result = this.repository.deleteStudent(id);
    if (!this.applySaveResult(result, { successMessage: '학생이 삭제되었습니다.' })) return;
    this.navigate('classes');
  }

  async saveExamSetup(form) {
    const fd = new FormData(form);
    const examId = fd.get('examId');
    const isNewRecord = !examId;
    const persistedQuestions = isNewRecord ? [] : this.repository.getQuestionsByExam(examId);
    const originalCount = persistedQuestions.length;

    const canSave = await this.confirmQuestionCountReductionBeforeSave(form, {
      originalCount,
      isNewRecord,
      persistedQuestions,
    });
    if (!canSave) return;

    const newExamId = examId || generateId();
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

    const examResult = this.repository.saveExam({
      id: newExamId,
      classId: fd.get('classId'),
      title: fd.get('title'),
      examType: normalizeCategory(fd.get('examType')),
      date: fd.get('date'),
      questionCount,
      templateId: fd.get('templateId') || undefined,
      templateNameSnapshot: fd.get('templateNameSnapshot') ?? undefined,
      templateLevelSnapshot: fd.get('templateLevelSnapshot') ?? undefined,
    });
    if (isSaveFailure(examResult)) {
      this.showStorageError(examResult);
      return;
    }
    const questionsResult = this.repository.saveQuestions(newExamId, questions);
    if (!this.applySaveResult(questionsResult, { successMessage: '시험이 저장되었습니다.' })) {
      return;
    }
    this.state.editingExamId = null;
    this.state.examSetup = { classId: '', templateId: '' };
    this.navigate('exams');
  }

  async saveTemplateSetup(form) {
    const fd = new FormData(form);
    const templateId = fd.get('templateId');
    const isNewRecord = !templateId;
    const persistedTemplate = templateId ? this.repository.getAssessmentTemplate(templateId) : null;
    const persistedQuestions = persistedTemplate?.questions || [];
    const originalCount = persistedQuestions.length;

    const canSave = await this.confirmQuestionCountReductionBeforeSave(form, {
      originalCount,
      isNewRecord,
      persistedQuestions,
    });
    if (!canSave) return;

    const newTemplateId = templateId || generateId();
    const questionCount = Number(fd.get('questionCount'));
    const name = String(fd.get('name') ?? '').trim();
    const level = String(fd.get('level') ?? '').trim();
    const questions = [];

    for (let i = 1; i <= questionCount; i++) {
      questions.push({
        number: i,
        points: fd.get(`q_${i}_points`),
        majorCategory: normalizeCategory(fd.get(`q_${i}_major`)),
        middleCategory: normalizeCategory(fd.get(`q_${i}_middle`)),
        note: String(fd.get(`q_${i}_note`) ?? '').trim(),
        correctAnswer: '',
      });
    }

    const missingMajor = questions.filter((q) => !q.majorCategory).map((q) => q.number);
    if (!name) {
      showToast('템플릿 이름을 입력해주세요.', 'error');
      return;
    }
    if (!level) {
      showToast('레벨을 입력해주세요.', 'error');
      return;
    }
    if (missingMajor.length) {
      showToast(`${missingMajor.join(', ')}번 문항의 대분류가 입력되지 않았습니다.`, 'error');
      return;
    }

    const templates = this.repository.getAssessmentTemplates();
    if (hasDuplicateTemplateName(templates, name, level, newTemplateId)) {
      showToast(`같은 레벨("${level}")에 "${name}" 템플릿이 이미 있습니다.`, 'error');
      return;
    }

    const result = this.repository.saveAssessmentTemplate({
      id: newTemplateId,
      name,
      level,
      examType: normalizeCategory(fd.get('examType')),
      questionCount,
      questions,
    });
    if (!this.applySaveResult(result, { successMessage: '템플릿이 저장되었습니다.' })) return;
    this.state.editingTemplateId = null;
    this.renderer.render('exams');
  }

  async createTemplateFromExam(examId) {
    const exam = this.repository.getExam(examId);
    if (!exam) return;
    const cls = this.repository.getClass(exam.classId);
    const level = cls?.level?.trim() || '';
    const defaultName = `${exam.title} 템플릿`;
    const name = prompt('템플릿 이름', defaultName);
    if (name === null || !name.trim()) return;

    const templates = this.repository.getAssessmentTemplates();
    if (hasDuplicateTemplateName(templates, name.trim(), level)) {
      showToast(`같은 레벨("${level}")에 "${name.trim()}" 템플릿이 이미 있습니다.`, 'error');
      return;
    }

    const questions = examQuestionsToTemplateQuestions(this.repository.getQuestionsByExam(examId));
    const result = this.repository.saveAssessmentTemplate({
      name: name.trim(),
      level,
      examType: exam.examType || '',
      questionCount: questions.length,
      questions,
    });
    if (!this.applySaveResult(result, { successMessage: '시험에서 템플릿을 만들었습니다.' })) return;
    this.renderer.render('exams');
  }

  addPresetTemplate(presetKey) {
    const preset = buildPresetAssessmentTemplate(presetKey);
    if (!preset) return;
    const templates = this.repository.getAssessmentTemplates();
    if (hasDuplicateTemplateName(templates, preset.name, preset.level)) {
      showToast(`"${preset.name}" (${preset.level}) 템플릿이 이미 있습니다.`, 'error');
      return;
    }
    const result = this.repository.saveAssessmentTemplate(preset);
    if (!this.applySaveResult(result, { successMessage: `"${preset.name}" 기본 템플릿을 추가했습니다.` })) return;
    this.renderer.render('exams');
  }

  duplicateAssessmentTemplate(id) {
    const result = this.repository.duplicateAssessmentTemplate(id);
    if (!this.applySaveResult(result, { successMessage: '템플릿이 복제되었습니다.' })) return;
    this.renderer.render('exams');
  }

  async deleteAssessmentTemplate(id) {
    const template = this.repository.getAssessmentTemplate(id);
    if (!template) return;
    const ok = await confirmDialog(
      `"${template.name}" 템플릿을 삭제하시겠습니까?\n\n기존 시험 데이터에는 영향을 주지 않습니다.`,
      { title: '템플릿 삭제', danger: true, confirmLabel: '삭제' }
    );
    if (!ok) return;
    const result = this.repository.deleteAssessmentTemplate(id);
    if (!this.applySaveResult(result, { successMessage: '템플릿이 삭제되었습니다.' })) return;
    if (this.state.editingTemplateId === id) this.state.editingTemplateId = null;
    this.renderer.render('exams');
  }

  async duplicateExam(id) {
    const exam = this.repository.getExam(id);
    if (!exam) return;
    const title = prompt('새 시험명', `${exam.title} (복제)`);
    if (!title) return;
    const date = prompt('새 시험일 (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
    if (!date) return;

    const newId = generateId();
    const examResult = this.repository.saveExam({
      ...exam,
      id: newId,
      title,
      date,
      createdAt: undefined,
    });
    if (isSaveFailure(examResult)) {
      this.showStorageError(examResult);
      return;
    }
    const questions = this.repository.getQuestionsByExam(id).map((q) => ({
      ...q,
      id: generateId(),
      examId: newId,
    }));
    const questionsResult = this.repository.saveQuestions(newId, questions);
    if (!this.applySaveResult(questionsResult, { successMessage: '시험이 복제되었습니다.' })) return;
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
    const result = this.repository.deleteExam(id);
    if (!this.applySaveResult(result, { successMessage: '시험이 삭제되었습니다.' })) return;
    if (this.state.editingExamId === id) this.state.editingExamId = null;
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

    const saveResult = this.repository.saveResult(result);
    if (!this.applySaveResult(saveResult, { successMessage: '답안이 저장되고 채점되었습니다.' })) {
      return;
    }
    this.state.currentAnswers = null;

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
    const { filename, backupSaved, backupResult } = this.importExport.exportJson();
    showToast(`백업 다운로드: ${filename}`);
    if (!backupSaved && isSaveFailure(backupResult)) {
      this.showStorageError(backupResult);
    }
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
    const result = this.repository.resetAllData();
    if (!this.applySaveResult(result, { successMessage: '모든 데이터가 초기화되었습니다.' })) return;
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
      studentResultDisplay: { ...DEFAULT_STUDENT_RESULT_DISPLAY },
      srDisplayModalOpen: false,
      examOverviewId: null,
      examOverviewMode: 'single',
      examsListFilters: { ...DEFAULT_UI_PREFS.examsListFilters },
      examOverviewFilters: { ...DEFAULT_UI_PREFS.examOverviewFilters },
      examSetup: { classId: '', templateId: '' },
      editingTemplateId: null,
    };
    this.navigate('dashboard');
  }
}

  document.addEventListener('DOMContentLoaded', () => {
    document.title = APP_NAME;
    const app = new StudentAchievementApp();
    app.init();

    document.addEventListener('change', async (e) => {
      if (e.target.matches('[data-action="import-json-input"], [data-action="recovery-import-json-input"]')) {
        const file = e.target.files?.[0];
        if (!file) return;
        const isRecovery = e.target.matches('[data-action="recovery-import-json-input"]');
        await app.importJsonFile(file, { skipOverwriteConfirm: isRecovery });
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
