import { getQuestionById, getQuestionsByCategory, getRandomQuestions } from '../db/database';

// Shuffle array using Fisher-Yates
export function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Generate a random permutation for options (A, B, C, D)
export function shuffleOptions() {
  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

// Map shuffled option index back to original letter
export function mapToOriginalAnswer(shuffledIndices, selectedIndex) {
  const letters = ['A', 'B', 'C', 'D'];
  return letters[shuffledIndices[selectedIndex]];
}

// Get option letters in shuffled order
export function getShuffledOptionLetters(shuffledIndices) {
  const letters = ['A', 'B', 'C', 'D'];
  return shuffledIndices.map(i => letters[i]);
}

export function prepareQuestionForDisplay(question, optionShuffle = true) {
  const options = [
    { key: 'A', text: question.option_a },
    { key: 'B', text: question.option_b },
    { key: 'C', text: question.option_c },
    { key: 'D', text: question.option_d }
  ];

  if (optionShuffle) {
    const shuffleIndices = shuffleOptions();
    const shuffledOptions = shuffleIndices.map(i => options[i]);
    return {
      ...question,
      displayOptions: shuffledOptions,
      shuffleMap: shuffleIndices
    };
  }

  return {
    ...question,
    displayOptions: options,
    shuffleMap: [0, 1, 2, 3]
  };
}

export function checkAnswer(question, userAnswer, shuffleMap) {
  const correctAnswer = question.answer.toUpperCase().trim();
  let userAnswerNormalized = '';

  if (Array.isArray(userAnswer)) {
    // Multiple choice
    const mappedAnswers = userAnswer.map(idx => {
      const letters = ['A', 'B', 'C', 'D'];
      return letters[shuffleMap[idx]];
    });
    userAnswerNormalized = mappedAnswers.sort().join('');
  } else {
    // Single choice
    const letters = ['A', 'B', 'C', 'D'];
    const idx = typeof userAnswer === 'number' ? userAnswer : parseInt(userAnswer);
    userAnswerNormalized = letters[shuffleMap[idx]] || '';
  }

  return {
    isCorrect: userAnswerNormalized === correctAnswer,
    userAnswer: userAnswerNormalized,
    correctAnswer
  };
}

export function getQuestionsForPractice(categoryId, count = 20) {
  const total = getQuestionsByCategory(categoryId).length;
  if (total <= count) {
    return shuffleArray(getQuestionsByCategory(categoryId));
  }
  return getRandomQuestions(categoryId, count);
}
