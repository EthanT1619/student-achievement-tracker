(function (SAT) {
  const { normalizeCategory, makeMiddleKey, getMiddleDisplayName } = SAT;

  SAT.normalizeAnswer = function normalizeAnswer(value, { ignoreCase = true } = {}) {
    if (value == null) return '';
    let str = String(value).trim();
    if (ignoreCase) str = str.toUpperCase();
    if (/^\d+$/.test(str)) return String(parseInt(str, 10));
    return str;
  };

  SAT.answersMatch = function answersMatch(studentAnswer, correctAnswer, options = {}) {
    const a = SAT.normalizeAnswer(studentAnswer, options);
    const b = SAT.normalizeAnswer(correctAnswer, options);
    if (!a && !b) return false;
    return a === b;
  };

  function initCategoryBucket() {
    return { correct: 0, total: 0, points: 0, earned: 0 };
  }

  function initMiddleBucket(major, middle) {
    return {
      ...initCategoryBucket(),
      major: normalizeCategory(major),
      middle: normalizeCategory(middle),
    };
  }

  SAT.gradeAnswers = function gradeAnswers(questions, answers, options = {}) {
    let correctCount = 0;
    let earnedPoints = 0;
    let totalPoints = 0;
    const wrongQuestions = [];
    const majorStats = {};
    const middleStats = {};

    questions.forEach((q) => {
      const points = Number(q.points) || 1;
      totalPoints += points;
      const studentAnswer = answers[q.id] ?? answers[String(q.number)] ?? '';
      const isCorrect = SAT.answersMatch(studentAnswer, q.correctAnswer, options);
      if (isCorrect) {
        correctCount += 1;
        earnedPoints += points;
      } else {
        wrongQuestions.push(q.number);
      }

      const major = normalizeCategory(q.majorCategory);
      const middle = normalizeCategory(q.middleCategory);
      if (!major) return;

      if (!majorStats[major]) majorStats[major] = initCategoryBucket();
      const middleKey = makeMiddleKey(major, middle);
      if (!middleStats[middleKey]) middleStats[middleKey] = initMiddleBucket(major, middle);

      majorStats[major].total += 1;
      majorStats[major].points += points;
      middleStats[middleKey].total += 1;
      middleStats[middleKey].points += points;

      if (isCorrect) {
        majorStats[major].correct += 1;
        majorStats[major].earned += points;
        middleStats[middleKey].correct += 1;
        middleStats[middleKey].earned += points;
      }
    });

    return {
      correctCount,
      earnedPoints,
      totalPoints,
      percentage: totalPoints > 0 ? earnedPoints / totalPoints : 0,
      wrongQuestions,
      categoryStats: { major: majorStats, middle: middleStats },
    };
  };

  SAT.recomputeResultStats = function recomputeResultStats(result, questions, options = { ignoreCase: true }) {
    if (!result || !questions?.length) {
      return { categoryStats: { major: {}, middle: {} }, correctCount: 0, earnedPoints: 0, totalPoints: 0, percentage: 0 };
    }
    return SAT.gradeAnswers(questions, result.answers || {}, options);
  };

  SAT.buildResultRecord = function buildResultRecord({ examId, studentId, questions, answers, existingId, options }) {
    const graded = SAT.gradeAnswers(questions, answers, options);
    return {
      id: existingId,
      examId,
      studentId,
      answers,
      correctCount: graded.correctCount,
      earnedPoints: graded.earnedPoints,
      totalPoints: graded.totalPoints,
      percentage: graded.percentage,
      categoryStats: graded.categoryStats,
      wrongQuestions: graded.wrongQuestions,
    };
  };

  SAT.getMajorRate = function getMajorRate(categoryStats, major) {
    const bucket = categoryStats?.major?.[major];
    if (!bucket || bucket.total === 0) return null;
    return bucket.correct / bucket.total;
  };

  SAT.aggregateCategoryStatsFromResults = function aggregateCategoryStatsFromResults(results, questions, options = { ignoreCase: true }) {
    const majorAvgs = {};
    const middleAvgs = {};

    results.forEach((r) => {
      const { categoryStats } = SAT.gradeAnswers(questions, r.answers || {}, options);
      Object.entries(categoryStats.major).forEach(([cat, bucket]) => {
        if (!majorAvgs[cat]) majorAvgs[cat] = { correct: 0, total: 0 };
        majorAvgs[cat].correct += bucket.correct;
        majorAvgs[cat].total += bucket.total;
      });
      Object.entries(categoryStats.middle).forEach(([key, bucket]) => {
        if (!middleAvgs[key]) {
          middleAvgs[key] = {
            correct: 0,
            total: 0,
            major: bucket.major,
            middle: bucket.middle,
          };
        }
        middleAvgs[key].correct += bucket.correct;
        middleAvgs[key].total += bucket.total;
      });
    });

    return { majorAvgs, middleAvgs };
  };

  SAT.computeExamOverview = function computeExamOverview(results, students, questions, options = { ignoreCase: true }) {
    const submittedStudentIds = new Set(results.map((r) => r.studentId));
    const activeStudents = students.filter((s) => s.active !== false);
    const notSubmitted = activeStudents.filter((s) => !submittedStudentIds.has(s.id));
    const scores = results.map((r) => r.percentage);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const questionStats = questions.map((q) => {
      let correct = 0;
      let answered = 0;
      results.forEach((r) => {
        const ans = r.answers?.[q.id] ?? r.answers?.[String(q.number)] ?? '';
        if (String(ans).trim()) answered += 1;
        if (SAT.answersMatch(ans, q.correctAnswer, options)) correct += 1;
      });
      const total = results.length;
      return {
        number: q.number,
        correct,
        answered,
        total,
        rate: total > 0 ? correct / total : null,
        majorCategory: q.majorCategory,
        middleCategory: q.middleCategory,
      };
    });

    const { majorAvgs, middleAvgs } = SAT.aggregateCategoryStatsFromResults(results, questions, options);

    return {
      submittedCount: results.length,
      notSubmitted,
      classAverage: avg,
      highest: scores.length ? Math.max(...scores) : null,
      lowest: scores.length ? Math.min(...scores) : null,
      questionStats,
      majorAvgs,
      middleAvgs,
      studentScores: results
        .map((r) => {
          const graded = SAT.gradeAnswers(questions, r.answers || {}, options);
          return {
            studentId: r.studentId,
            percentage: graded.percentage,
            earnedPoints: graded.earnedPoints,
            totalPoints: graded.totalPoints,
            correctCount: graded.correctCount,
          };
        })
        .sort((a, b) => b.percentage - a.percentage),
    };
  };

  SAT.getClassAverageForExam = function getClassAverageForExam(results, questions, options = { ignoreCase: true }) {
    if (!results.length) return null;
    if (!questions?.length) {
      return results.reduce((sum, r) => sum + r.percentage, 0) / results.length;
    }
    const scores = results.map((r) => SAT.gradeAnswers(questions, r.answers || {}, options).percentage);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  SAT.getStudentExamTrend = function getStudentExamTrend(results, exams, questionsByExam, options = { ignoreCase: true }) {
    const examMap = new Map(exams.map((e) => [e.id, e]));
    return results
      .map((r) => {
        const questions = questionsByExam?.[r.examId] || [];
        const graded = questions.length
          ? SAT.gradeAnswers(questions, r.answers || {}, options)
          : { percentage: r.percentage, earnedPoints: r.earnedPoints, totalPoints: r.totalPoints };
        return {
          examId: r.examId,
          title: examMap.get(r.examId)?.title || '—',
          date: examMap.get(r.examId)?.date || '',
          percentage: graded.percentage,
          earnedPoints: graded.earnedPoints,
          totalPoints: graded.totalPoints,
        };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  SAT.detectAnswerMode = function detectAnswerMode(questions) {
    const answers = questions.map((q) => SAT.normalizeAnswer(q.correctAnswer, { ignoreCase: false }));
    const alphaCount = answers.filter((a) => /^[A-E]$/i.test(a)).length;
    const numCount = answers.filter((a) => /^[1-5]$/.test(a)).length;
    if (alphaCount > numCount) return 'alpha';
    if (numCount > 0) return 'numeric';
    return 'text';
  };
})(window.SAT = window.SAT || {});
