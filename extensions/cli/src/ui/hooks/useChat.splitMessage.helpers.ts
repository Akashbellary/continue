import type {
  ChatHistoryItem,
  MessageContent,
} from "core/index.js";

import {
  processMarkdownToSegments,
  splitStyledSegmentsIntoRows,
  StyledSegment,
} from "../MarkdownProcessor.js";
import {
  ToolResultRow,
} from "../ToolResultProcessor.js";

import { breakTextIntoRows } from "./useChat.splitLines.helpers.js";

// Extended type for split messages - tracks when long messages are broken into multiple rows
export type ChatHistoryItemWithSplit = ChatHistoryItem & {
  splitMessage?: {
    isFirstRow: boolean;
    isLastRow: boolean;
    totalRows: number;
    rowIndex: number;
  };
  // Pre-processed styled segments for this row - when present, these should be used instead of processing markdown
  styledSegments?: StyledSegment[];
  // For tool result rows - when present, this represents a single row from a tool result
  toolResultRow?: {
    toolCallId: string;
    toolName: string;
    rowData: ToolResultRow;
    isFirstToolRow: boolean;
    isLastToolRow: boolean;
  };
};

/**
 * Split message content into multiple ChatHistoryItems based on terminal width
 * Now processes markdown into styled segments first, then splits those segments across rows
 * This prevents markdown re-processing and flickering
 */
export function splitMessageContent(
  content: MessageContent,
  role: "user" | "assistant" | "system",
  contextItems: ChatHistoryItem["contextItems"],
  terminalWidth: number,
): ChatHistoryItemWithSplit[] {
  const processContent = (content: MessageContent): string => {
    if (typeof content === "string") {
      return content;
    }

    if (!Array.isArray(content)) {
      return JSON.stringify(content);
    }

    // Handle MessagePart[] array - convert to display format
    let displayText = "";
    let imageCounter = 0;

    for (const part of content) {
      if (part.type === "text") {
        displayText += part.text;
      } else if (part.type === "imageUrl") {
        imageCounter++;
        displayText += `[Image #${imageCounter}]`;
      } else {
        // Handle any other part types
        displayText += JSON.stringify(part);
      }
    }

    return displayText;
  };

  const fullContentText = processContent(content);

  // For assistant messages, process markdown into styled segments then split
  if (role === "assistant") {
    const styledSegments = processMarkdownToSegments(fullContentText);
    const segmentRows = splitStyledSegmentsIntoRows(
      styledSegments,
      terminalWidth,
    );

    // If only one row, return as normal (not split) - avoids unnecessary metadata
    if (segmentRows.length === 1) {
      return [
        {
          message: {
            role,
            content: fullContentText, // Keep original content for compatibility
          },
          contextItems: contextItems,
          styledSegments: segmentRows[0],
        },
      ];
    }

    // Create separate ChatHistoryItems for each row with split metadata
    return segmentRows.map((rowSegments, index) => ({
      message: {
        role,
        content: rowSegments.map((seg) => seg.text).join(""), // Reconstruct text for the row
      },
      contextItems: contextItems, // Share context items across all rows
      styledSegments: rowSegments, // Pre-processed styled segments for this row
      splitMessage: {
        isFirstRow: index === 0,
        isLastRow: index === segmentRows.length - 1,
        totalRows: segmentRows.length,
        rowIndex: index,
      },
    }));
  } else {
    // For user/system messages, use the old text-splitting approach
    const textRows = breakTextIntoRows(fullContentText, terminalWidth);

    // If only one row, return as normal (not split) - avoids unnecessary metadata
    if (textRows.length === 1) {
      return [
        {
          message: {
            role,
            content: textRows[0],
          },
          contextItems: contextItems,
        },
      ];
    }

    return textRows.map((rowContent, index) => ({
      message: {
        role,
        content: rowContent,
      },
      contextItems: contextItems,
      splitMessage: {
        isFirstRow: index === 0,
        isLastRow: index === textRows.length - 1,
        totalRows: textRows.length,
        rowIndex: index,
      },
    }));
  }
}


