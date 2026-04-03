import Log from "../common/log";
import { LLMRequest } from "../types";
import { JSONSchema7 } from "json-schema";
import { toImage } from "../common/utils";
import { RetryLanguageModel } from "../llm";
import { AgentContext } from "../agent/agent-context";
import { extractAgentXmlNode } from "../common/xml";
import { Tool, ToolResult } from "../types/tools.types";

export const TOOL_NAME = "watch_trigger";

type ImageSource = {
  image: Uint8Array | URL | string;
  imageType: "image/jpeg" | "image/png";
};

const watch_system_prompt = `You are a tool for detecting element changes. Given a task description, compare two images to determine whether the changes described in the task have occurred.
If the changes have occurred, return an json with \`changed\` set to true and \`changeInfo\` containing a description of the changes. If no changes have occurred, return an object with \`changed\` set to false.

## Example
User: Monitor new messages in group chat
### No changes detected
Output:
{
  "changed": false
}
### Change detected
Output:
{
  "changed": true,
  "changeInfo": "New message received in the group chat. The message content is: 'Hello, how are you?'"
}`;

const watch_text_system_prompt = `You are a page content analyzer. Given a page content and a condition description, determine if the condition is currently met on the page.
Return ONLY a JSON object, no other text.
- "changed": true means the condition IS met (e.g. the target button exists, the status has changed to the expected value)
- "changed": false means the condition is NOT yet met

## Example
Condition: Monitor for a "Retry" button appearing on the page
### Condition not met
Output:
{
  "changed": false
}
### Condition met
Output:
{
  "changed": true,
  "changeInfo": "The 'Retry' button is present on the page at index 127-128"
}`;

export default class WatchTriggerTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  constructor() {
    this.description = `When executing the \`watch\` node, please use it to monitor DOM element changes, it will block the listener until the element changes or times out.`;
    this.parameters = {
      type: "object",
      properties: {
        nodeId: {
          type: "number",
          description: "watch node ID.",
        },
        watch_area: {
          type: "array",
          description:
            "Element changes in monitoring area, eg: [x, y, width, height].",
          items: {
            type: "number",
          },
        },
        watch_index: {
          type: "array",
          description:
            "The index of elements to be monitoring multiple elements simultaneously.",
          items: {
            type: "number",
          },
        },
        frequency: {
          type: "number",
          description:
            "Check frequency, how many seconds between each check, default 1 seconds.",
          default: 1,
          minimum: 0.5,
          maximum: 30,
        },
        timeout: {
          type: "number",
          description: "Timeout in minute, default 5 minutes.",
          default: 5,
          minimum: 1,
          maximum: 30,
        },
      },
      required: ["nodeId"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ToolResult> {
    let nodeId = args.nodeId as number;
    let agentXml = agentContext.agentChain.agent.xml;
    let node = extractAgentXmlNode(agentXml, nodeId);
    if (node == null) {
      throw new Error("Node ID does not exist: " + nodeId);
    }
    if (node.tagName !== "watch") {
      throw new Error("Node ID is not a watch node: " + nodeId);
    }
    let task_description =
      node.getElementsByTagName("description")[0]?.textContent || "";
    if (!task_description) {
      return {
        content: [
          {
            type: "text",
            text: "The watch node does not have a description, skip.",
          },
        ],
      };
    }

    const rlm = new RetryLanguageModel(
      agentContext.context.config.llms,
      agentContext.agent.Llms,
      agentContext.context.config.globalConfig?.streamFirstTimeout,
      agentContext.context.config.globalConfig?.streamTokenTimeout,
      agentContext
    );
    const useVision = this.isVisionModel(rlm);

    // Initial condition check (text-based, works with all models)
    const pageContent = await this.get_page_content(agentContext);
    const initialCheck = await this.is_condition_met(
      rlm, pageContent, task_description, agentContext
    );
    if (initialCheck.changed) {
      return {
        content: [
          {
            type: "text",
            text: initialCheck.changeInfo || "Condition already met on page.",
          },
        ],
      };
    }

    // Enter monitoring loop
    await this.init_eko_observer(agentContext);
    const start = new Date().getTime();
    const timeout = ((args.timeout as number) || 5) * 60000;
    const frequency = Math.max(500, (args.frequency as number || 1) * 1000);

    let image1: ImageSource | undefined;
    let content1: string | undefined;
    if (useVision) {
      image1 = await this.get_screenshot(agentContext);
    } else {
      content1 = pageContent;
    }

    while (new Date().getTime() - start < timeout) {
      await agentContext.context.checkAborted();
      await new Promise((resolve) => setTimeout(resolve, frequency));
      let changed = await this.has_eko_changed(agentContext);
      if (changed == "false") {
        continue;
      }
      await this.init_eko_observer(agentContext);

      if (useVision) {
        // Vision model: compare screenshots
        const image2 = await this.get_screenshot(agentContext);
        const changeResult = await this.is_dom_change(
          agentContext, rlm, image1!, image2, task_description
        );
        if (changeResult.changed) {
          return {
            content: [
              { type: "text", text: changeResult.changeInfo || "DOM change detected." },
            ],
          };
        }
      } else {
        // Text model: compare page content
        const content2 = await this.get_page_content(agentContext);
        if (content2 === content1) continue;
        const changeResult = await this.is_condition_met(
          rlm, content2, task_description, agentContext
        );
        content1 = content2;
        if (changeResult.changed) {
          return {
            content: [
              { type: "text", text: changeResult.changeInfo || "Condition met." },
            ],
          };
        }
      }
    }
    return {
      content: [
        {
          type: "text",
          text: "Timeout reached, no DOM changes detected.",
        },
      ],
    };
  }

  /** Check if the primary LLM supports vision */
  private isVisionModel(rlm: RetryLanguageModel): boolean {
    const names = rlm.Names;
    const llms = rlm.Llms;
    if (!names || names.length === 0) return false;
    const config = llms[names[0]];
    if (!config) return false;
    const provider = String(config.provider || "").toLowerCase();
    const model = String(config.model || "").toLowerCase();
    if (provider === "deepseek" || model.includes("deepseek")) return false;
    if (provider === "anthropic") return true;
    if (provider === "google") return true;
    if (model.includes("gpt-4o") || model.includes("gpt-4-vision") || model.includes("gpt-4-turbo")) return true;
    if (model.includes("claude") || model.includes("gemini")) return true;
    return false;
  }

  /** Get page text content via extract_page_content */
  private async get_page_content(agentContext: AgentContext): Promise<string> {
    try {
      const extract = (agentContext.agent as any)["extract_page_content"];
      if (!extract) return "";
      const result = await extract.call(agentContext.agent, agentContext);
      return result?.page_content || "";
    } catch (error) {
      Log.error("Error in get_page_content:", error);
      return "";
    }
  }

  /** Check if condition is met using text-based LLM analysis */
  private async is_condition_met(
    rlm: RetryLanguageModel,
    pageContent: string,
    task_description: string,
    agentContext: AgentContext
  ): Promise<{ changed: boolean; changeInfo?: string }> {
    try {
      const request: LLMRequest = {
        messages: [
          { role: "system", content: watch_text_system_prompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Condition: ${task_description}\n\nPage content:\n${pageContent.slice(0, 30000)}`,
              },
            ],
          },
        ],
        abortSignal: agentContext.context.controller.signal,
      };
      const result = await rlm.call(request);
      let resultText = result.text || "{}";
      resultText = resultText.substring(
        resultText.indexOf("{"),
        resultText.lastIndexOf("}") + 1
      );
      return JSON.parse(resultText);
    } catch (error) {
      Log.error("Error in is_condition_met:", error);
    }
    return { changed: false };
  }

  private async get_screenshot(
    agentContext: AgentContext
  ): Promise<ImageSource> {
    const screenshot = (agentContext.agent as any)["screenshot"];
    const imageResult = (await screenshot.call(
      agentContext.agent,
      agentContext
    )) as {
      imageBase64: string;
      imageType: "image/jpeg" | "image/png";
    };
    const image = toImage(imageResult.imageBase64);
    return {
      image: image,
      imageType: imageResult.imageType,
    };
  }

  private async init_eko_observer(agentContext: AgentContext): Promise<void> {
    try {
      const screenshot = (agentContext.agent as any)["execute_script"];
      await screenshot.call(
        agentContext.agent,
        agentContext,
        () => {
          let _window = window as any;
          _window.has_eko_changed = false;
          _window.eko_observer && _window.eko_observer.disconnect();
          let eko_observer = new MutationObserver(function (mutations) {
            _window.has_eko_changed = true;
          });
          eko_observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            characterData: true,
            characterDataOldValue: true,
          });
          _window.eko_observer = eko_observer;
        },
        []
      );
    } catch (error) {
      console.error("Error initializing Eko observer:", error);
    }
  }

  private async has_eko_changed(
    agentContext: AgentContext
  ): Promise<"true" | "false" | "undefined"> {
    try {
      const screenshot = (agentContext.agent as any)["execute_script"];
      let result = (await screenshot.call(
        agentContext.agent,
        agentContext,
        () => {
          return (window as any).has_eko_changed + "";
        },
        []
      )) as string;
      return result as any;
    } catch (e) {
      console.error("Error checking Eko change:", e);
      return "undefined";
    }
  }

  private async is_dom_change(
    agentContext: AgentContext,
    rlm: RetryLanguageModel,
    image1: ImageSource,
    image2: ImageSource,
    task_description: string
  ): Promise<{
    changed: boolean;
    changeInfo?: string;
  }> {
    try {
      let request: LLMRequest = {
        messages: [
          {
            role: "system",
            content: watch_system_prompt,
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                data: image1.image,
                mediaType: image1.imageType,
              },
              {
                type: "file",
                data: image2.image,
                mediaType: image2.imageType,
              },
              {
                type: "text",
                text: task_description,
              },
            ],
          },
        ],
        abortSignal: agentContext.context.controller.signal,
      };
      const result = await rlm.call(request);
      let resultText = result.text || "{}";
      resultText = resultText.substring(
        resultText.indexOf("{"),
        resultText.lastIndexOf("}") + 1
      );
      return JSON.parse(resultText);
    } catch (error) {
      Log.error("Error in is_dom_change:", error);
    }
    return {
      changed: false,
    };
  }
}

export { WatchTriggerTool };
