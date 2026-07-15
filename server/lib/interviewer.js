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

const INTERVIEWER_SYSTEM =
  "You are conducting a live, spoken mock interview for a software engineering candidate, standing in " +
  "for a human interviewer. Ask one question at a time — a mix of behavioral and technical/problem-solving " +
  "questions appropriate for a general software role. The candidate's answers arrive as speech-to-text " +
  "transcriptions, which may contain minor transcription errors — read past small glitches rather than " +
  "commenting on them. Ask a natural, specific follow-up based on what the candidate actually said, the way " +
  "a real interviewer would. Keep your own questions concise, one or two sentences, since they are spoken " +
  "aloud via text-to-speech. After 5 to 7 questions covering a reasonable range of topics, wrap up warmly " +
  "and set interviewComplete to true on that final reply instead of asking another question.\n\n" +
  'Respond with ONLY a raw JSON object of this exact shape, no markdown fences, no extra text: ' +
  '{"reply": string, "interviewComplete": boolean}';

const EVALUATOR_SYSTEM =
  "You are grading a completed live interview transcript. Be fair, specific, and evidence-based — cite " +
  "what the candidate actually said.\n\n" +
  'Respond with ONLY a raw JSON object of this exact shape, no markdown fences, no extra text: ' +
  '{"score": <integer 0-100>, "summary": <string, 2-3 sentences>, "strengths": <string array, 2-4 items>, ' +
  '"areasToImprove": <string array, 2-4 items>}';

function toApiMessages(transcriptMessages) {
  return transcriptMessages.map((m) => ({ role: m.role, content: m.text }));
}

function parseJsonResponse(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

export async function generateInterviewerTurn(transcriptMessages) {
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: INTERVIEWER_SYSTEM }, ...toApiMessages(transcriptMessages)],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = parseJsonResponse(raw);
  return {
    reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply : 'Could you tell me a bit more about that?',
    interviewComplete: parsed.interviewComplete === true,
  };
}

export async function generateInterviewEvaluation(transcriptMessages) {
  const transcriptText = transcriptMessages
    .map((m) => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.text}`)
    .join('\n\n');

  const completion = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: EVALUATOR_SYSTEM },
      { role: 'user', content: `Here is the full interview transcript:\n\n${transcriptText}\n\nEvaluate the candidate's performance.` },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = parseJsonResponse(raw);
  return {
    score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 0,
    summary: typeof parsed.summary === 'string' ? parsed.summary : 'No summary available.',
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((s) => typeof s === 'string') : [],
    areasToImprove: Array.isArray(parsed.areasToImprove) ? parsed.areasToImprove.filter((s) => typeof s === 'string') : [],
  };
}
