/**
 * Apply LangSmith configuration to process.env so that LangGraph/LangChain
 * auto-tracing activates for all subsequent LLM and graph invocations.
 *
 * Call this before starting any conversation turn when LangSmith is enabled.
 */
export function applyLangSmithEnv(config: {
  enabled: boolean;
  apiKey: string | null;
  projectName: string;
  endpoint: string | null;
}): void {
  if (!config.enabled || config.apiKey === null) {
    process.env['LANGCHAIN_TRACING_V2'] = 'false';
    return;
  }

  process.env['LANGCHAIN_TRACING_V2'] = 'true';
  process.env['LANGSMITH_TRACING'] = 'true';
  process.env['LANGCHAIN_API_KEY'] = config.apiKey;
  process.env['LANGSMITH_API_KEY'] = config.apiKey;
  process.env['LANGCHAIN_PROJECT'] = config.projectName;
  process.env['LANGSMITH_PROJECT'] = config.projectName;

  if (config.endpoint !== null) {
    process.env['LANGCHAIN_ENDPOINT'] = config.endpoint;
    process.env['LANGSMITH_ENDPOINT'] = config.endpoint;
  }
}
