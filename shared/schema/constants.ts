export const ALL_PERMISSIONS = [
  "manage_users",
  "manage_parties",
  "manage_candidates",
  "manage_scenarios",
  "run_simulations",
  "view_audit",
  "ai_predictions",
  "ai_config",
  "export_reports",
  "import_tse",
  "import_ibge",
  "sentiment_analysis",
  "semantic_search",
  "manage_campaigns",
  "manage_dashboards",
  "report_automation",
  "admin_system",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_users: "Gerenciar Usuários",
  manage_parties: "Gerenciar Partidos",
  manage_candidates: "Gerenciar Candidatos",
  manage_scenarios: "Gerenciar Cenários",
  run_simulations: "Executar Simulações",
  view_audit: "Visualizar Auditoria",
  ai_predictions: "Previsões e Insights IA",
  ai_config: "Configurar Provedores IA",
  export_reports: "Exportar Relatórios",
  import_tse: "Importar Dados TSE",
  import_ibge: "Importar Dados IBGE",
  sentiment_analysis: "Análise de Sentimento",
  semantic_search: "Busca Semântica",
  manage_campaigns: "Gestão de Campanhas",
  manage_dashboards: "Dashboards e Análises",
  report_automation: "Automação de Relatórios",
  admin_system: "Administração do Sistema",
};

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  {
    label: "Dados Eleitorais",
    permissions: ["manage_parties", "manage_candidates", "manage_scenarios", "run_simulations"],
  },
  {
    label: "Inteligência Artificial",
    permissions: ["ai_predictions", "ai_config", "sentiment_analysis", "semantic_search"],
  },
  {
    label: "Importação e Relatórios",
    permissions: ["import_tse", "import_ibge", "export_reports", "report_automation"],
  },
  {
    label: "Campanhas e Dashboards",
    permissions: ["manage_campaigns", "manage_dashboards"],
  },
  {
    label: "Administração",
    permissions: ["manage_users", "view_audit", "admin_system"],
  },
];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  admin: [...ALL_PERMISSIONS],
  analyst: [
    "manage_parties", "manage_candidates", "manage_scenarios", "run_simulations",
    "ai_predictions", "export_reports", "sentiment_analysis", "semantic_search",
    "manage_campaigns", "manage_dashboards", "report_automation",
  ],
  viewer: ["run_simulations", "export_reports", "manage_dashboards"],
};

export const AI_PROVIDER_TYPES = ["openai", "anthropic", "gemini", "openai_compatible"] as const;
export type AiProviderType = typeof AI_PROVIDER_TYPES[number];

export const AI_TASK_KEYS = [
  "scenario_predict",
  "historical_predict",
  "data_validation",
  "semantic_search",
  "anomaly_detect",
  "ai_suggestions",
  "sentiment_analysis",
  "article_enrichment",
  "article_sentiment",
  "entity_comparison",
  "electoral_insights",
  "forecast_narrative",
  "voter_turnout",
  "candidate_success",
  "party_performance",
  "election_forecast",
  "assistant",
  "embeddings",
] as const;
export type AiTaskKey = typeof AI_TASK_KEYS[number];

export const AI_TASK_LABELS: Record<AiTaskKey, string> = {
  scenario_predict: "Predição de Cenário",
  historical_predict: "Predição Histórica",
  data_validation: "Validação de Dados",
  semantic_search: "Busca Semântica",
  anomaly_detect: "Detecção de Anomalias",
  ai_suggestions: "Sugestões de IA",
  sentiment_analysis: "Análise de Sentimento",
  article_enrichment: "Enriquecimento de Artigos",
  article_sentiment: "Sentimento de Artigos",
  entity_comparison: "Comparação de Entidades",
  electoral_insights: "Insights Eleitorais",
  forecast_narrative: "Narrativa de Previsão",
  voter_turnout: "Comparecimento Eleitoral",
  candidate_success: "Sucesso de Candidatos",
  party_performance: "Desempenho Partidário",
  election_forecast: "Previsão Eleitoral",
  assistant: "Assistente Geral",
  embeddings: "Embeddings (Vetores)",
};

export const AI_TASK_DEFAULTS: Record<AiTaskKey, { maxTokens: number; temperature: number }> = {
  scenario_predict: { maxTokens: 4000, temperature: 0.7 },
  historical_predict: { maxTokens: 4000, temperature: 0.7 },
  data_validation: { maxTokens: 2000, temperature: 0.3 },
  semantic_search: { maxTokens: 1000, temperature: 0.5 },
  anomaly_detect: { maxTokens: 1500, temperature: 0.3 },
  ai_suggestions: { maxTokens: 1000, temperature: 0.8 },
  sentiment_analysis: { maxTokens: 2000, temperature: 0.5 },
  article_enrichment: { maxTokens: 500, temperature: 0.5 },
  article_sentiment: { maxTokens: 500, temperature: 0.3 },
  entity_comparison: { maxTokens: 1500, temperature: 0.5 },
  electoral_insights: { maxTokens: 3000, temperature: 0.7 },
  forecast_narrative: { maxTokens: 1000, temperature: 0.7 },
  voter_turnout: { maxTokens: 2000, temperature: 0.5 },
  candidate_success: { maxTokens: 2000, temperature: 0.5 },
  party_performance: { maxTokens: 2000, temperature: 0.5 },
  election_forecast: { maxTokens: 3000, temperature: 0.7 },
  assistant: { maxTokens: 2000, temperature: 0.7 },
  embeddings: { maxTokens: 300, temperature: 0 },
};

export const AI_TASK_DEFAULT_TIER: Record<AiTaskKey, "fast" | "standard"> = {
  scenario_predict: "standard",
  historical_predict: "standard",
  data_validation: "standard",
  semantic_search: "fast",
  anomaly_detect: "fast",
  ai_suggestions: "fast",
  sentiment_analysis: "standard",
  article_enrichment: "fast",
  article_sentiment: "fast",
  entity_comparison: "fast",
  electoral_insights: "standard",
  forecast_narrative: "fast",
  voter_turnout: "standard",
  candidate_success: "standard",
  party_performance: "standard",
  election_forecast: "standard",
  assistant: "fast",
  embeddings: "fast",
};
