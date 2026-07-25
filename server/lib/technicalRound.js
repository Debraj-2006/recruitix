import Groq from 'groq-sdk';

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('Missing GROQ_API_KEY environment variable.');
    }
    client = new Groq();
  }
  return client;
}

// Free-tier Groq model — fast, good instruction-following for conversational JSON output.
const MODEL = 'llama-3.3-70b-versatile';

const QUESTION_GEN_SYSTEM =
  'You are a technical interviewer designing a screening exam for a general software engineering role. ' +
  'Generate a fresh, varied set of questions covering data structures & algorithms, quantitative reasoning, ' +
  'and logical aptitude — the kind of material used in campus/entry-level technical screenings. Vary the ' +
  'specific questions, numbers, and wording each time so no two generated exams are identical.\n\n' +
  'Produce exactly 19 multiple-choice questions and 5 open-ended coding questions.\n\n' +
  'For each MCQ: category is one of "DSA", "Aptitude", or "Quant"; exactly 4 plausible options with only one ' +
  'correct; points is 1 for Aptitude/Quant, 2 for DSA.\n' +
  'For each coding question: category is "DSA"; a one- or two-sentence prompt describing a classic coding ' +
  'problem (e.g. reverse a linked list, detect a cycle, binary search, merge intervals); a short rubric ' +
  'string in correctAnswer describing the expected correct approach (used only for grading, never shown to ' +
  'the candidate); points between 3 and 5.\n\n' +
  'Respond with ONLY a raw JSON object of this exact shape, no markdown fences, no extra text: ' +
  '{"questions": [{"qtype": "mcq"|"coding", "category": string, "prompt": string, ' +
  '"options": string[]|null, "correctAnswer": string, "points": number}]}';

const GRADING_SYSTEM =
  "You are grading one candidate's written answer to a technical coding question in a screening exam. " +
  'You are given the question, a brief rubric describing the expected correct approach, and the ' +
  "candidate's answer (which may be pseudocode, prose, or real code — any of these are acceptable if the " +
  'approach is correct). Judge whether the approach and reasoning are correct, not formatting or syntax ' +
  'perfection.\n\n' +
  'Respond with ONLY a raw JSON object of this exact shape, no markdown fences, no extra text: ' +
  '{"scoreFraction": <number 0 to 1>, "feedback": <string, 1 sentence>}';

function parseJsonResponse(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

function sanitizeQuestions(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((q) => q && (q.qtype === 'mcq' || q.qtype === 'coding') && typeof q.prompt === 'string' && q.prompt.trim())
    .map((q) => ({
      qtype: q.qtype,
      category: typeof q.category === 'string' && q.category.trim() ? q.category.trim() : 'General',
      prompt: q.prompt.trim(),
      options: q.qtype === 'mcq' && Array.isArray(q.options) ? q.options.filter((o) => typeof o === 'string') : null,
      correctAnswer: typeof q.correctAnswer === 'string' ? q.correctAnswer : '',
      points: typeof q.points === 'number' && q.points > 0 ? q.points : q.qtype === 'mcq' ? 1 : 3,
    }));
}

export async function generateTechnicalQuestions() {
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0.9,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: QUESTION_GEN_SYSTEM },
      { role: 'user', content: 'Generate the exam now.' },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const questions = sanitizeQuestions(parseJsonResponse(raw).questions);
  if (questions.length === 0) throw new Error('Model returned no usable questions.');
  return questions;
}

export async function gradeCodingAnswer(question, answer) {
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: GRADING_SYSTEM },
      {
        role: 'user',
        content:
          `Question: ${question.prompt}\n\n` +
          `Expected approach (rubric): ${question.correctAnswer || 'N/A'}\n\n` +
          `Candidate's answer:\n${answer || '(no answer given)'}\n\nGrade this answer.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = parseJsonResponse(raw);
  const scoreFraction = typeof parsed.scoreFraction === 'number' ? Math.max(0, Math.min(1, parsed.scoreFraction)) : 0;
  return { scoreFraction, feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '' };
}
