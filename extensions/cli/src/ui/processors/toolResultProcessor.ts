
import { formatToolArgument } from "src/tools/formatters.js";
import { getToolDisplayName } from "src/tools/index.js";

import type { StyledSegment } from "../types/messageTypes.js";

const MAX_BASH_OUTPUT_LINES = 4;
const MAX_DIFF_LINES = 16;

// Color constants for diff display
const DIFF_COLORS = {
  ADDITION_BG: "#325b30",
  DELETION_BG: "#712f37",
  LINE_NUMBER: "gray",
} as const;

// Row types for tool result processing
export interface ToolResultRow {
  type: "header" | "content" | "summary";
  segments: StyledSegment[];
}

/**
 * Convert tool call title to styled segments
 * Based on ToolCallTitle component logic
 */
export function getToolCallTitleSegments(
  toolName: string,
  args?: any,
): StyledSegment[] {
  const displayName = getToolDisplayName(toolName);

  if (!args || Object.keys(args).length === 0) {
    return [{ text: displayName, styling: { bold: true } }];
  }

  // Get the first argument value if it's a simple one
  let formattedValue = "";
  const [key, value] = Object.entries(args)[0];
  if (
    key.toLowerCase().includes("path") ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    formattedValue = formatToolArgument(value);
  } else if (typeof value === "string") {
    const valueLines = value.split("\n");
    if (valueLines.length === 1) {
      formattedValue = formatToolArgument(value);
    } else {
      // For multi-line strings, just show the tool name
      return [{ text: displayName, styling: { bold: true } }];
    }
  }

  if (!formattedValue) {
    return [{ text: displayName, styling: { bold: true } }];
  }

  return [
    { text: displayName, styling: { bold: true } },
    { text: " ", styling: {} },
    { text: formattedValue, styling: { color: "gray" } },
  ];
}

/**
 * Process tool result content into styled rows
 * Converts tool output into formatted segments for display
 */
export function processToolResultIntoRows(toolResult: {
  toolName: string;
  content: string;
}): ToolResultRow[] {
  const { toolName, content } = toolResult;

  if (!content || content.trim().length === 0) {
    return [];
  }

  // Handle different tool types with specific formatting
  if (toolName === "Bash") {
    return processBashOutput(content);
  } else if (toolName === "Read" || toolName === "Edit" || toolName === "Write") {
    return processFileOutput(content);
  } else if (toolName === "Grep" || toolName === "Glob") {
    return processSearchOutput(content);
  } else {
    return processGenericOutput(content);
  }
}

/**
 * Process bash command output with line limits
 */
function processBashOutput(content: string): ToolResultRow[] {
  const lines = content.split("\n");
  
  if (lines.length <= MAX_BASH_OUTPUT_LINES) {
    // Show all output
    return [{
      type: "content",
      segments: lines.map(line => ({
        text: `  ${line}\n`,
        styling: { color: "white" },
      })).flat(),
    }];
  } else {
    // Show first few lines and summary
    const visibleLines = lines.slice(0, MAX_BASH_OUTPUT_LINES);
    const hiddenCount = lines.length - MAX_BASH_OUTPUT_LINES;
    
    return [
      {
        type: "content",
        segments: visibleLines.map(line => ({
          text: `  ${line}\n`,
          styling: { color: "white" },
        })).flat(),
      },
      {
        type: "summary",
        segments: [{
          text: `  ... and ${hiddenCount} more line${hiddenCount === 1 ? "" : "s"}`,
          styling: { color: "gray", italic: true },
        }],
      },
    ];
  }
}

/**
 * Process file-related tool output
 */
function processFileOutput(content: string): ToolResultRow[] {
  // Check if this looks like a diff
  if (content.includes("@@") && (content.includes("+++") || content.includes("---"))) {
    return processDiffOutput(content);
  }

  // Regular file content
  const lines = content.split("\n");
  return [{
    type: "content",
    segments: lines.map(line => ({
      text: `  ${line}\n`,
      styling: { color: "white" },
    })).flat(),
  }];
}

/**
 * Process diff output with syntax highlighting
 */
function processDiffOutput(content: string): ToolResultRow[] {
  const lines = content.split("\n");
  const segments: StyledSegment[] = [];

  let visibleLines = 0;
  const maxLines = MAX_DIFF_LINES;

  for (const line of lines) {
    if (visibleLines >= maxLines) {
      // Add summary of remaining lines
      const remainingLines = lines.length - visibleLines;
      segments.push({
        text: `  ... and ${remainingLines} more line${remainingLines === 1 ? "" : "s"}\n`,
        styling: { color: "gray", italic: true },
      });
      break;
    }

    let styling: StyledSegment["styling"] = { color: "white" };

    if (line.startsWith("+") && !line.startsWith("+++")) {
      styling = { backgroundColor: DIFF_COLORS.ADDITION_BG };
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      styling = { backgroundColor: DIFF_COLORS.DELETION_BG };
    } else if (line.startsWith("@@")) {
      styling = { color: DIFF_COLORS.LINE_NUMBER };
    }

    segments.push({
      text: `  ${line}\n`,
      styling,
    });

    visibleLines++;
  }

  return [{ type: "content", segments }];
}

/**
 * Process search tool output (Grep, Glob)
 */
function processSearchOutput(content: string): ToolResultRow[] {
  const lines = content.split("\n").filter(line => line.trim());
  
  return [{
    type: "content",
    segments: lines.map((line, index) => ({
      text: `  ${line}${index === lines.length - 1 ? "" : "\n"}`,
      styling: { color: "white" },
    })).flat(),
  }];
}

/**
 * Process generic tool output
 */
function processGenericOutput(content: string): ToolResultRow[] {
  return [{
    type: "content",
    segments: [{
      text: `  ${content}`,
      styling: { color: "white" },
    }],
  }];
}