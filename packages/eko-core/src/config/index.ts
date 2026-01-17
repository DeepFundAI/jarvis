type GlobalConfig = {
  name: string; // product name
  platform: "windows" | "mac" | "linux";
  maxReactNum: number;
  maxTokens: number;
  maxRetryNum: number;
  agentParallel: boolean;
  compressThreshold: number; // Dialogue context compression threshold (message count)
  compressTokensThreshold: number; // Dialogue context compression threshold (token count)
  largeTextLength: number;
  fileTextMaxLength: number;
  maxDialogueImgFileNum: number;
  toolResultMultimodal: boolean;
  parallelToolCalls: boolean;
  expertMode: boolean;
  expertModeTodoLoopNum: number;
  streamFirstTimeout: number; // Stream first response timeout (ms)
  streamTokenTimeout: number; // Stream token interval timeout (ms)
}

const defaultConfig: GlobalConfig = {
  name: "Eko",
  platform: "mac",
  maxReactNum: 500,
  maxTokens: 16000,
  maxRetryNum: 3,
  agentParallel: false,
  compressThreshold: 80,
  compressTokensThreshold: 80000,
  largeTextLength: 8000,
  fileTextMaxLength: 20000,
  maxDialogueImgFileNum: 1,
  toolResultMultimodal: true,
  parallelToolCalls: true,
  expertMode: false,
  expertModeTodoLoopNum: 10,
  streamFirstTimeout: 30_000,
  streamTokenTimeout: 180_000,
};

let config: GlobalConfig = { ...defaultConfig };

export function mergeGlobalConfig(userConfig?: Partial<GlobalConfig>): void {
  if (userConfig) {
    config = { ...defaultConfig, ...userConfig };
  } else {
    config = { ...defaultConfig };
  }
}

export function getGlobalConfig(): GlobalConfig {
  return config;
}

export default config;