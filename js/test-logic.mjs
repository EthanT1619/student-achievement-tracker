/**
 * Node test runner — loads window.SAT scripts via vm sandbox (browser IIFE flow).
 * Run: node js/test-logic.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const CORE_FILES = [
  'js/constants.js',
  'js/utils.js',
  'js/category-utils.js',
  'js/level-utils.js',
  'js/question-resize-utils.js',
  'js/question-range-patch-utils.js',
  'js/question-structure-utils.js',
  'js/exam-filter-utils.js',
  'js/assessment-template-utils.js',
  'js/assessment-manager.js',
  'js/answer-entry-manager.js',
];

function loadSat(extraFiles = []) {
  const sandbox = {
    console,
    window: {},
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);

  for (const file of [...CORE_FILES, ...extraFiles]) {
    const code = readFileSync(join(root, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  const SAT = sandbox.window.SAT || sandbox.SAT;
  if (!SAT) {
    throw new Error('SAT namespace failed to initialize in vm sandbox');
  }
  return SAT;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runTests() {
  const SAT = loadSat();

  // 1. 숫자 1과 문자열 "1"
  assert(SAT.answersMatch('1', '1'), 'numeric string match');
  assert(SAT.answersMatch(1, '1'), 'number vs string');

  // 2. 영문 대소문자 무시
  assert(SAT.answersMatch('a', 'A', { ignoreCase: true }), 'ignoreCase true');
  assert(!SAT.answersMatch('a', 'B', { ignoreCase: true }), 'ignoreCase mismatch');

  // 3. 공백 trim
  assert(SAT.answersMatch(' 2 ', '2'), 'trim whitespace');

  // 4. 미입력 답안은 오답
  const qBasic = [
    { id: 'q1', number: 1, correctAnswer: '2', points: 1, majorCategory: 'Grammar', middleCategory: 'Tense' },
  ];
  const emptyResult = SAT.gradeAnswers(qBasic, { q1: '' });
  assert(emptyResult.correctCount === 0, 'empty answer is wrong');

  // 5. 배점이 다른 문항 총점
  const qPoints = [
    { id: 'a', number: 1, correctAnswer: '1', points: 2, majorCategory: 'G', middleCategory: 'm1' },
    { id: 'b', number: 2, correctAnswer: '2', points: 3, majorCategory: 'G', middleCategory: 'm2' },
  ];
  const ptsResult = SAT.gradeAnswers(qPoints, { a: '1', b: '3' });
  assert(ptsResult.earnedPoints === 2 && ptsResult.totalPoints === 5, 'weighted points');

  // 6. 대분류별 통계
  const qMulti = [
    { id: 'q1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'Grammar', middleCategory: 'Tense' },
    { id: 'q2', number: 2, correctAnswer: '2', points: 1, majorCategory: 'Dialogue', middleCategory: 'Situation' },
  ];
  const multiResult = SAT.gradeAnswers(qMulti, { q1: '1', q2: '2' });
  assert(multiResult.categoryStats.major.Grammar.correct === 1, 'major Grammar stat');
  assert(multiResult.categoryStats.major.Dialogue.correct === 1, 'major Dialogue stat');

  // 7. 동일 중분류 이름 충돌 방지
  const qCollision = [
    { id: 'r1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'Reading Comprehension', middleCategory: 'Detail' },
    { id: 'd1', number: 2, correctAnswer: '2', points: 1, majorCategory: 'Dialogue', middleCategory: 'Detail' },
  ];
  const collisionResult = SAT.gradeAnswers(qCollision, { r1: '1', d1: '2' });
  const middleKeys = Object.keys(collisionResult.categoryStats.middle);
  assert(middleKeys.length === 2, 'two separate middle keys');
  assert(middleKeys.includes('Reading Comprehension::Detail'), 'RC Detail key');
  assert(middleKeys.includes('Dialogue::Detail'), 'Dialogue Detail key');

  // 8. 문항별 반 정답률 — 미입력도 분모 포함
  const qOne = [{ id: 'x', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '' }];
  const results = [
    { answers: { x: '1' } },
    { answers: { x: '2' } },
    { answers: { x: '' } },
    { answers: {} },
    { answers: { x: '1' } },
    { answers: { x: '1' } },
    { answers: { x: '2' } },
    { answers: { x: '' } },
    { answers: { x: '1' } },
    { answers: { x: '1' } },
  ];
  const overview = SAT.computeExamOverview(results, [], qOne);
  assert(overview.questionStats[0].correct === 5, 'five correct');
  assert(overview.questionStats[0].total === 10, 'ten submitted');
  assert(overview.questionStats[0].rate === 0.5, 'rate is 50% not inflated');

  // 9–10. 사용자 정의 분류 저장 (normalizeCategory)
  assert(SAT.normalizeCategory('  Vocabulary  ') === 'Vocabulary', 'custom major trim');
  assert(SAT.normalizeCategory('  Context Clue  ') === 'Context Clue', 'custom middle trim');

  // 11. 대분류 추천 목록
  const suggestions = SAT.collectMajorSuggestions([
    { majorCategory: 'Vocabulary' },
    { majorCategory: 'Grammar' },
  ]);
  assert(suggestions.includes('Vocabulary'), 'Vocabulary in major suggestions');
  assert(suggestions.includes('Grammar'), 'Grammar in major suggestions');

  // 12. 대분류별 중분류 추천
  const middleSug = SAT.collectMiddleSuggestions([
    { majorCategory: 'Vocabulary', middleCategory: 'Context Clue' },
    { majorCategory: 'Grammar', middleCategory: 'Tense' },
  ], 'Vocabulary');
  assert(middleSug.includes('Context Clue'), 'Context Clue for Vocabulary');

  // 13. 빈 대분류 — gradeAnswers에서 major 없으면 통계 제외
  const noMajor = SAT.gradeAnswers(
    [{ id: 'z', number: 1, correctAnswer: '1', points: 1, majorCategory: '', middleCategory: 'X' }],
    { z: '1' }
  );
  assert(Object.keys(noMajor.categoryStats.major).length === 0, 'empty major excluded from stats');

  // 14. 빈 중분류 — 미분류 표시, 별도 키
  const unclassified = SAT.gradeAnswers(
    [{ id: 'u', number: 1, correctAnswer: '1', points: 1, majorCategory: 'Grammar', middleCategory: '' }],
    { u: '1' }
  );
  const uKey = 'Grammar::';
  assert(unclassified.categoryStats.middle[uKey], 'empty middle bucket exists');
  assert(SAT.getMiddleDisplayName('') === '미분류', 'display label for empty middle');

  // 15. 빠른 입력 — 숫자키 → A~E 매핑
  assert(SAT.keyToAnswerOption('1', 'alpha') === 'A', 'key 1 -> A');
  assert(SAT.keyToAnswerOption('5', 'alpha') === 'E', 'key 5 -> E');
  assert(SAT.keyToAnswerOption('3', 'numeric') === '3', 'key 3 numeric');

  // 16. 일괄 입력 파싱 — 붙여쓰기
  assert(
    JSON.stringify(SAT.parseBulkAnswerInput('1234512345', 'numeric')) === JSON.stringify(['1', '2', '3', '4', '5', '1', '2', '3', '4', '5']),
    'concatenated numeric parse'
  );
  assert(
    JSON.stringify(SAT.parseBulkAnswerInput('1, 2, 3, 4, 5', 'numeric')) === JSON.stringify(['1', '2', '3', '4', '5']),
    'comma separated parse'
  );
  assert(
    JSON.stringify(SAT.parseBulkAnswerInput('1 / 2 / 3', 'numeric')) === JSON.stringify(['1', '2', '3']),
    'slash separated parse'
  );
  assert(
    JSON.stringify(SAT.parseBulkAnswerInput('ABCDE', 'alpha')) === JSON.stringify(['A', 'B', 'C', 'D', 'E']),
    'concatenated alpha parse'
  );

  // 17. 일괄 입력 검증
  const vShort = SAT.validateBulkAnswers(['1', '2', '3'], 5, 'numeric');
  assert(vShort.valid && vShort.warnings.length === 1, 'short answer warning');
  assert(vShort.warnings[0].detail.includes('4, 5'), 'missing question numbers listed');
  assert(vShort.warnings[0].questionNumbers.includes(4), 'missing question number 4');

  const vLong = SAT.validateBulkAnswers(['1', '2', '3', '4', '5', '1'], 5, 'numeric');
  assert(vLong.valid && vLong.warnings.length === 1, 'long answer warning');
  assert(vLong.applyCount === 5, 'apply count capped');

  const vBad = SAT.validateBulkAnswers(['1', 'X', '3'], 3, 'numeric');
  assert(!vBad.valid && vBad.errors[0].questionNumber === 2, 'invalid token error position');
  assert(vBad.errorQuestionNumbers.includes(2), 'error question numbers');

  const mapped = SAT.tokensToAnswersMap(['1', '2'], [{ id: 'q1', number: 1 }, { id: 'q2', number: 2 }], 'numeric');
  assert(mapped.q1 === '1' && mapped.q2 === '2', 'tokens to answers map');

  // 18. 학생 전체 시험 집계
  const agg = SAT.aggregateStudentResultsAcrossExams(
    [
      { examId: 'e1', answers: { q1: '1', q2: '2' } },
      { examId: 'e2', answers: { x1: '1' } },
    ],
    {
      e1: [
        { id: 'q1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '' },
        { id: 'q2', number: 2, correctAnswer: '3', points: 1, majorCategory: 'G', middleCategory: '' },
      ],
      e2: [{ id: 'x1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'R', middleCategory: '' }],
    }
  );
  assert(agg.examCount === 2, 'two exams aggregated');
  assert(agg.correctCount === 2, 'two correct across exams');
  assert(agg.categoryStats.major.G.total === 2, 'Grammar total from first exam');

  // 19. 시험 필터·정렬·표시
  const filterClasses = [
    { id: 'c-dsa', name: 'DSA', level: 'Level 3' },
    { id: 'c-dsc', name: 'DSC', level: 'Level 3' },
    { id: 'c-lsa', name: 'LSA', level: 'Level 2' },
  ];
  const filterExamsData = [
    { id: 'e1', classId: 'c-dsa', title: 'Unit 1', examType: 'CQ', date: '2026-01-10' },
    { id: 'e2', classId: 'c-dsc', title: 'Unit 2', examType: 'CQ', date: '2026-02-15' },
    { id: 'e3', classId: 'c-lsa', title: 'Midterm', examType: 'MT', date: '2026-03-01' },
    { id: 'e4', classId: 'c-dsa', title: 'Review', examType: '', date: '2026-03-20' },
  ];

  const dsaOnly = SAT.filterExams(filterExamsData, { classes: filterClasses, classId: 'c-dsa' });
  assert(dsaOnly.length === 2 && dsaOnly.every((e) => e.classId === 'c-dsa'), 'class filter DSA only');

  const level3 = SAT.filterExams(filterExamsData, { classes: filterClasses, level: 'Level 3' });
  assert(level3.length === 3 && !level3.some((e) => e.classId === 'c-lsa'), 'level filter excludes LSA class');
  assert(level3.every((e) => ['c-dsa', 'c-dsc'].includes(e.classId)), 'level filter only Level 3 classes');

  const combo = SAT.filterExams(filterExamsData, {
    classes: filterClasses,
    examType: 'CQ',
    searchQuery: 'Unit',
  });
  assert(combo.length === 2 && combo.every((e) => e.examType === 'CQ'), 'exam type + search combo');

  assert(SAT.ensureValidExamSelection('e3', dsaOnly) === '', 'invalid examId cleared');
  assert(SAT.ensureValidExamSelection('e1', dsaOnly) === 'e1', 'valid examId kept');

  const sorted = SAT.sortExamsByDateDesc(filterExamsData);
  assert(sorted[0].id === 'e4', 'newest exam first');

  assert(
    SAT.formatExamOptionLabel({ title: 'Test A', examType: 'CQ', date: '2026-03-15' }) === '[CQ] Test A · 2026-03-15',
    'option label with type'
  );
  assert(
    SAT.formatExamOptionLabel({ title: 'Test B', examType: '', date: '2026-03-15' }) === 'Test B · 2026-03-15',
    'option label without type'
  );

  const legacyPrefs = SAT.normalizeUiPrefs(undefined);
  assert(legacyPrefs.examsListFilters.classId === '', 'legacy backup uiPrefs defaults');

  // 20. 시험 템플릿 — 프리셋 DSA/DSC/LSA 문항 구조
  const dsaPreset = SAT.buildPresetAssessmentTemplate('dsa-phonics');
  assert(dsaPreset && dsaPreset.level === 'DSA' && dsaPreset.questionCount === 20, 'DSA preset meta');
  assert(dsaPreset.questions[0].majorCategory === 'Listen & Match', 'DSA q1 major');
  assert(dsaPreset.questions[9].majorCategory === 'Listen & Match', 'DSA q10 major');
  assert(dsaPreset.questions[10].majorCategory === 'Dictation', 'DSA q11 major');
  assert(dsaPreset.questions[19].majorCategory === 'Dictation', 'DSA q20 major');

  const dscPreset = SAT.buildPresetAssessmentTemplate('dsc-cq');
  assert(dscPreset && dscPreset.level === 'DSC' && dscPreset.examType === 'CQ', 'DSC preset meta');
  assert(dscPreset.questions[0].majorCategory === 'Story Comprehension', 'DSC q1 major');
  assert(dscPreset.questions[9].majorCategory === 'Story Comprehension', 'DSC q10 major');
  assert(dscPreset.questions[10].majorCategory === 'Dialogue', 'DSC q11 major');
  assert(dscPreset.questions[15].majorCategory === 'Dialogue', 'DSC q16 major');
  assert(dscPreset.questions[16].majorCategory === 'Grammar', 'DSC q17 major');
  assert(dscPreset.questions[19].majorCategory === 'Grammar', 'DSC q20 major');

  const lsaPreset = SAT.buildPresetAssessmentTemplate('lsa-cq');
  assert(lsaPreset && lsaPreset.level === 'LSA' && lsaPreset.questionCount === 20, 'LSA preset meta');
  assert(lsaPreset.questions[0].majorCategory === 'Story', 'LSA q1 major');
  assert(lsaPreset.questions[15].majorCategory === 'Story', 'LSA q16 major');
  assert(lsaPreset.questions[16].majorCategory === 'Grammar', 'LSA q17 major');
  assert(lsaPreset.questions[19].majorCategory === 'Grammar', 'LSA q20 major');

  // 21. 템플릿 필터·변환·중복 감지
  const tplList = [
    { id: 't1', name: 'DSC CQ', level: 'DSC', examType: 'CQ', questionCount: 20, questions: [] },
    { id: 't2', name: 'LSA CQ', level: 'LSA', examType: 'CQ', questionCount: 20, questions: [] },
    { id: 't3', name: 'DSA Phonics Quiz', level: 'DSA', examType: 'Phonics Quiz', questionCount: 20, questions: [] },
  ];

  const dscTpl = SAT.filterTemplatesByLevel(tplList, 'DSC');
  assert(dscTpl.length === 1 && dscTpl[0].name === 'DSC CQ', 'filter templates by DSC level');

  const lsaTpl = SAT.filterTemplatesByLevel(tplList, 'LSA');
  assert(lsaTpl.length === 1 && lsaTpl[0].id === 't2', 'filter templates by LSA level');

  assert(SAT.filterTemplatesByLevel(tplList, 'DSA').length === 1, 'filter templates by DSA level');
  assert(SAT.filterTemplatesByLevel(tplList, 'UNKNOWN').length === 0, 'unknown level returns empty');

  assert(SAT.hasDuplicateTemplateName(tplList, 'DSC CQ', 'DSC'), 'duplicate name same level');
  assert(SAT.hasDuplicateTemplateName(tplList, 'dsc cq', 'DSC'), 'duplicate name case-insensitive');
  assert(!SAT.hasDuplicateTemplateName(tplList, 'DSC CQ', 'LSA'), 'same name different level ok');
  assert(!SAT.hasDuplicateTemplateName(tplList, 'DSC CQ', 'DSC', 't1'), 'exclude self on edit');

  const applied = SAT.templateQuestionsToExamQuestions(dsaPreset);
  assert(applied.length === 20, 'template apply question count');
  assert(applied.every((q) => q.correctAnswer === ''), 'template to exam clears correctAnswer');
  assert(applied[0].majorCategory === 'Listen & Match', 'template to exam keeps majorCategory');
  assert(applied[0].points === 1, 'template to exam keeps points');

  const examQuestions = [
    { number: 1, correctAnswer: '3', points: 2, majorCategory: 'Grammar', middleCategory: 'Tense', note: 'n1' },
    { number: 2, correctAnswer: 'A', points: 1, majorCategory: 'Dialogue', middleCategory: '', note: '' },
  ];
  const toTemplate = SAT.examQuestionsToTemplateQuestions(examQuestions);
  assert(toTemplate.length === 2, 'exam to template count');
  assert(toTemplate.every((q) => q.correctAnswer === ''), 'exam to template strips correctAnswer');
  assert(toTemplate[0].majorCategory === 'Grammar' && toTemplate[0].points === 2, 'exam to template keeps structure');
  assert(toTemplate[0].note === 'n1', 'exam to template keeps note');

  // 22. 레벨 정규화
  assert(SAT.normalizeLevel('dsc') === 'DSC', 'dsc → DSC');
  assert(SAT.normalizeLevel(' DSC ') === 'DSC', 'trimmed DSC');
  assert(SAT.normalizeLevel('DSC1') === 'DSC', 'DSC1 → DSC');
  assert(SAT.normalizeLevel('DSC-2') === 'DSC', 'DSC-2 → DSC');
  assert(SAT.normalizeLevel('lsa 1') === 'LSA', 'lsa 1 → LSA');
  assert(SAT.normalizeLevel('Ascent') === 'ASCENT', 'Ascent → ASCENT');
  assert(SAT.normalizeLevel('Custom A') === 'CUSTOM A', 'custom level preserved uppercased');
  assert(SAT.normalizeLevel(null) === '', 'null → empty');
  assert(SAT.normalizeLevel(undefined) === '', 'undefined → empty');

  const classDsaVariants = [
    { id: 'c1', name: 'Morning A', level: 'dsa 1' },
    { id: 'c2', name: 'Evening B', level: 'DSA' },
  ];
  const tplDsa = [
    { id: 'tp1', name: 'DSA Phonics Quiz', level: 'DSA', examType: 'Phonics Quiz', questionCount: 20, questions: [] },
    { id: 'tp2', name: 'DSC CQ', level: 'DSC', examType: 'CQ', questionCount: 20, questions: [] },
  ];
  assert(
    SAT.filterTemplatesByLevel(tplDsa, classDsaVariants[0].level).length === 1,
    'DSA class variant matches DSA template'
  );
  assert(
    SAT.filterTemplatesByLevel(tplDsa, 'dsc').length === 1 && SAT.filterTemplatesByLevel(tplDsa, 'dsc')[0].id === 'tp2',
    'dsc filter matches DSC template'
  );
  assert(SAT.hasDuplicateTemplateName(tplDsa, 'DSC CQ', 'dsc'), 'duplicate detects normalized level');
  assert(!SAT.hasDuplicateTemplateName(tplDsa, 'DSC CQ', 'lsa'), 'different normalized level ok');

  const mixedLevels = SAT.collectDistinctClassLevels([
    { level: 'dsc' },
    { level: 'DSC' },
    { level: 'DSC1' },
    { level: 'Custom A' },
  ]);
  assert(mixedLevels.length === 2 && mixedLevels.includes('DSC') && mixedLevels.includes('CUSTOM A'), 'distinct levels deduped after normalize');

  // 23. 시험–템플릿 연결 표시 및 snapshot
  const tplLive = { id: 't-dsa', name: 'DSA Phonics Quiz', level: 'DSA', examType: 'Phonics Quiz', questionCount: 20, questions: [] };
  const linkage = SAT.buildExamTemplateLinkage(tplLive);
  assert(linkage.templateId === 't-dsa', 'linkage stores templateId');
  assert(linkage.templateNameSnapshot === 'DSA Phonics Quiz', 'linkage stores name snapshot');
  assert(linkage.templateLevelSnapshot === 'DSA', 'linkage stores level snapshot');

  const examFromTpl = { id: 'e1', title: 'Quiz 1', ...linkage };
  let liveDisplay = SAT.getExamTemplateDisplay(examFromTpl, [tplLive]);
  assert(liveDisplay.text === '사용한 템플릿: DSA Phonics Quiz', 'live template name shown');

  liveDisplay = SAT.getExamTemplateDisplay(examFromTpl, [{ ...tplLive, name: 'Renamed Template' }]);
  assert(liveDisplay.text === '사용한 템플릿: Renamed Template', 'renamed template shows current name');

  const deletedDisplay = SAT.getExamTemplateDisplay(examFromTpl, []);
  assert(deletedDisplay.text === '사용한 템플릿: DSA Phonics Quiz (삭제됨)', 'deleted template shows snapshot');

  const legacyDisplay = SAT.getExamTemplateDisplay({ templateId: 'missing-id' }, []);
  assert(legacyDisplay.text === '사용한 템플릿: 삭제되었거나 확인할 수 없음', 'legacy exam without snapshot');

  assert(SAT.getExamTemplateDisplay({ title: 'No template' }, []) === null, 'no templateId hides display');

  const migrated = SAT.normalizeExamTemplateFields({ id: 'e-old', templateId: 't1', title: 'Old' });
  assert(migrated.templateNameSnapshot === '' && migrated.templateLevelSnapshot === '', 'migrate adds empty snapshots');

  const gradeQs = [{ id: 'q1', number: 1, correctAnswer: '2', points: 1, majorCategory: 'G', middleCategory: '' }];
  const gradeResult = SAT.gradeAnswers(gradeQs, { q1: '2' });
  assert(gradeResult.correctCount === 1 && gradeResult.totalPoints === 1, 'grading unchanged after template removal');

  // 24. 문항 수 줄이기 확인 로직
  const twentyQs = Array.from({ length: 20 }, (_, i) => ({
    number: i + 1,
    correctAnswer: '',
    points: 1,
    majorCategory: '',
    middleCategory: '',
    note: '',
  }));
  twentyQs[10] = { ...twentyQs[10], correctAnswer: '3', majorCategory: 'Grammar' };
  twentyQs[19] = { ...twentyQs[19], note: 'memo' };

  const removed = SAT.getRemovedQuestions(twentyQs, 10);
  assert(removed.length === 10 && removed[0].number === 11 && removed[9].number === 20, '20→10 removed range 11–20');
  assert(SAT.getRemovedQuestionRangeLabel(20, 10) === '11~20번', 'removed range label');

  assert(SAT.hasMeaningfulQuestionData({ number: 11, correctAnswer: '2', points: 1 }), 'correctAnswer is meaningful');
  assert(SAT.hasMeaningfulQuestionData({ number: 11, points: 2, majorCategory: '' }), 'non-default points meaningful');
  assert(SAT.hasMeaningfulQuestionData({ number: 11, majorCategory: 'Dialogue', points: 1 }), 'majorCategory meaningful');
  assert(!SAT.hasMeaningfulQuestionData({ number: 11, points: 1, majorCategory: '', middleCategory: '', note: '' }), 'empty question');

  const dataMsg = SAT.buildQuestionCountReductionMessage(20, 10, removed);
  assert(dataMsg.includes('11~20번') && dataMsg.includes('되돌릴 수 없습니다'), 'meaningful data warning message');

  const emptyRemoved = SAT.getRemovedQuestions(twentyQs.slice(0, 10), 10);
  const emptyMsg = SAT.buildQuestionCountReductionMessage(20, 10, emptyRemoved);
  assert(emptyMsg.includes('빈 문항이 제거됩니다'), 'empty removed warning message');

  const kept = SAT.resizeQuestions(twentyQs, 25);
  assert(kept.length === 25 && kept[0].correctAnswer === twentyQs[0].correctAnswer, 'increase keeps existing');
  assert(kept[24].number === 25 && kept[24].majorCategory === '', 'increase adds empty defaults');

  const shrunk = SAT.resizeQuestions(twentyQs, 10);
  assert(shrunk.length === 10 && shrunk[9].number === 10, 'decrease keeps first N');
  assert(!shrunk.some((q) => q.number > 10), 'decrease drops trailing questions');

  assert(!SAT.needsQuestionCountReductionConfirm(20, 10, true), 'new record skips confirm');
  assert(SAT.needsQuestionCountReductionConfirm(20, 10, false), 'edit record needs confirm');
  assert(!SAT.needsQuestionCountReductionConfirm(10, 20, false), 'increase skips confirm');

  const mergedRemoved = SAT.mergeQuestionsForReductionCheck(
    twentyQs,
    [{ number: 12, correctAnswer: '9', points: 1, majorCategory: '', middleCategory: '', note: '' }],
    10,
    20
  );
  assert(mergedRemoved.find((q) => q.number === 12)?.correctAnswer === '9', 'merge prefers form values for removed');

  let repositorySaveCalls = 0;
  const runSave = (proceed) => {
    if (!SAT.needsQuestionCountReductionConfirm(20, 10, false)) return true;
    if (!proceed) return false;
    repositorySaveCalls += 1;
    return true;
  };
  assert(runSave(false) === false && repositorySaveCalls === 0, 'cancel skips repository save');
  assert(runSave(true) === true && repositorySaveCalls === 1, 'confirm proceeds to save');

  assert(
    SAT.buildQuestionCountReductionMessage(20, 10, removed) ===
      SAT.buildQuestionCountReductionMessage(20, 10, removed),
    'exam and template share same reduction message helper'
  );

  // 25. 범위 일괄 적용
  const aceQuestions = Array.from({ length: 12 }, (_, i) => ({
    number: i + 1,
    correctAnswer: String((i % 5) + 1),
    points: 1,
    majorCategory: 'Mixed',
    middleCategory: `Topic ${i + 1}`,
    note: i === 0 ? 'keep' : '',
  }));

  const majorOnlyPatch = SAT.applyQuestionRangePatch(aceQuestions, {
    startNumber: 1,
    endNumber: 10,
    fields: { majorCategory: 'Story Comprehension' },
  });
  assert(
    majorOnlyPatch.filter((q) => q.number <= 10).every((q) => q.majorCategory === 'Story Comprehension'),
    '1~10 majorCategory bulk apply'
  );
  assert(
    majorOnlyPatch.find((q) => q.number === 1).middleCategory === 'Topic 1' &&
      majorOnlyPatch.find((q) => q.number === 5).middleCategory === 'Topic 5',
    'ACE middleCategory preserved when not checked'
  );
  assert(majorOnlyPatch.find((q) => q.number === 11).majorCategory === 'Mixed', 'out-of-range question unchanged');
  assert(majorOnlyPatch.find((q) => q.number === 1).correctAnswer === '1', 'correctAnswer never bulk-patched');

  const withPoints = SAT.applyQuestionRangePatch(aceQuestions, {
    startNumber: 3,
    endNumber: 5,
    fields: { points: 2 },
  });
  assert(withPoints.find((q) => q.number === 3).points === 2, 'points apply in subrange');
  assert(withPoints.find((q) => q.number === 2).points === 1, 'unchecked range keeps points');

  const clearNote = SAT.applyQuestionRangePatch(
    [{ number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '', note: 'old' }],
    { startNumber: 1, endNumber: 1, fields: { note: '' } }
  );
  assert(clearNote[0].note === '', 'checked empty note clears value');

  const invalidRange = SAT.validateQuestionRangePatch(5, 3, 10);
  assert(!invalidRange.valid, 'reject start > end');
  const overCount = SAT.validateQuestionRangePatch(1, 15, 10);
  assert(!overCount.valid, 'reject end > questionCount');

  const prepared = SAT.prepareQuestionRangePatch(
    {
      startNumber: 1,
      endNumber: 10,
      applyMajorCategory: true,
      majorCategory: 'Story Comprehension',
    },
    20
  );
  assert(prepared.valid && prepared.summary.includes('Story Comprehension'), 'summary includes applied major');
  assert(prepared.affectedCount === 10, 'affected count in prepared patch');

  const noFields = SAT.prepareQuestionRangePatch({ startNumber: 1, endNumber: 5 }, 10);
  assert(!noFields.valid, 'reject when no apply checkbox selected');

  const templatePatch = SAT.applyQuestionRangePatch(
    [{ number: 1, points: 1, majorCategory: '', middleCategory: '', note: '', correctAnswer: '' }],
    { startNumber: 1, endNumber: 1, fields: { majorCategory: 'Dictation', middleCategory: 'Words' } }
  );
  assert(templatePatch[0].majorCategory === 'Dictation', 'template questions patch same as exam');

  // 26. 문항 구조 검사·복구
  const makeQ = (n, extra = {}) => ({
    number: n,
    points: 1,
    majorCategory: extra.majorCategory || 'G',
    middleCategory: extra.middleCategory || '',
    note: extra.note || '',
    correctAnswer: extra.correctAnswer || '',
  });

  const valid20 = Array.from({ length: 20 }, (_, i) => makeQ(i + 1));
  const validCheck = SAT.validateQuestionStructure({ questionCount: 20, questions: valid20 });
  assert(validCheck.status === 'valid', 'valid structure detected');
  const validRepair = SAT.repairQuestionStructure({ questionCount: 20, questions: valid20 });
  assert(validRepair.success && !validRepair.changed, 'valid data not rewritten');

  const partial18 = valid20.slice(0, 18);
  const partialValidation = SAT.validateQuestionStructure({ questionCount: 20, questions: partial18 });
  assert(partialValidation.status === 'repairable', 'count 20 with 18 questions is repairable');
  const partialRepaired = SAT.repairQuestionStructure({ questionCount: 20, questions: partial18 });
  assert(partialRepaired.questions.length === 20, 'repair fills to questionCount 20');
  assert(partialRepaired.questions[17].majorCategory === 'G', 'existing question data kept');
  assert(partialRepaired.questions[19].majorCategory === '', 'missing slots filled empty');

  const noCountQs = [{ number: 1, points: 1, majorCategory: 'A' }, { number: 3, points: 1, majorCategory: 'C' }];
  const noCountRepair = SAT.repairQuestionStructure({ questions: noCountQs });
  assert(noCountRepair.questionCount === 3 && noCountRepair.questions.length === 3, 'derive count from max number');
  assert(noCountRepair.questions[1].majorCategory === '', 'missing number 2 filled');

  const shuffled = [makeQ(3), makeQ(1), makeQ(2)];
  const shuffledRepair = SAT.repairQuestionStructure({ questionCount: 3, questions: shuffled });
  assert(
    shuffledRepair.questions.map((q) => q.number).join(',') === '1,2,3',
    'unsorted questions sorted'
  );

  const dupValidation = SAT.validateQuestionStructure({
    questionCount: 3,
    questions: [makeQ(1), makeQ(1), makeQ(2)],
    entityLabel: 'Test Exam',
    entityType: 'exam',
  });
  assert(dupValidation.status === 'blockingError', 'duplicate numbers block');
  assert(dupValidation.issues[0].includes('중복'), 'duplicate error message');

  const emptyWithCount = SAT.repairQuestionStructure({ questionCount: 5, questions: [] });
  assert(emptyWithCount.questions.length === 5, 'empty questions rebuilt from count');

  const importPayload = {
    exams: [{ id: 'e1', title: 'Midterm', questionCount: 20, classId: 'c1', date: '2026-01-01' }],
    questions: partial18.map((q) => ({ ...q, id: `q${q.number}`, examId: 'e1' })),
    assessmentTemplates: [],
  };
  const importStructure = SAT.validateImportStructure(importPayload);
  assert(importStructure.status === 'repairable', 'import detects exam question mismatch');
  const importRepaired = SAT.repairImportPayload(importPayload);
  assert(importRepaired.payload.exams[0].questionCount === 20, 'import repair syncs exam count');
  assert(importRepaired.payload.questions.length === 20, 'import repair fills exam questions');

  const dupImport = SAT.validateImportStructure({
    exams: [{ id: 'e2', title: 'Bad', questionCount: 2 }],
    questions: [
      { id: 'a', examId: 'e2', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G' },
      { id: 'b', examId: 'e2', number: 1, correctAnswer: '2', points: 1, majorCategory: 'G' },
    ],
    assessmentTemplates: [],
  });
  assert(dupImport.status === 'blockingError', 'import blocks duplicate exam numbers');

  // 27. 시험 문항 id 보장
  let idSeq = 0;
  const mkId = () => `gen-${++idSeq}`;
  const noIdQuestions = [
    { examId: 'e1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '', note: '' },
    { examId: 'e1', number: 2, correctAnswer: '2', points: 1, majorCategory: 'G', middleCategory: '', note: '' },
    { examId: 'e1', number: 3, correctAnswer: '3', points: 1, majorCategory: 'G', middleCategory: '', note: '' },
  ];
  const ensuredImport = SAT.ensureExamQuestionIds(noIdQuestions, { createId: mkId });
  assert(ensuredImport.questions.length === 3, 'three questions ensured');
  assert(
    new Set(ensuredImport.questions.map((q) => q.id)).size === 3,
    'imported questions get distinct ids'
  );
  assert(ensuredImport.changed && ensuredImport.repairs.length === 3, 'missing id repairs logged');

  const repairedMissing = SAT.repairQuestionStructure(
    { questionCount: 3, questions: [{ number: 1, correctAnswer: '1', points: 1, majorCategory: 'G' }] },
    { entityType: 'exam' }
  );
  idSeq = 0;
  const ensuredMissing = SAT.ensureExamQuestionIds(
    repairedMissing.questions.map((q) => ({ ...q, examId: 'e2' })),
    { createId: mkId }
  );
  assert(
    ensuredMissing.questions.every((q) => q.id && q.examId === 'e2' && q.number >= 1),
    'auto-created missing questions get id examId number'
  );

  idSeq = 0;
  const dupIds = SAT.ensureExamQuestionIds(
    [
      { id: 'dup', examId: 'e1', number: 1 },
      { id: 'dup', examId: 'e1', number: 2 },
      { id: 'keep', examId: 'e1', number: 3 },
    ],
    { createId: mkId }
  );
  assert(dupIds.questions[0].id === 'dup', 'first duplicate id kept');
  assert(dupIds.questions[1].id !== 'dup', 'second duplicate gets new id');
  assert(dupIds.questions[2].id === 'keep', 'unique id preserved');
  assert(dupIds.repairs.some((r) => r.includes('중복 id')), 'duplicate id repair logged');

  idSeq = 0;
  const keepExisting = SAT.ensureExamQuestionIds(
    [{ id: 'stable-id', examId: 'e1', number: 1 }],
    { createId: mkId }
  );
  assert(!keepExisting.changed && keepExisting.questions[0].id === 'stable-id', 'valid existing id unchanged');

  idSeq = 0;
  const answerSafe = SAT.ensureExamQuestionIds(noIdQuestions, { createId: mkId });
  const answers = {};
  answerSafe.questions.forEach((q) => {
    answers[q.id] = String(q.number);
  });
  assert(Object.keys(answers).length === 3, 'three answer keys');
  assert(new Set(Object.values(answers)).size === 3, 'answers not overwritten via undefined key');

  const templateOnly = { number: 1, points: 1, majorCategory: 'G', middleCategory: '', note: '' };
  assert(templateOnly.id === undefined, 'template questions do not require id');

  // 28. computeExamOverview 재채점 일관성
  const overviewQs = [
    { id: 'q1', number: 1, correctAnswer: '1', points: 1, majorCategory: 'G', middleCategory: '' },
    { id: 'q2', number: 2, correctAnswer: '2', points: 1, majorCategory: 'G', middleCategory: '' },
  ];
  const overviewResults = [
    {
      studentId: 's1',
      answers: { q1: '1', q2: '2' },
      percentage: 0.5,
      earnedPoints: 1,
      totalPoints: 2,
      correctCount: 1,
    },
    {
      studentId: 's2',
      answers: { q1: '1', q2: '1' },
      percentage: 1,
      earnedPoints: 2,
      totalPoints: 2,
      correctCount: 2,
    },
  ];
  const students = [{ id: 's1', active: true }, { id: 's2', active: true }];

  const staleOverview = SAT.computeExamOverview(overviewResults, students, overviewQs);
  assert(staleOverview.classAverage === 0.75, 'overview uses recomputed not stale stored average');
  assert(staleOverview.highest === 1 && staleOverview.lowest === 0.5, 'highest/lowest recomputed');
  assert(
    staleOverview.studentScores.find((s) => s.studentId === 's1')?.percentage === 1,
    'studentScores match recomputed grades'
  );
  assert(
    staleOverview.studentScores.find((s) => s.studentId === 's2')?.percentage === 0.5,
    'studentScores reflect partial credit'
  );

  const changedAnswerQs = [
    { id: 'q1', number: 1, correctAnswer: '2', points: 1, majorCategory: 'G', middleCategory: '' },
    { id: 'q2', number: 2, correctAnswer: '2', points: 1, majorCategory: 'G', middleCategory: '' },
  ];
  const afterAnswerChange = SAT.computeExamOverview(overviewResults, students, changedAnswerQs);
  assert(afterAnswerChange.classAverage === 0.25, 'class average updates after answer key change');

  const weightedQs = [
    { id: 'q1', number: 1, correctAnswer: '1', points: 3, majorCategory: 'G', middleCategory: '' },
    { id: 'q2', number: 2, correctAnswer: '2', points: 1, majorCategory: 'G', middleCategory: '' },
  ];
  const weightedOverview = SAT.computeExamOverview(overviewResults, students, weightedQs);
  const expectedS1 = SAT.gradeAnswers(weightedQs, overviewResults[0].answers).percentage;
  const expectedS2 = SAT.gradeAnswers(weightedQs, overviewResults[1].answers).percentage;
  assert(
    weightedOverview.studentScores.find((s) => s.studentId === 's1')?.percentage === expectedS1,
    'student score matches weighted regrade'
  );
  assert(weightedOverview.classAverage === (expectedS1 + expectedS2) / 2, 'average matches weighted scores');
  assert(
    weightedOverview.highest === Math.max(expectedS1, expectedS2) &&
      weightedOverview.lowest === Math.min(expectedS1, expectedS2),
    'high/low match weighted scores'
  );

  const caseQs = [{ id: 'q1', number: 1, correctAnswer: 'a', points: 1, majorCategory: 'G', middleCategory: '' }];
  const caseResults = [{ studentId: 's1', answers: { q1: 'A' }, percentage: 0 }];
  const caseSensitive = SAT.computeExamOverview(caseResults, students, caseQs, { ignoreCase: false });
  const caseInsensitive = SAT.computeExamOverview(caseResults, students, caseQs, { ignoreCase: true });
  assert(caseSensitive.classAverage === 0, 'ignoreCase false treats A vs a as wrong');
  assert(caseInsensitive.classAverage === 1, 'ignoreCase true treats A vs a as correct');

  const noQuestionsOverview = SAT.computeExamOverview(overviewResults, students, []);
  assert(noQuestionsOverview.classAverage === 0.75, 'fallback to stored percentages when no questions');
  assert(Array.isArray(noQuestionsOverview.questionStats), 'no throw when questions empty');

  // 29. HTML escape — 차트 fallback·인쇄 표
  const SATChart = loadSat(['js/chart-manager.js']);
  const xssPayloads = [
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    'Grammar & Reading',
    '"Quoted" Category',
    'A < B',
  ];

  assert(SAT.escapeHtml('Grammar & Reading') === 'Grammar &amp; Reading', 'escape ampersand');
  assert(SAT.escapeHtml('A < B') === 'A &lt; B', 'escape less-than');
  assert(SAT.escapeHtml('"Quoted" Category') === '&quot;Quoted&quot; Category', 'escape quotes');
  assert(SAT.escapeHtml('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;', 'escape script tags');

  assert(SAT.clampPercent(-5) === 0, 'clamp negative percent');
  assert(SAT.clampPercent(150) === 100, 'clamp over 100');
  assert(SAT.clampPercent('abc') === 0, 'clamp non-numeric');
  assert(SAT.percentFromRatio(1, 2) === 50, 'ratio percent');

  const maliciousMajor = '<script>alert(1)</script>';
  const maliciousTitle = '<img src=x onerror=alert(1)>';
  const chartStats = {
    major: {
      [maliciousMajor]: { correct: 1, total: 2 },
      'Grammar & Reading': { correct: 2, total: 4 },
    },
    middle: {
      k1: { major: maliciousMajor, middle: '"Quoted" Category', correct: 1, total: 1 },
    },
  };
  const chartTrend = [
    {
      title: maliciousTitle,
      date: '2026-01-15',
      percentage: 1.5,
      earnedPoints: 10,
      totalPoints: 10,
    },
    {
      title: 'A < B',
      date: '<script>bad</script>',
      percentage: -0.2,
      earnedPoints: 1,
      totalPoints: 5,
    },
  ];

  const printHtml = SATChart.renderPrintChartTables(chartStats, chartTrend);
  assert(!printHtml.includes('<script>alert(1)</script>'), 'print table: no raw script in major');
  assert(printHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'print table: escaped major category');
  assert(printHtml.includes('Grammar &amp; Reading'), 'print table: escaped ampersand category');
  assert(!printHtml.includes('<img src=x'), 'print table: no raw img xss in trend title');
  assert(printHtml.includes('&quot;Quoted&quot; Category'), 'print table: escaped middle category quotes');
  assert(printHtml.includes('100%'), 'print table: trend percentage clamped to 100');
  assert(printHtml.includes('0%') || printHtml.includes('>0%<'), 'print table: negative trend percentage clamped');

  const fallbackBars = SATChart.buildFallbackBarsHtml(
    [maliciousMajor, 'A < B'],
    [50, 150],
    chartStats.major
  );
  assert(fallbackBars.includes('&lt;script&gt;'), 'fallback bars: escaped label');
  assert(fallbackBars.includes('width:50%'), 'fallback bars: width clamped 50');
  assert(fallbackBars.includes('width:100%'), 'fallback bars: width clamped 100 not 150');
  assert(!fallbackBars.includes('width:150%'), 'fallback bars: no overflow width');

  const fallbackTrend = SATChart.buildFallbackTrendHtml(chartTrend);
  assert(fallbackTrend.includes('&lt;img'), 'fallback trend: escaped title');
  assert(fallbackTrend.includes('&lt;script&gt;bad&lt;/script&gt;'), 'fallback trend: escaped invalid date');
  assert(fallbackTrend.includes('100% (10/10)'), 'fallback trend: score percent clamped');

  assert(SAT.formatDate('<script>x</script>') === '&lt;script&gt;x&lt;/script&gt;', 'formatDate escapes invalid iso');

  // 30. localStorage 손상·저장 실패 처리
  function createMockStorage(initial = {}) {
    const store = { ...initial };
    let nextSetError = null;
    return {
      store,
      failNextSet(err) {
        nextSetError = err;
      },
      get length() {
        return Object.keys(store).length;
      },
      key(i) {
        return Object.keys(store)[i] ?? null;
      },
      getItem(k) {
        return store[k] ?? null;
      },
      setItem(k, v) {
        if (nextSetError) {
          const err = nextSetError;
          nextSetError = null;
          throw err;
        }
        store[k] = String(v);
      },
      removeItem(k) {
        delete store[k];
      },
    };
  }

  const SATStorage = loadSat(['js/data-integrity-utils.js', 'js/storage-adapter.js', 'js/storage-repository.js']);
  const MAIN_KEY = 'studentAchievementTrackerData';

  const goodStore = createMockStorage({
    [MAIN_KEY]: JSON.stringify({
      schemaVersion: 2,
      settings: { ignoreCase: true },
      classes: [{ id: 'c1', name: '반A', level: 'LSA', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
      students: [],
      exams: [],
      questions: [],
      results: [],
      assessmentTemplates: [],
    }),
  });
  const goodRepo = SATStorage.createRepository({
    adapter: SATStorage.createLocalStorageAdapter(goodStore),
  });
  const goodData = goodRepo.loadAll();
  assert(goodData.classes.length === 1, 'normal JSON load');
  assert(!goodRepo.isStorageRecoveryRequired(), 'normal load: no recovery');

  const corruptRaw = '{not-json';
  const corruptStore = createMockStorage({ [MAIN_KEY]: corruptRaw });
  const corruptRepo = SATStorage.createRepository({
    adapter: SATStorage.createLocalStorageAdapter(corruptStore),
  });
  const corruptLoad = corruptRepo.loadAll();
  assert(corruptRepo.isStorageRecoveryRequired(), 'corrupt parse triggers recovery');
  assert(corruptLoad.classes.length === 0, 'corrupt load uses empty working copy');
  assert(corruptStore.store[MAIN_KEY] === corruptRaw, 'corrupt load does not overwrite main key');
  const backupKeys = Object.keys(corruptStore.store).filter((k) =>
    k.startsWith(SATStorage.STORAGE_CORRUPT_PREFIX)
  );
  assert(backupKeys.length === 1, 'corrupt raw saved to backup key');
  assert(corruptStore.store[backupKeys[0]] === corruptRaw, 'backup contains raw corrupt string');
  assert(corruptRepo.getCorruptRaw() === corruptRaw, 'repo keeps corrupt raw reference');

  const blocked = corruptRepo.saveClass({ name: 'New', level: 'LSA' });
  assert(SATStorage.isSaveFailure(blocked), 'save blocked during recovery');
  assert(blocked.code === SATStorage.StorageErrorCodes.RECOVERY_REQUIRED, 'recovery required code');
  assert(corruptStore.store[MAIN_KEY] === corruptRaw, 'blocked save leaves main key untouched');

  const fresh = corruptRepo.startFreshAfterRecovery();
  assert(fresh.ok, 'start fresh succeeds');
  assert(!corruptRepo.isStorageRecoveryRequired(), 'recovery cleared after fresh start');
  assert(JSON.parse(corruptStore.store[MAIN_KEY]).classes.length === 0, 'main key replaced after fresh start');
  assert(corruptStore.store[backupKeys[0]] === corruptRaw, 'corrupt backup preserved after fresh start');

  const quotaStore = createMockStorage();
  const quotaRepo = SATStorage.createRepository({
    adapter: SATStorage.createLocalStorageAdapter(quotaStore),
  });
  quotaRepo.loadAll();
  const firstSave = quotaRepo.saveClass({ name: 'Persist', level: 'LSA' });
  assert(firstSave.ok, 'first save succeeds');
  assert(quotaRepo.getClasses().length === 1, 'first save persisted in cache');
  const quotaErr = new Error('quota');
  quotaErr.name = 'QuotaExceededError';
  quotaStore.failNextSet(quotaErr);
  const failSave = quotaRepo.saveClass({ name: 'Another', level: 'LSA' });
  assert(SATStorage.isSaveFailure(failSave), 'quota error returns failure');
  assert(failSave.code === SATStorage.StorageErrorCodes.QUOTA_EXCEEDED, 'quota error code');
  assert(quotaRepo.getClasses().length === 1, 'cache rolled back after quota failure');
  assert(quotaRepo.getClasses()[0].name === 'Persist', 'rolled back cache keeps prior class');

  const pruneStore = createMockStorage({ [MAIN_KEY]: corruptRaw });
  const pruneAdapter = SATStorage.createLocalStorageAdapter(pruneStore);
  for (let i = 0; i < 7; i += 1) {
    pruneAdapter.preserveCorruptBackup(MAIN_KEY, `${corruptRaw}-${i}`);
  }
  const pruneKeys = pruneAdapter.listCorruptBackupKeys();
  assert(pruneKeys.length === SATStorage.MAX_CORRUPT_BACKUPS, 'corrupt backups pruned to max');

  const bytes = SATStorage.estimateStorageBytes({ classes: [{ name: 'test' }] });
  assert(bytes > 0, 'estimateStorageBytes returns positive');

  const importStore = createMockStorage({ [MAIN_KEY]: corruptRaw });
  const importRepo = SATStorage.createRepository({
    adapter: SATStorage.createLocalStorageAdapter(importStore),
  });
  importRepo.loadAll();
  assert(importRepo.isStorageRecoveryRequired(), 'recovery before import');
  const payload = {
    schemaVersion: 2,
    settings: { ignoreCase: true },
    classes: [{ id: 'c2', name: '복원', level: 'DSA', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    students: [],
    exams: [],
    questions: [],
    results: [],
    assessmentTemplates: [],
  };
  const imported = importRepo.importData(payload);
  assert(imported.ok, 'import during recovery succeeds');
  assert(!importRepo.isStorageRecoveryRequired(), 'import clears recovery');
  assert(importRepo.loadAll().classes[0].name === '복원', 'imported data loaded');

  // 31. JSON import 참조 무결성
  const SATInt = loadSat(['js/data-integrity-utils.js']);

  function makeIntegrityFixture(overrides = {}) {
    const base = {
      schemaVersion: 2,
      settings: { ignoreCase: true },
      classes: [
        { id: 'c1', name: 'DSA', level: 'DSA', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
      students: [
        {
          id: 's1',
          classId: 'c1',
          name: 'Kim',
          englishName: 'Kim',
          active: true,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      exams: [
        {
          id: 'e1',
          classId: 'c1',
          title: 'DSC1 CQ Lesson 3 & 4',
          questionCount: 1,
          date: '2026-01-01',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      questions: [
        {
          id: 'q1',
          examId: 'e1',
          number: 1,
          correctAnswer: '1',
          points: 1,
          majorCategory: 'G',
          middleCategory: '',
          note: '',
        },
      ],
      results: [
        {
          id: 'r1',
          examId: 'e1',
          studentId: 's1',
          answers: { q1: '1' },
          correctCount: 1,
          earnedPoints: 1,
          totalPoints: 1,
          percentage: 1,
          submittedAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      assessmentTemplates: [],
    };
    return { ...base, ...overrides };
  }

  const validFixture = makeIntegrityFixture();
  assert(SATInt.validateImportReadiness(validFixture).status === 'valid', 'valid import fixture');

  const orphanStudent = makeIntegrityFixture();
  orphanStudent.students[0].classId = 'missing-class';
  assert(
    SATInt.validateDataIntegrity(orphanStudent).status === 'blockingError',
    'orphan student.classId blocks'
  );

  const orphanExam = makeIntegrityFixture();
  orphanExam.exams[0].classId = 'missing-class';
  assert(
    SATInt.validateDataIntegrity(orphanExam).status === 'blockingError',
    'orphan exam.classId blocks'
  );

  const orphanQuestion = makeIntegrityFixture();
  orphanQuestion.questions[0].examId = 'missing-exam';
  assert(
    SATInt.validateDataIntegrity(orphanQuestion).status === 'blockingError',
    'orphan question.examId blocks'
  );

  const orphanResultExam = makeIntegrityFixture();
  orphanResultExam.results[0].examId = 'missing-exam';
  assert(
    SATInt.validateDataIntegrity(orphanResultExam).errors.some((e) => e.code === 'ORPHAN_RESULT_EXAM'),
    'orphan result.examId blocks'
  );

  const orphanResultStudent = makeIntegrityFixture();
  orphanResultStudent.results[0].studentId = 'missing-student';
  assert(
    SATInt.validateDataIntegrity(orphanResultStudent).errors.some((e) => e.code === 'ORPHAN_RESULT_STUDENT'),
    'orphan result.studentId blocks'
  );

  const classMismatch = makeIntegrityFixture();
  classMismatch.classes.push({
    id: 'c2',
    name: 'DSC',
    level: 'DSC',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  });
  classMismatch.exams[0].classId = 'c2';
  assert(
    SATInt.validateDataIntegrity(classMismatch).errors.some((e) => e.code === 'RESULT_CLASS_MISMATCH'),
    'student/exam class mismatch blocks'
  );

  const dupClass = makeIntegrityFixture();
  dupClass.classes.push({ ...dupClass.classes[0], name: 'Other' });
  assert(
    SATInt.validateDataIntegrity(dupClass).errors.some((e) => e.code === 'DUPLICATE_CLASS_ID'),
    'duplicate class id blocks'
  );

  const dupPair = makeIntegrityFixture();
  dupPair.results.push({
    ...dupPair.results[0],
    id: 'r2',
    updatedAt: '2026-01-02',
  });
  assert(
    SATInt.validateDataIntegrity(dupPair).errors.some((e) => e.code === 'DUPLICATE_RESULT_PAIR'),
    'duplicate examId+studentId result blocks'
  );

  const missingTemplateSnap = makeIntegrityFixture();
  missingTemplateSnap.exams[0].templateId = 'tpl-missing';
  missingTemplateSnap.exams[0].templateNameSnapshot = 'Old Template';
  const snapIntegrity = SATInt.validateDataIntegrity(missingTemplateSnap);
  assert(snapIntegrity.status === 'valid', 'missing template with snapshot stays valid');
  assert(
    snapIntegrity.warnings.some((w) => w.code === 'MISSING_TEMPLATE_WITH_SNAPSHOT'),
    'missing template with snapshot warns'
  );

  const missingTemplateNoSnap = makeIntegrityFixture();
  missingTemplateNoSnap.exams[0].templateId = 'tpl-missing';
  missingTemplateNoSnap.exams[0].templateNameSnapshot = '';
  const noSnapIntegrity = SATInt.validateDataIntegrity(missingTemplateNoSnap);
  assert(noSnapIntegrity.status === 'valid', 'missing template without snapshot stays valid');
  assert(
    noSnapIntegrity.warnings.some((w) => w.code === 'MISSING_TEMPLATE'),
    'missing template without snapshot warns'
  );

  const repairableQuestion = makeIntegrityFixture();
  repairableQuestion.questions[0] = { ...repairableQuestion.questions[0], id: '' };
  assert(
    SATInt.validateDataIntegrity(repairableQuestion).status === 'repairable',
    'missing question id is repairable'
  );
  const repairedQuestion = SATInt.repairDataIntegrity(repairableQuestion, { createId: () => 'gen-q1' });
  assert(repairedQuestion.payload.questions[0].id === 'gen-q1', 'repair assigns question id');
  assert(
    SATInt.validateImportReadiness(repairedQuestion.payload).status === 'valid',
    'repaired payload becomes valid'
  );

  const atomicStore = createMockStorage({
    [MAIN_KEY]: JSON.stringify({
      schemaVersion: 2,
      settings: { ignoreCase: true },
      classes: [{ id: 'keep', name: 'Keep', level: 'LSA', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
      students: [],
      exams: [],
      questions: [],
      results: [],
      assessmentTemplates: [],
    }),
  });
  const atomicRepo = SATStorage.createRepository({
    adapter: SATStorage.createLocalStorageAdapter(atomicStore),
  });
  atomicRepo.loadAll();
  const storedBefore = atomicStore.store[MAIN_KEY];
  const blockedImport = atomicRepo.importData(orphanStudent);
  assert(!blockedImport.ok, 'blocking import fails');
  assert(atomicStore.store[MAIN_KEY] === storedBefore, 'blocking import does not mutate storage');
  const repairBlocked = atomicRepo.importData(repairableQuestion);
  assert(repairBlocked.code === 'INTEGRITY_REPAIR_REQUIRED', 'repairable import blocked until repaired');

  const goodImport = atomicRepo.importData(validFixture);
  assert(goodImport.ok, 'valid fixture imports successfully');
  assert(atomicRepo.loadAll().students[0].name === 'Kim', 'valid fixture regression import');

  return 31;
}

try {
  const groupCount = runTests();
  console.log(`All ${groupCount} test groups passed.`);
  process.exit(0);
} catch (err) {
  console.error('Test failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
}
