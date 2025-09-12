/**
 * Simplified styled segment - removed unused semantic type field
 */
export interface StyledSegment {
  text: string;
  styling: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    color?: string;
    backgroundColor?: string;
    codeLanguage?: string; // If present, treat as code block with syntax highlighting
  };
}

/**
 * Unified message row - everything is segments for consistent rendering
 */
export interface MessageRow {
  // Row metadata
  role: "user" | "assistant" | "system" | "tool-result";
  rowType: "content" | "header" | "summary";

  // Unified rendering data
  // eg. plain text can be just one segement,
  // code blocks can be multiple segments with codeLanguage styling
  segments: StyledSegment[];

  // Visual formatting
  showBullet: boolean; // Show ● indicator, usually for first message
  marginBottom: number; // 1 for last row, 0 for continuous rows to show up as one paragraph

  // Optional tool metadata (only for tool result rows)
  toolMeta?: {
    toolCallId: string;
    toolName: string;
  };
}
