(function (SAT) {
  const { SCHEMA_VERSION, normalizeCategory, getUniqueMajorsFromQuestions, recomputeResultStats } = SAT;

  SAT.getWrongQuestionNumbers = function getWrongQuestionNumbers(result, questions, options = { ignoreCase: true }) {
    const wrong = [];
    questions.forEach((q) => {
      const ans = result.answers?.[q.id] ?? result.answers?.[String(q.number)] ?? '';
      if (!String(ans).trim() || !SAT.answersMatch(ans, q.correctAnswer, options)) {
        wrong.push(q.number);
      }
    });
    return wrong;
  };

  class ImportExportManager {
    constructor(repository) {
      this.repository = repository;
    }

    validateImportData(payload) {
      const errors = [];
      if (!payload || typeof payload !== 'object') {
        errors.push('유효한 JSON 객체가 아닙니다.');
        return { valid: false, errors };
      }
      if (payload.schemaVersion != null && payload.schemaVersion > SCHEMA_VERSION) {
        errors.push(`지원하지 않는 schemaVersion입니다: ${payload.schemaVersion}`);
      }
      ['classes', 'students', 'exams', 'questions', 'results'].forEach((key) => {
        if (payload[key] != null && !Array.isArray(payload[key])) {
          errors.push(`${key}는 배열이어야 합니다.`);
        }
      });
      return { valid: errors.length === 0, errors };
    }

    exportJson() {
      const data = this.repository.exportData();
      const date = new Date().toISOString().slice(0, 10);
      const filename = `student-achievement-backup-${date}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      this.triggerDownload(blob, filename);
      this.repository.setLastBackupAt(new Date().toISOString());
      return filename;
    }

    async importJsonFile(file) {
      const text = await file.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('JSON 파싱에 실패했습니다. 파일 형식을 확인해주세요.');
      }
      const { valid, errors } = this.validateImportData(payload);
      if (!valid) throw new Error(errors.join('\n'));
      this.repository.importData(payload);
      this.repository.invalidateCache();
      return payload;
    }

    exportCsvForExam(exam, results, students, classes, questions) {
      const classMap = new Map(classes.map((c) => [c.id, c]));
      const studentMap = new Map(students.map((s) => [s.id, s]));
      const majors = getUniqueMajorsFromQuestions(questions);
      const data = this.repository.loadAll();
      const options = { ignoreCase: data.settings?.ignoreCase !== false };

      const headers = [
        '학생명', '영어 이름', '반', '시험명', '시험일', '총점', '정답 수', '정답률',
        ...majors.map((c) => `${c} 정답률`),
        '오답 문항',
      ];

      const rows = results.map((r) => {
        const student = studentMap.get(r.studentId);
        const cls = student ? classMap.get(student.classId) : null;
        const stats = recomputeResultStats(r, questions, options);
        const majorRates = majors.map((cat) => {
          const bucket = stats.categoryStats?.major?.[cat];
          if (!bucket || bucket.total === 0) return '데이터 없음';
          return `${Math.round((bucket.correct / bucket.total) * 100)}%`;
        });
        const wrong = SAT.getWrongQuestionNumbers(r, questions, options);
        return [
          student?.name || '', student?.englishName || '', cls?.name || '',
          exam.title, exam.date,
          `${stats.earnedPoints}/${stats.totalPoints}`, String(stats.correctCount),
          `${Math.round(stats.percentage * 100)}%`, ...majorRates, wrong.join(', '),
        ];
      });

      const csvContent = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
      const filename = `exam-results-${exam.title.replace(/[^\w가-힣-]/g, '_')}-${exam.date}.csv`;
      this.triggerDownload(blob, filename);
      return filename;
    }

    triggerDownload(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  SAT.ImportExportManager = ImportExportManager;
})(window.SAT = window.SAT || {});
