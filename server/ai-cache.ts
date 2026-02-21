import OpenAI from "openai";
import crypto from "crypto";
import { storage } from "./storage";

const PT_BR_INSTRUCTION = "Responda SEMPRE em português brasileiro. Nunca use inglês.";

export const SYSTEM_PROMPTS = {
  electoralAnalyst: `Você é um especialista em análise de dados eleitorais brasileiros do TSE. ${PT_BR_INSTRUCTION} Seja preciso, cite números específicos quando disponíveis. Não invente dados.`,
  politicalForecaster: `Você é um analista político especializado em tendências eleitorais brasileiras. ${PT_BR_INSTRUCTION}`,
  anomalyDetector: `Você é um especialista em detecção de anomalias em dados eleitorais brasileiros. ${PT_BR_INSTRUCTION} NÃO afirme fraude - apenas aponte padrões estatisticamente incomuns.`,
  electoralLawExpert: `Você é um especialista em direito eleitoral brasileiro e análise de eleições proporcionais. ${PT_BR_INSTRUCTION}`,
  sentimentAnalyst: `Você é um analista de sentimento político especializado no cenário brasileiro. ${PT_BR_INSTRUCTION}`,
  campaignStrategist: `Você é um estrategista de campanha eleitoral brasileira. ${PT_BR_INSTRUCTION}`,
  dataAnalyst: `Você é um analista de dados eleitorais especializado no sistema eleitoral brasileiro. ${PT_BR_INSTRUCTION}`,
} as const;

export type ModelTier = "fast" | "standard";

const MODEL_MAP: Record<ModelTier, string> = {
  fast: "gpt-4o-mini",
  standard: "gpt-4o",
};

export function selectModel(tier: ModelTier): string {
  return MODEL_MAP[tier];
}

function generateCacheKey(prefix: string, params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  const hash = crypto.createHash("md5").update(sorted).digest("hex").slice(0, 12);
  return `${prefix}_${hash}`;
}

export interface AiCallOptions {
  cachePrefix?: string;
  cacheParams?: Record<string, unknown>;
  cacheTtlHours?: number;
  model?: ModelTier;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  jsonMode?: boolean;
}

export async function cachedAiCall<T = unknown>(options: AiCallOptions): Promise<{ data: T; fromCache: boolean }> {
  const {
    cachePrefix,
    cacheParams,
    cacheTtlHours = 24,
    model = "standard",
    systemPrompt,
    userPrompt,
    maxTokens,
    jsonMode = true,
  } = options;

  if (cachePrefix && cacheParams) {
    const cacheKey = generateCacheKey(cachePrefix, cacheParams);
    try {
      const cached = await storage.getAiPrediction(cacheKey);
      if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
        return { data: cached.prediction as T, fromCache: true };
      }
    } catch (e) {
      console.warn(`[AI Cache] Cache lookup failed for ${cacheKey}:`, e);
    }
  }

  const openai = new OpenAI();
  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt });

  const completion = await openai.chat.completions.create({
    model: selectModel(model),
    messages,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Sem resposta da IA");
  }

  const data = jsonMode ? (JSON.parse(content) as T) : (content as unknown as T);

  if (cachePrefix && cacheParams) {
    const cacheKey = generateCacheKey(cachePrefix, cacheParams);
    try {
      await storage.saveAiPrediction({
        cacheKey,
        predictionType: cachePrefix,
        prediction: data,
        expiresAt: new Date(Date.now() + cacheTtlHours * 60 * 60 * 1000),
      });
    } catch (e) {
      console.warn(`[AI Cache] Cache save failed for ${cacheKey}:`, e);
    }
  }

  const tokensUsed = completion.usage;
  if (tokensUsed) {
    console.log(`[AI] ${cachePrefix || "call"} | model=${selectModel(model)} | in=${tokensUsed.prompt_tokens} out=${tokensUsed.completion_tokens} total=${tokensUsed.total_tokens}`);
  }

  return { data, fromCache: false };
}
