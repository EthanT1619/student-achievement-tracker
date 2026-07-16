(function (SAT) {
  const {
    APP_NAME,
    createRepository, Renderer, ImportExportManager,
    buildResultRecord, confirmDialog, showToast, generateId,
    normalizeCategory, collectMiddleSuggestions,
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
      'select-result': () => {
        this.state.selectedResultId = action.dataset.id;
        this.renderer.render('student-results');
      },
      'print-results': () => window.print(),
      'copy-prev-categories': () => this.copyPrevCategories(Number(action.dataset.num)),
    };

    if (act === 'goto') {
      this.state.currentQuestion = Number(action.dataset.goto);
      this.renderer.render('answer-entry');
      return;
    }

    if (action.classList.contains('answer-btn')) {
      this.setAnswer(action.dataset.answer);
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
        this.renderer.render('answer-entry');
      },
      examId: () => {
        this.state.answerEntry.examId = e.target.value;
        this.state.answerEntry.studentId = '';
        this.state.currentAnswers = null;
        this.state.currentQuestion = 1;
        this.renderer.render('answer-entry');
      },
      studentId: () => {
        this.state.answerEntry.studentId = e.target.value;
        this.state.currentAnswers = null;
        this.state.currentQuestion = 1;
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
    if (this.state.currentView !== 'answer-entry') return;
    const { examId, studentId } = this.state.answerEntry;
    if (!examId || !studentId) return;

    const questions = this.repository.getQuestionsByExam(examId);
    if (!questions.length) return;

    if (e.key >= '1' && e.key <= '5' && !e.target.matches('input, textarea, select')) {
      const mode = questions.some((q) => /^[A-E]$/i.test(q.correctAnswer)) ? 'alpha' : 'numeric';
      const opt = mode === 'alpha' ? String.fromCharCode(64 + Number(e.key)) : e.key;
      if (Number(e.key) <= 5) {
        e.preventDefault();
        this.setAnswer(opt, true);
      }
    }

    if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
      if (!e.target.matches('select')) {
        e.preventDefault();
        this.moveQuestion(1);
      }
    }
    if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
      if (!e.target.matches('select')) {
        e.preventDefault();
        this.moveQuestion(-1);
      }
    }
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

  setAnswer(value, autoNext = false) {
    const { examId } = this.state.answerEntry;
    const questions = this.repository.getQuestionsByExam(examId);
    const q = questions.find((x) => x.number === this.state.currentQuestion);
    if (!q) return;

    const answers = this.getCurrentAnswers();
    answers[q.id] = value;
    this.state.currentAnswers = answers;

    const textInput = document.querySelector('.answer-text-input');
    if (textInput) textInput.value = value;

    document.querySelectorAll('.answer-btn').forEach((btn) => {
      btn.classList.toggle('answer-btn--selected', btn.dataset.answer === value);
    });

    if (autoNext && this.state.currentQuestion < questions.length) {
      this.state.currentQuestion += 1;
    }
    this.renderer.render('answer-entry');
  }

  moveQuestion(delta) {
    const { examId } = this.state.answerEntry;
    const questions = this.repository.getQuestionsByExam(examId);
    const next = this.state.currentQuestion + delta;
    if (next < 1 || next > questions.length) return;
    this.state.currentQuestion = next;
    this.renderer.render('answer-entry');
  }

  async saveAnswers() {
    const { examId, studentId } = this.state.answerEntry;
    if (!examId || !studentId) return;

    const questions = this.repository.getQuestionsByExam(examId);
    const answers = this.getCurrentAnswers();

    const textInput = document.querySelector('.answer-text-input');
    if (textInput && textInput.value.trim()) {
      const q = questions.find((x) => x.number === this.state.currentQuestion);
      if (q) answers[q.id] = textInput.value.trim();
    }

    const missing = questions.filter((q) => {
      const ans = answers[q.id] ?? answers[String(q.number)];
      return !String(ans ?? '').trim();
    });

    if (missing.length) {
      const ok = await confirmDialog(
        `미입력 문항이 ${missing.length}개 있습니다 (${missing.map((q) => q.number).join(', ')}). 그래도 저장하시겠습니까?`,
        { title: '미입력 문항', confirmLabel: '저장' }
      );
      if (!ok) return;
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
      if (e.target.matches('.answer-text-input')) {
        const { examId } = app.state.answerEntry;
        const questions = app.repository.getQuestionsByExam(examId);
        const q = questions.find((x) => x.number === app.state.currentQuestion);
        if (!q) return;
        const answers = app.getCurrentAnswers();
        answers[q.id] = e.target.value;
        app.state.currentAnswers = answers;
      }
      if (e.target.matches('[data-question-major]')) {
        app.refreshMiddleDatalist(e.target);
      }
    });
  });
})(window.SAT = window.SAT || {});
