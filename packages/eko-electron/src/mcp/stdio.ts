import { Log, uuidv4 } from "@jarvis-agent/core";
import {
  IMcpClient,
  McpCallToolParam,
  McpListToolParam,
  McpListToolResult,
  ToolResult,
} from "@jarvis-agent/core/types";
import {
  spawn,
  SpawnOptionsWithoutStdio,
  ChildProcessWithoutNullStreams,
} from "child_process";

export class SimpleStdioMcpClient implements IMcpClient {
  private command: string;
  private args?: string[];
  private options?: SpawnOptionsWithoutStdio;
  private process: ChildProcessWithoutNullStreams | null = null;
  private requestMap: Map<string, (messageData: any) => void>;

  constructor(
    command: string,
    args?: string[],
    options?: SpawnOptionsWithoutStdio
  ) {
    this.command = command;
    this.args = args || [];
    this.options = options || {
      stdio: ["pipe", "pipe", "pipe"],
    };
    this.requestMap = new Map();
  }

  async connect(signal?: AbortSignal): Promise<void> {
    if (this.process) {
      try {
        this.process.kill();
      } catch (e) {}
    }
    this.process = spawn(this.command, this.args, this.options);
    this.process.stdout.on("data", (data) => {
      const response = data.toString().trim();
      Log.debug("MCP Client, onmessage", this.command, this.args, response);
      if (!response.startsWith("{")) {
        return;
      }
      const message = JSON.parse(response);
      if (message.id) {
        const callback = this.requestMap.get(message.id);
        if (callback) {
          callback(message);
        }
      }
    });
    this.process.on("error", (error) => {
      Log.error("MCP process error:", this.command, this.args, error);
    });
    Log.info("MCP Client, connection successful:", this.command, this.args);
  }

  async sendMessage(
    method: string,
    params: Record<string, any> = {},
    signal?: AbortSignal
  ) {
    if (!this.process) {
      await this.connect();
      if (!this.process) {
        throw new Error("Failed to connect to MCP server");
      }
    }
    const id = uuidv4();
    try {
      const callback = new Promise<any>((resolve, reject) => {
        if (signal) {
          signal.addEventListener("abort", () => {
            const error = new Error("Operation was interrupted");
            error.name = "AbortError";
            reject(error);
          });
        }
        this.requestMap.set(id, resolve);
      });
      const message = JSON.stringify({
        jsonrpc: "2.0",
        id: id,
        method: method,
        params: {
          ...params,
        },
      });
      Log.debug(`MCP Client, ${method}`, id, params);
      const suc = this.process.stdin.write(message + "\n", "utf-8");
      if (!suc) {
        throw new Error("SseClient Response Exception: " + message);
      }
      return await callback;
    } finally {
      this.requestMap.delete(id);
    }
  }

  async listTools(
    param: McpListToolParam,
    signal?: AbortSignal
  ): Promise<McpListToolResult> {
    const message = await this.sendMessage(
      "tools/list",
      {
        ...param,
      },
      signal
    );
    if (message.error) {
      Log.error("McpClient listTools error: ", param, message);
      throw new Error("listTools Exception");
    }
    return message.result.tools || [];
  }

  async callTool(
    param: McpCallToolParam,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const message = await this.sendMessage(
      "tools/call",
      {
        ...param,
      },
      signal
    );
    if (message.error) {
      Log.error("McpClient callTool error: ", param, message);
      throw new Error("callTool Exception");
    }
    return message.result;
  }

  isConnected(): boolean {
    return (
      this.process != null && !this.process.killed && !this.process.exitCode
    );
  }

  async close(): Promise<void> {
    this.process && this.process.kill();
  }
}
