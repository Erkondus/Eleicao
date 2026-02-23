import OpenAI from "openai";
import crypto from "crypto";
import { storage } from "./storage";
import { createAiClient, type ChatMessage } from "./ai-client";
import type { AiProvider, AiTaskKey } from "@shared/schema";
import { AI_TASK_KEYS, AI_TASK_DEFAULTS } from "@shared/schema";

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
  taskKey?: string;
  cachePrefix?: string;
  cacheParams?: Record<string, unknown>;
  cacheTtlHours?: number;
  model?: ModelTier;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  jsonMode?: boolean;
}

interface ResolvedConfig {
  provider: AiProvider | null;
  modelId: string;
  maxTokens?: number;
  temperature?: number;
}

let resolvedConfigCache: Map<string, { config: ResolvedConfig; expiry: number }> = new Map();
const CONFIG_CACHE_TTL = 60_000;

async function resolveProviderAndModel(taskKey: string | undefined, tier: ModelTier): Promise<ResolvedConfig> {
  if (taskKey) {
    const cached = resolvedConfigCache.get(taskKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.config;
    }

    try {
      const taskConfig = await storage.getAiTaskConfig(taskKey);
      if (taskConfig?.enabled) {
        if (taskConfig.providerId && taskConfig.modelId) {
          const provider = await storage.getAiProvider(taskConfig.providerId);
          if (provider?.enabled) {
            const config: ResolvedConfig = {
              provider,
              modelId: taskConfig.modelId,
              maxTokens: taskConfig.maxTokens || undefined,
              temperature: taskConfig.temperature ? parseFloat(taskConfig.temperature) : undefined,
            };
            resolvedConfigCache.set(taskKey, { config, expiry: Date.now() + CONFIG_CACHE_TTL });
            return config;
          }
        }

        if (taskConfig.fallbackProviderId && taskConfig.fallbackModelId) {
          const fallbackProvider = await storage.getAiProvider(taskConfig.fallbackProviderId);
          if (fallbackProvider?.enabled) {
            console.log(`[AI] Task ${taskKey}: primary provider unavailable, using fallback ${fallbackProvider.name}`);
            const config: ResolvedConfig = {
              provider: fallbackProvider,
              modelId: taskConfig.fallbackModelId,
              maxTokens: taskConfig.maxTokens || undefined,
              temperature: taskConfig.temperature ? parseFloat(taskConfig.temperature) : undefined,
            };
            resolvedConfigCache.set(taskKey, { config, expiry: Date.now() + CONFIG_CACHE_TTL });
            return config;
          }
        }
      }
    } catch (e) {
      console.warn(`[AI] Failed to resolve task config for ${taskKey}:`, e);
    }
  }

  try {
    const defaultProvider = await storage.getDefaultAiProvider();
    if (defaultProvider) {
      return { provider: defaultProvider, modelId: selectModel(tier) };
    }
  } catch (e) {
    // fallback to direct OpenAI
  }

  return { provider: null, modelId: selectModel(tier) };
}

export function clearAiConfigCache() {
  resolvedConfigCache.clear();
}

async function executeAiCall(
  provider: AiProvider | null,
  modelId: string,
  messages: ChatMessage[],
  jsonMode: boolean,
  maxTokens?: number,
  temperature?: number,
): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number }; providerName: string; usedModel: string }> {
  if (provider) {
    const client = createAiClient(provider);
    const result = await client.chatCompletion({
      model: modelId,
      messages,
      jsonMode,
      maxTokens,
      temperature,
    });
    return {
      content: result.content,
      usage: result.usage,
      providerName: result.provider,
      usedModel: result.model,
    };
  }

  const openai = new OpenAI();
  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const completion = await openai.chat.completions.create({
    model: modelId,
    messages: openaiMessages,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
  });

  return {
    content: completion.choices[0]?.message?.content || "",
    usage: completion.usage ? {
      promptTokens: completion.usage.prompt_tokens,
      completionTokens: completion.usage.completion_tokens,
      totalTokens: completion.usage.total_tokens,
    } : undefined,
    providerName: "OpenAI (direto)",
    usedModel: modelId,
  };
}

export async function cachedAiCall<T = unknown>(options: AiCallOptions): Promise<{ data: T; fromCache: boolean }> {
  const {
    taskKey: explicitTaskKey,
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

  const taskKey = explicitTaskKey || (cachePrefix && (AI_TASK_KEYS as readonly string[]).includes(cachePrefix) ? cachePrefix : undefined);
  const resolved = await resolveProviderAndModel(taskKey, model);

  const taskDefaults = taskKey ? AI_TASK_DEFAULTS[taskKey as AiTaskKey] : undefined;
  const effectiveMaxTokens = resolved.maxTokens || maxTokens || taskDefaults?.maxTokens;
  const effectiveTemperature = resolved.temperature ?? taskDefaults?.temperature;

  const messages: ChatMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt });

  const result = await executeAiCall(
    resolved.provider,
    resolved.modelId,
    messages,
    jsonMode,
    effectiveMaxTokens,
    effectiveTemperature,
  );

  if (!result.content) {
    throw new Error("Sem resposta da IA");
  }

  const data = jsonMode ? (JSON.parse(result.content) as T) : (result.content as unknown as T);

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

  if (result.usage) {
    console.log(`[AI] ${cachePrefix || taskKey || "call"} | provider=${result.providerName} model=${result.usedModel} | in=${result.usage.promptTokens} out=${result.usage.completionTokens} total=${result.usage.totalTokens}`);
  }

  return { data, fromCache: false };
}
