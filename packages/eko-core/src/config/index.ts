import { Config } from "../types";

const defaultConfig: Config = {
  name: "Eko",
  mode: "normal",
  platform: "mac",
  maxReactNum: 500,
  maxOutputTokens: 16000,
  maxRetryNum: 3,
  agentParallel: false,
  workflowConfirm: false,
  compressThreshold: 80,
  compressTokensThreshold: 80000,
  largeTextLength: 8000,
  fileTextMaxLength: 20000,
  maxDialogueImgFileNum: 1,
  toolResultMultimodal: true,
  parallelToolCalls: true,
  markImageMode: "draw",
  expertModeTodoLoopNum: 10,
  streamFirstTimeout: 30_000,
  streamTokenTimeout: 180_000,
  memoryConfig: {
    maxMessageNum: 15,
    maxInputTokens: 64000,
    enableCompression: true,
    compressionThreshold: 10,
    compressionMaxLength: 6000,
  },
};

let config: Config = { ...defaultConfig };

export function mergeGlobalConfig(userConfig?: Partial<Config>): void {
  if (userConfig) {
    config = { ...defaultConfig, ...userConfig };
  } else {
    config = { ...defaultConfig };
  }
}

export function getGlobalConfig(): Config {
  return config;
}

export default config;