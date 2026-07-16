(function (SAT) {
  const { STORAGE_KEY, SCHEMA_VERSION } = SAT;
  const { generateId, nowIso } = SAT;

  function createEmptyData() {
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: nowIso(),
      settings: {
        lastBackupAt: null,
        ignoreCase: true,
      },
      classes: [],
      students: [],
      exams: [],
      questions: [],
      results: [],
    };
  }

  function cloneData(data) {
    if (typeof structuredClone === 'function') return structuredClone(data);
    return JSON.parse(JSON.stringify(data));
  }

  class LocalStorageRepository {
    constructor(storageKey = STORAGE_KEY) {
      this.storageKey = storageKey;
      this._cache = null;
    }

    loadAll() {
      if (this._cache) return cloneData(this._cache);
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) {
          this._cache = createEmptyData();
          return cloneData(this._cache);
        }
        const parsed = JSON.parse(raw);
        this._cache = this._normalize(parsed);
        return cloneData(this._cache);
      } catch (err) {
        console.error('Failed to load data:', err);
        this._cache = createEmptyData();
        return cloneData(this._cache);
      }
    }

    saveAll(data) {
      const normalized = this._normalize(data);
      normalized.updatedAt = nowIso();
      this._cache = normalized;
      localStorage.setItem(this.storageKey, JSON.stringify(normalized));
      return cloneData(normalized);
    }

    _normalize(data) {
      const base = createEmptyData();
      if (!data || typeof data !== 'object') return base;
      return {
        schemaVersion: data.schemaVersion ?? SCHEMA_VERSION,
        updatedAt: data.updatedAt ?? nowIso(),
        settings: { ...base.settings, ...(data.settings || {}) },
        classes: Array.isArray(data.classes) ? data.classes : [],
        students: Array.isArray(data.students) ? data.students : [],
        exams: Array.isArray(data.exams) ? data.exams : [],
        questions: Array.isArray(data.questions) ? data.questions : [],
        results: Array.isArray(data.results) ? data.results : [],
      };
    }

    _mutate(mutator) {
      const data = this.loadAll();
      mutator(data);
      return this.saveAll(data);
    }

    getClasses() { return this.loadAll().classes; }
    getClass(id) { return this.getClasses().find((c) => c.id === id) || null; }

    saveClass(classData) {
      return this._mutate((data) => {
        const now = nowIso();
        const existing = data.classes.findIndex((c) => c.id === classData.id);
        const record = {
          id: classData.id || generateId(),
          name: classData.name?.trim() || '',
          level: classData.level?.trim() || '',
          createdAt: classData.createdAt || now,
          updatedAt: now,
        };
        if (existing >= 0) data.classes[existing] = record;
        else data.classes.push(record);
      });
    }

    deleteClass(id) {
      return this._mutate((data) => {
        data.classes = data.classes.filter((c) => c.id !== id);
        const studentIds = data.students.filter((s) => s.classId === id).map((s) => s.id);
        data.students = data.students.filter((s) => s.classId !== id);
        const examIds = data.exams.filter((e) => e.classId === id).map((e) => e.id);
        data.exams = data.exams.filter((e) => e.classId !== id);
        data.questions = data.questions.filter((q) => !examIds.includes(q.examId));
        data.results = data.results.filter(
          (r) => !examIds.includes(r.examId) && !studentIds.includes(r.studentId)
        );
      });
    }

    getStudents({ classId, activeOnly = false } = {}) {
      let list = this.loadAll().students;
      if (classId) list = list.filter((s) => s.classId === classId);
      if (activeOnly) list = list.filter((s) => s.active !== false);
      return list;
    }

    getStudent(id) { return this.getStudents().find((s) => s.id === id) || null; }

    saveStudent(student) {
      return this._mutate((data) => {
        const now = nowIso();
        const existing = data.students.findIndex((s) => s.id === student.id);
        const record = {
          id: student.id || generateId(),
          classId: student.classId,
          name: student.name?.trim() || '',
          englishName: student.englishName?.trim() || '',
          active: student.active !== false,
          createdAt: student.createdAt || now,
          updatedAt: now,
        };
        if (existing >= 0) data.students[existing] = record;
        else data.students.push(record);
      });
    }

    archiveStudent(id) {
      const student = this.getStudent(id);
      if (!student) return this.loadAll();
      return this.saveStudent({ ...student, active: false });
    }

    deleteStudent(id) {
      return this._mutate((data) => {
        data.students = data.students.filter((s) => s.id !== id);
        data.results = data.results.filter((r) => r.studentId !== id);
      });
    }

    getExams({ classId } = {}) {
      let list = this.loadAll().exams;
      if (classId) list = list.filter((e) => e.classId === classId);
      return list.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    getExam(id) { return this.getExams().find((e) => e.id === id) || null; }

    saveExam(exam) {
      return this._mutate((data) => {
        const now = nowIso();
        const existing = data.exams.findIndex((e) => e.id === exam.id);
        const record = {
          id: exam.id || generateId(),
          classId: exam.classId,
          title: exam.title?.trim() || '',
          examType: exam.examType?.trim() || '',
          date: exam.date || now.slice(0, 10),
          questionCount: Number(exam.questionCount) || 0,
          createdAt: exam.createdAt || now,
          updatedAt: now,
        };
        if (existing >= 0) data.exams[existing] = record;
        else data.exams.push(record);
      });
    }

    deleteExam(id) {
      return this._mutate((data) => {
        data.exams = data.exams.filter((e) => e.id !== id);
        data.questions = data.questions.filter((q) => q.examId !== id);
        data.results = data.results.filter((r) => r.examId !== id);
      });
    }

    getQuestionsByExam(examId) {
      return this.loadAll()
        .questions.filter((q) => q.examId === examId)
        .sort((a, b) => a.number - b.number);
    }

    saveQuestions(examId, questions) {
      return this._mutate((data) => {
        data.questions = data.questions.filter((q) => q.examId !== examId);
        const now = nowIso();
        questions.forEach((q) => {
          data.questions.push({
            id: q.id || generateId(),
            examId,
            number: Number(q.number),
            correctAnswer: String(q.correctAnswer ?? '').trim(),
            points: Number(q.points) || 1,
          majorCategory: SAT.normalizeCategory(q.majorCategory),
          middleCategory: SAT.normalizeCategory(q.middleCategory),
            note: q.note?.trim() || '',
            createdAt: q.createdAt || now,
            updatedAt: now,
          });
        });
        const exam = data.exams.find((e) => e.id === examId);
        if (exam) {
          exam.questionCount = questions.length;
          exam.updatedAt = now;
        }
      });
    }

    getResults({ examId, studentId, classId } = {}) {
      let list = this.loadAll().results;
      if (examId) list = list.filter((r) => r.examId === examId);
      if (studentId) list = list.filter((r) => r.studentId === studentId);
      if (classId) {
        const examIds = new Set(this.getExams({ classId }).map((e) => e.id));
        list = list.filter((r) => examIds.has(r.examId));
      }
      return list;
    }

    getResult(id) { return this.getResults().find((r) => r.id === id) || null; }

    getResultByExamStudent(examId, studentId) {
      return this.getResults({ examId, studentId })[0] || null;
    }

    saveResult(result) {
      return this._mutate((data) => {
        const now = nowIso();
        const existing = data.results.findIndex((r) => r.id === result.id);
        const byPair = data.results.findIndex(
          (r) => r.examId === result.examId && r.studentId === result.studentId
        );
        const record = {
          id: result.id || generateId(),
          examId: result.examId,
          studentId: result.studentId,
          answers: result.answers || {},
          correctCount: result.correctCount ?? 0,
          earnedPoints: result.earnedPoints ?? 0,
          totalPoints: result.totalPoints ?? 0,
          percentage: result.percentage ?? 0,
          categoryStats: result.categoryStats || {},
          submittedAt: result.submittedAt || now,
          updatedAt: now,
        };
        if (existing >= 0) data.results[existing] = record;
        else if (byPair >= 0) data.results[byPair] = { ...record, id: data.results[byPair].id };
        else data.results.push(record);
      });
    }

    deleteResult(id) {
      return this._mutate((data) => {
        data.results = data.results.filter((r) => r.id !== id);
      });
    }

    exportData() {
      const data = this.loadAll();
      return { ...data, exportedAt: nowIso() };
    }

    importData(payload) {
      const normalized = this._normalize(payload);
      return this.saveAll(normalized);
    }

    setLastBackupAt(iso) {
      return this._mutate((data) => {
        data.settings.lastBackupAt = iso;
      });
    }

    resetAllData() {
      return this.saveAll(createEmptyData());
    }

    invalidateCache() {
      this._cache = null;
    }
  }

  SAT.LocalStorageRepository = LocalStorageRepository;
  SAT.createRepository = function createRepository() {
    return new LocalStorageRepository();
  };
})(window.SAT = window.SAT || {});
