import { z } from 'zod';
import { createScorer } from '@mastra/core/scores';
import { extractKeywords, extractLimit, extractLocation, extractLevel } from '../utils/keyword-extractor.js';

/*
	jobs-scorer.ts

	Mastra scorer that evaluates an agent's response to a user's job query.
	It checks relevance to the user's role/skills, correctness of job details,
	tone, and whether actionable next steps/links are provided.

	Pipeline methods:
	- preprocess: extract user and assistant text from the run
	- analyze: ask an LLM judge to produce structured component scores (0-1)
	- generateScore: combine component scores into a single 0-1 score
	- generateReason: human-readable explanation for the assigned score

	The scorer uses an LLM judge (openai/gpt-4o-mini) to perform the textual
	analysis and returns a numeric score between 0 and 1.
*/

export const jobsScorer = createScorer({
	name: 'Jobs Response Quality',
	description:
		"Evaluates how relevant, correct, and professionally toned a job-search assistant's response is. Returns a 0-1 score (higher is better).",
	type: 'agent',
	judge: {
		// Use GPT-4o-mini (or equivalent) as the internal judge model.
		model: 'openai/gpt-4o-mini',
		instructions:
			'You are an expert evaluator of assistant responses to job-seeking queries. ' +
			'Given the user query and the assistant response, produce a JSON object that scores the response on these axes (0-1): relevance, correctness, tone, actionable, and a confidence value. ' +
			'Relevance: how well the response matches the user\'s stated role/skills and query intent. ' +
			'Correctness: factual correctness of job details (title, company, location, requirements). ' +
			'Tone: professional/helpful and not overconfident. ' +
			'Actionable: whether the assistant provided concrete next steps, links, or contact/actionable advice. ' +
			'Be concise in the explanation. Return ONLY the JSON object matching the schema provided. ' +
			'Values must be numbers between 0 and 1 (inclusive).'
	}
})
	.preprocess(({ run }) => {
		// Extract user message text and assistant response text from the run object.
		// These fields are typical in Mastra runs: inputMessages and output array.
		const userText = (run.input?.inputMessages?.[0]?.content as string) || '';
		const assistantText = (run.output?.[0]?.content as string) || '';
		// Return values become available to later steps under preprocessStepResult
		return { userText, assistantText };
	})
	.analyze({
		description:
			'Use an LLM judge to rate relevance, correctness, tone, and actionable guidance (0-1 each) and provide an explanation.',
		// Define the expected structured output from the judge LLM.
		outputSchema: z.object({
			relevance: z.number().min(0).max(1),
			correctness: z.number().min(0).max(1),
			tone: z.number().min(0).max(1),
			actionable: z.number().min(0).max(1),
			confidence: z.number().min(0).max(1).default(1),
			explanation: z.string().default(''),
		}),
		// Build the prompt given the preprocessed texts. The judge must return JSON.
		createPrompt: ({ results }) => {
			const userText = results.preprocessStepResult?.userText || '';
			const assistantText = results.preprocessStepResult?.assistantText || '';
			return `User query:\n"""\n${userText}\n"""\n\nAssistant response:\n"""\n${assistantText}\n"""\n\nPlease evaluate the assistant response for the user query above. Return a JSON object with these fields (numbers 0-1):\n{\n  "relevance": number,      // matches user role/skills and intent\n  "correctness": number,    // factual correctness of job details (title/company/location/requirements)\n  "tone": number,           // professional, helpful, not overconfident\n  "actionable": number,     // provided concrete next steps or useful links\n  "confidence": number,     // your confidence in these assessments (0-1)\n  "explanation": string     // short human-readable rationale (1-2 sentences)\n}\n\nBe concise and return only valid JSON that matches the schema above.`;
		},
	})
	.generateScore(({ results }) => {
		// Combine the judge's component scores into a single 0-1 score.
		const r: any = (results as any)?.analyzeStepResult || {};
		// If analysis missing, return neutral score 0.5
		if (!r || typeof r.relevance !== 'number') return 0.5;

		const relevance = Math.max(0, Math.min(1, r.relevance ?? 0));
		const correctness = Math.max(0, Math.min(1, r.correctness ?? 0));
		const tone = Math.max(0, Math.min(1, r.tone ?? 0));
		const actionable = Math.max(0, Math.min(1, r.actionable ?? 0));
		const confidence = Math.max(0, Math.min(1, r.confidence ?? 1));

		// Weighted combination: prioritize correctness and relevance.
		const scoreRaw =
			relevance * 0.35 + correctness * 0.4 + tone * 0.15 + actionable * 0.1;

		// Apply confidence as a multiplier, clamp to [0,1]
		const finalScore = Math.max(0, Math.min(1, scoreRaw * confidence));
		return finalScore;
	})
	.generateReason(({ results, score }) => {
		// Produce a short explanation describing the numeric breakdown.
		const r: any = (results as any)?.analyzeStepResult || {};
		const relevance = typeof r.relevance === 'number' ? r.relevance.toFixed(2) : 'n/a';
		const correctness = typeof r.correctness === 'number' ? r.correctness.toFixed(2) : 'n/a';
		const tone = typeof r.tone === 'number' ? r.tone.toFixed(2) : 'n/a';
		const actionable = typeof r.actionable === 'number' ? r.actionable.toFixed(2) : 'n/a';
		const confidence = typeof r.confidence === 'number' ? r.confidence.toFixed(2) : 'n/a';
		const explanation = (r.explanation || '').trim();

		return `Score=${(score ?? 0).toFixed(2)} (relevance=${relevance}, correctness=${correctness}, tone=${tone}, actionable=${actionable}, confidence=${confidence}). ${explanation}`;
	});

/*
	keywordRelevanceScorer

	Evaluates how well the agent:
	1. Extracted relevant keywords from the user query
	2. Selected the appropriate tool (rssTool for job searches)
	3. Used correct parameters (query, limit) for the tool call

	This scorer runs on the agent's tool invocation and intermediate states,
	not just the final response. It helps debug if the agent makes poor keyword
	extraction or tool selection decisions.
*/
export const keywordRelevanceScorer = createScorer({
	name: 'Keyword Relevance & Tool Selection',
	description:
		'Evaluates if the agent extracted relevant keywords from user input and selected the correct tool (rssTool) with appropriate parameters (query + limit). Returns 0-1 score.',
	type: 'agent',
	judge: {
		model: 'openai/gpt-4o-mini',
		instructions:
			'You are an expert evaluator of keyword extraction and tool selection in job search queries. ' +
			'Given the user query and information about tool calls made, evaluate: ' +
			'1) Keyword relevance: Are extracted keywords representative of user intent? ' +
			'2) Tool appropriateness: Is rssTool the right choice for this query? ' +
			'3) Parameter correctness: Are query and limit parameters reasonable? ' +
			'Return a JSON object with scores (0-1) for each dimension and a brief explanation. ' +
			'A perfect score means: high-quality keywords extracted, rssTool correctly selected, ' +
			'reasonable query and limit parameters set.'
	}
})
	.preprocess(({ run }) => {
		// Extract user message and any tool calls from the run
		const userText = (run.input?.inputMessages?.[0]?.content as string) || '';
		
		// Try to extract tool call information from the response
		let toolName = 'rssTool'; // Default to rssTool since that's what jobs agent uses
		let toolParams: any = {};
		
		// Check if there are tool results (indicating a tool was called)
		if (run.output && Array.isArray(run.output) && run.output.length > 0) {
			const firstOutput = run.output[0] as any;
			toolParams = firstOutput?.metadata || {};
			toolName = firstOutput?.toolName || 'rssTool';
		}

		// NOW: Independently extract what parameters SHOULD have been extracted
		const correctLimit = extractLimit(userText);
		const correctLocation = extractLocation(userText);
		const correctLevel = extractLevel(userText);
		const correctKeywords = extractKeywords(userText);
		
		// Compare what agent sent vs what should have been extracted
		const agentLimit = toolParams.limit ?? 10;
		const agentLocation = toolParams.location ?? null;
		const agentQuery = toolParams.query || userText;
		
		// Calculate parameter extraction accuracy
		const limitMatches = agentLimit === correctLimit;
		const locationMatches = (agentLocation === correctLocation);
		
		
		return { 
			userText, 
			toolName, 
			toolParams,
			correctLimit,
			correctLocation,
			correctLevel,
			correctKeywords,
			limitMatches,
			locationMatches,
		};
	})
	.analyze({
		description:
			'Evaluates parameter extraction accuracy by comparing agent parameters with independently extracted correct values',
		outputSchema: z.object({
			keywordQuality: z.number().min(0).max(1).describe('How well keywords represent user intent'),
			toolAppropriate: z.boolean().describe('Is rssTool the right choice?'),
			parameterQuality: z.number().min(0).max(1).describe('How well did agent extract limit and location?'),
			confidence: z.number().min(0).max(1).default(0.9),
			explanation: z.string().default(''),
		}),
		createPrompt: ({ results }) => {
			const preprocessResult = (results as any)?.preprocessStepResult || {};
			const userText = preprocessResult.userText || '';
			const toolName = preprocessResult.toolName || 'rssTool';
			const toolParams = preprocessResult.toolParams || {};
			const correctLimit = preprocessResult.correctLimit;
			const correctLocation = preprocessResult.correctLocation;
			const correctKeywords = preprocessResult.correctKeywords || [];
			const limitMatches = preprocessResult.limitMatches;
			const locationMatches = preprocessResult.locationMatches;

			return `User query:
"""
${userText}
"""

Tool invoked: ${toolName}
Tool parameters sent by agent: ${JSON.stringify(toolParams, null, 2)}

CORRECT EXTRACTION (independently calculated):
- Correct limit: ${correctLimit}
- Correct location: ${correctLocation}
- Keywords should include: [${correctKeywords.join(', ')}]

AGENT'S EXTRACTION ACCURACY:
- Limit matches correct? ${limitMatches ? 'YES ✅' : 'NO ❌'} (Agent sent: ${toolParams.limit ?? 10}, Correct: ${correctLimit})
- Location matches correct? ${locationMatches ? 'YES ✅' : 'NO ❌'} (Agent sent: ${toolParams.location ?? 'null'}, Correct: ${correctLocation})

Please evaluate:
1. "keywordQuality" (0-1): Do the keywords in the user query represent clear job intent?
   1.0 = Very specific job role/technology
   0.5 = General job keywords
   0.0 = No job-related keywords

2. "toolAppropriate" (true/false): Is rssTool the right choice?
   Should be TRUE for job search queries.

3. "parameterQuality" (0-1): Did the agent correctly extract limit and location?
   1.0 = Both limit AND location correctly extracted (or correctly identified as missing)
   0.75 = One of limit/location correct
   0.5 = Neither extracted correctly, but attempted reasonable defaults
   0.0 = Parameters make no sense

4. "confidence": Your confidence in this evaluation (0-1)

Return JSON matching schema:
{
  "keywordQuality": number,
  "toolAppropriate": boolean,
  "parameterQuality": number,
  "confidence": number,
  "explanation": string
}`;
		},
	})
	.generateScore(({ results }) => {
		// Combine keyword quality, tool appropriateness, and parameter quality
		const r: any = (results as any)?.analyzeStepResult || {};
		
		if (!r || typeof r.keywordQuality !== 'number') return 0.5;

		const keywordQuality = Math.max(0, Math.min(1, r.keywordQuality ?? 0));
		const parameterQuality = Math.max(0, Math.min(1, r.parameterQuality ?? 0));
		const toolAppropriate = r.toolAppropriate === true ? 1 : 0; // Binary
		const confidence = Math.max(0, Math.min(1, r.confidence ?? 0.9));

		// Weighted combination
		// Tool appropriateness is critical (50%)
		// Keywords and parameters are equally important (25% each)
		const scoreRaw =
			toolAppropriate * 0.5 + keywordQuality * 0.25 + parameterQuality * 0.25;

		// Apply confidence multiplier
		const finalScore = Math.max(0, Math.min(1, scoreRaw * confidence));
		return finalScore;
	})
	.generateReason(({ results, score }) => {
		// Detailed explanation of keyword and tool selection scoring
		const r: any = (results as any)?.analyzeStepResult || {};
		
		const keywordQuality = typeof r.keywordQuality === 'number' ? r.keywordQuality.toFixed(2) : 'n/a';
		const parameterQuality = typeof r.parameterQuality === 'number' ? r.parameterQuality.toFixed(2) : 'n/a';
		const toolAppropriate = r.toolAppropriate === true ? '✓ YES' : '✗ NO';
		const confidence = typeof r.confidence === 'number' ? r.confidence.toFixed(2) : 'n/a';
		const explanation = (r.explanation || '').trim();

		return `Score=${(score ?? 0).toFixed(2)} | Keywords=${keywordQuality}, Tool=${toolAppropriate}, Parameters=${parameterQuality}, Confidence=${confidence}. ${explanation}`;
	});

export const scorers = { jobsScorer, keywordRelevanceScorer };

