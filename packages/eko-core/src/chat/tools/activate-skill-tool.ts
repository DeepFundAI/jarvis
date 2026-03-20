/**
 * INPUT: global.skillService for skill metadata and content
 * OUTPUT: Activated skill instructions + resource listing
 * POSITION: Chat dialogue tool enabling LLM to load domain-specific skills
 */

import { JSONSchema7 } from "@ai-sdk/provider";
import global from "../../config/global";
import { DialogueTool, Tool, ToolResult } from "../../types";

export const TOOL_NAME = "activate_skill";

/** Works as both DialogueTool (Chat) and Tool (Agent) */
export default class ActivateSkillTool implements DialogueTool, Tool {
  readonly name: string = TOOL_NAME;
  readonly noPlan: boolean = true;

  /** Dynamic description with available skill list */
  get description(): string {
    const skills =
      global.skillService?.getAllMetadata()?.filter((s) => s.enabled) || [];
    if (skills.length === 0) {
      return "Activate a specialized skill. No skills currently available.";
    }
    const list = skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
    return `Activate a specialized skill that provides domain-specific instructions.\n\nAvailable skills:\n${list}`;
  }

  /** Dynamic parameters with enum constraint */
  get parameters(): JSONSchema7 {
    const skillNames = (
      global.skillService?.getAllMetadata()?.filter((s) => s.enabled) || []
    ).map((s) => s.name);

    return {
      type: "object",
      properties: {
        name: {
          type: "string",
          ...(skillNames.length > 0 ? { enum: skillNames } : {}),
          description: "Name of the skill to activate",
        },
      },
      required: ["name"],
    };
  }

  async execute(args: Record<string, unknown>, ..._rest: unknown[]): Promise<ToolResult> {
    const name = args.name as string;
    if (!global.skillService) {
      return {
        content: [{ type: "text", text: "Skill service not available" }],
        isError: true,
      };
    }

    const skill = await global.skillService.loadSkill(name);
    if (!skill) {
      return {
        content: [{ type: "text", text: `Skill "${name}" not found` }],
        isError: true,
      };
    }

    const output = [
      `<activated_skill name="${skill.metadata.name}">`,
      `<instructions>`,
      skill.instructions.trim(),
      `</instructions>`,
    ];

    if (skill.resources.length > 0) {
      output.push(`<available_resources base="${skill.basePath}">`);
      skill.resources.forEach((r) => output.push(`  <file>${r}</file>`));
      output.push(`</available_resources>`);
    }

    output.push(`</activated_skill>`);

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
}

export { ActivateSkillTool };
