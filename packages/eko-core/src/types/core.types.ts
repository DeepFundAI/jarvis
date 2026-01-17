import { LanguageModelV2FinishReason } from "@ai-sdk/provider";
import { Agent } from "../agent";
import { LLMs } from "./llm.types";
import { IA2aClient } from "../agent/a2a";
import { IMcpClient } from "./mcp.types";
import { ToolResult } from "./tools.types";
import { AgentContext } from "../core/context";

export type EkoConfig = {
  llms: LLMs;
  agents?: Agent[];
  planLlms?: string[];
  compressLlms?: string[];
  callback?: StreamCallback & HumanCallback;
  defaultMcpClient?: IMcpClient;
  a2aClient?: IA2aClient;
  globalConfig?: {
    name?: string;                      // Product name
    platform?: "windows" | "mac" | "linux";  // Platform
    maxReactNum?: number;               // Maximum number of agent reactions
    maxTokens?: number;                 // Maximum tokens for LLM calls
    maxRetryNum?: number;               // Maximum number of retries
    agentParallel?: boolean;            // Enable parallel agent execution
    compressThreshold?: number;         // Dialogue context compression threshold (message count)
    compressTokensThreshold?: number;   // Dialogue context compression threshold (token count)
    largeTextLength?: number;           // Large text truncation length
    fileTextMaxLength?: number;         // Maximum file text length
    maxDialogueImgFileNum?: number;     // Maximum image file number in dialogue
    toolResultMultimodal?: boolean;     // Tool result multimodal support
    parallelToolCalls?: boolean;        // Enable parallel tool calls
    expertMode?: boolean;               // Enable expert mode
    expertModeTodoLoopNum?: number;     // Expert mode todo loop number
    streamFirstTimeout?: number;        // Stream first response timeout (ms)
    streamTokenTimeout?: number;        // Stream token interval timeout (ms)
  };
};

export type StreamCallbackMessage = {
  taskId: string;
  agentName: string;
  nodeId?: string | null; // agent nodeId
} & (
  | {
      type: "workflow";
      streamDone: boolean;
      workflow: Workflow;
    }
  | {
      type: "agent_start";
      agentNode: WorkflowAgent;
    }
  | {
      type: "text" | "thinking";
      streamId: string;
      streamDone: boolean;
      text: string;
    }
  | {
      type: "file";
      mimeType: string;
      data: string;
    }
  | {
      type: "tool_streaming";
      toolName: string;
      toolId: string;
      paramsText: string;
    }
  | {
      type: "tool_use";
      toolName: string;
      toolId: string;
      params: Record<string, any>;
    }
  | {
      type: "tool_running";
      toolName: string;
      toolId: string;
      text: string;
      streamId: string;
      streamDone: boolean;
    }
  | {
      type: "tool_result";
      toolName: string;
      toolId: string;
      params: Record<string, any>;
      toolResult: ToolResult;
    }
  | {
      type: "agent_result";
      agentNode: WorkflowAgent;
      error?: any;
      result?: string;
    }
  | {
      type: "error";
      error: unknown;
    }
  | {
      type: "finish";
      finishReason: LanguageModelV2FinishReason;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }
);

export interface StreamCallback {
  onMessage: (
    message: StreamCallbackMessage,
    agentContext?: AgentContext
  ) => Promise<void>;
}

export type WorkflowTextNode = {
  type: "normal";
  text: string;
  input?: string | null;
  output?: string | null;
};

export type WorkflowForEachNode = {
  type: "forEach";
  items: string; // list or variable name
  nodes: WorkflowNode[];
};

export type WorkflowWatchNode = {
  type: "watch";
  event: "dom" | "gui" | "file";
  loop: boolean;
  description: string;
  triggerNodes: (WorkflowTextNode | WorkflowForEachNode)[];
};

export type WorkflowNode =
  | WorkflowTextNode
  | WorkflowForEachNode
  | WorkflowWatchNode;

export type WorkflowAgent = {
  id: string;
  name: string;
  task: string;
  dependsOn: string[];
  nodes: WorkflowNode[];
  parallel?: boolean;
  status: "init" | "running" | "done" | "error";
  xml: string; // <agent name="xxx">...</agent>
};

export type Workflow = {
  taskId: string;
  name: string;
  thought: string;
  agents: WorkflowAgent[];
  xml: string;
  modified?: boolean;
  taskPrompt?: string;
};

export interface HumanCallback {
  onHumanConfirm?: (
    agentContext: AgentContext,
    prompt: string,
    extInfo?: any
  ) => Promise<boolean>;
  onHumanInput?: (
    agentContext: AgentContext,
    prompt: string,
    extInfo?: any
  ) => Promise<string>;
  onHumanSelect?: (
    agentContext: AgentContext,
    prompt: string,
    options: string[],
    multiple?: boolean,
    extInfo?: any
  ) => Promise<string[]>;
  onHumanHelp?: (
    agentContext: AgentContext,
    helpType: "request_login" | "request_assistance",
    prompt: string,
    extInfo?: any
  ) => Promise<boolean>;
}

export type EkoResult = {
  taskId: string;
  success: boolean;
  stopReason: "abort" | "error" | "done";
  result: string;
  error?: unknown;
};

export type NormalAgentNode = {
  type: "normal";
  agent: WorkflowAgent;
  nextAgent?: AgentNode;
  result?: string;
};

export type ParallelAgentNode = {
  type: "parallel";
  agents: NormalAgentNode[];
  nextAgent?: AgentNode;
  result?: string;
};

export type AgentNode = NormalAgentNode | ParallelAgentNode;
