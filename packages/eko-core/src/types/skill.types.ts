/**
 * INPUT: None (pure type definitions)
 * OUTPUT: Skill-related interfaces for service integration
 * POSITION: Type foundation for skill system across jarvis-agent and host apps
 */

export interface SkillMetadata {
  name: string;
  description: string;
  metadata?: {
    author?: string;
    version?: string;
    tags?: string[];
    auto_activate?: boolean;
    [key: string]: unknown;
  };
}

export interface SkillPackage extends SkillMetadata {
  path: string;
  source: "builtin" | "user";
  enabled: boolean;
}

export interface SkillContent {
  metadata: SkillMetadata;
  instructions: string;
  resources: string[];
  basePath: string;
}

export interface SkillService {
  /** Return cached skill metadata (no disk I/O) */
  getAllMetadata(): SkillPackage[];

  /** Load full skill content by name */
  loadSkill(name: string): Promise<SkillContent | null>;

  /** Load a resource file from skill package */
  loadResource(
    skillName: string,
    relativePath: string
  ): Promise<string | null>;
}
