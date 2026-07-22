// 智能练习：在「智能中心」生成题目集后，通过一次性内存传递给药答题页，
// 避免把大数组塞进 URL。
import { getAdaptiveQuestions, getDueReviewQuestions, getWrongQuestionsNotMastered } from '../db/database'

let _pending = null

export function setSmartSet(questions, meta = {}) { _pending = { questions, meta } }
export function getSmartSet() { return _pending ? _pending.questions : null }
export function getSmartMeta() { return _pending ? _pending.meta : null }
export function clearSmartSet() { _pending = null }

export { getAdaptiveQuestions, getDueReviewQuestions, getWrongQuestionsNotMastered }
