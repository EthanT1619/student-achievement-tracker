/**
 * Application constants — single source for names and keys.
 */
(function (SAT) {
  SAT.APP_NAME = 'Student Achievement Tracker';
  SAT.APP_SHORT_NAME = 'Achievement Tracker';
  SAT.STORAGE_KEY = 'studentAchievementTrackerData';
  SAT.SCHEMA_VERSION = 1;
  SAT.DEFAULT_EXAM_TYPE = 'CQ';

  /** Initial suggestions only — not enforced limits. */
  SAT.DEFAULT_MAJOR_SUGGESTIONS = [
    'Reading Comprehension',
    'Dialogue',
    'Grammar',
  ];

  SAT.DEFAULT_MIDDLE_SUGGESTIONS = [
    'Main Idea',
    'Detail',
    'Inference',
    'Vocabulary in Context',
    'Reference',
    'Sequence',
    'Appropriate Response',
    'Situation',
    'Intention',
    'Key Expression',
    'Present Perfect',
    'Countable / Uncountable',
    'Subject-Verb Agreement',
    'Tense',
    'Modal Verbs',
    'Pronouns',
    'Prepositions',
    'Sentence Structure',
  ];

  /** @deprecated Use DEFAULT_MAJOR_SUGGESTIONS — kept for backward compatibility */
  SAT.MAJOR_CATEGORIES = SAT.DEFAULT_MAJOR_SUGGESTIONS;

  SAT.ANSWER_OPTIONS_NUMERIC = ['1', '2', '3', '4', '5'];
  SAT.ANSWER_OPTIONS_ALPHA = ['A', 'B', 'C', 'D', 'E'];
})(window.SAT = window.SAT || {});
