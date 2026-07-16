/**
 * Node test runner — loads window.SAT scripts via vm (same as browser file:// flow).
 * Run: node js/test-logic.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadSat(extraFiles = []) {
  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  const files = [
    'js/constants.js',
    'js/utils.js',
    'js/category-utils.js',
    'js/assessment-manager.js',
    ...extraFiles,
  ];
  for (const file of files) {
    const code = readFileSync(join(root, file), 'utf8');
    vm.runInThisContext(code, { filename: file });
  }
  return sandbox.window.SAT;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

console.log('All 14 test groups passed.');
