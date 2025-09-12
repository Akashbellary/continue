/**
 * Core message processing logic - extracted from useChat.helpers.ts
 * Converts ChatHistoryItem[] to MessageRow[] for unified rendering
 */

import type { ChatHistoryItem } from "core/index.js";

import { MessageRow } from "../types/messageTypes.js";

import {
  processMarkdownToSegments,
  splitStyledSegmentsIntoRows,
} from "./markdownProcessor.js";
import {
  getToolCallTitleSegments,
  processToolResultIntoRows,
} from "./toolResultProcessor.js";

/**
 * CORE ARCHITECTURE: Convert chat history to MessageRow[] for unified rendering
 *
 * This replaces the complex ChatHistoryItemWithSplit approach with a simple
 * MessageRow[] that eliminates all conditional rendering logic in components.
 * Every message type becomes rows with pre-styled segments.
 */
export function processHistoryToMessageRows(
  history: ChatHistoryItem[],
  terminalWidth: number,
): MessageRow[] {
  const messageRows: MessageRow[] = [];

  for (const item of history) {
    if (item.message.role === "user") {
      messageRows.push(...processUserMessage(item, terminalWidth));
    } else if (item.message.role === "assistant") {
      if (item.toolCallStates && item.toolCallStates.length > 0) {
        messageRows.push(...processAssistantWithToolCalls(item, terminalWidth));
      } else {
        messageRows.push(...processAssistantMessage(item, terminalWidth));
      }
    } else if (item.message.role === "system") {
      messageRows.push(...processSystemMessage(item));
    }
  }

  return messageRows;
}

/**
 * Process user messages into MessageRow format
 */
function processUserMessage(
  item: ChatHistoryItem,
  terminalWidth: number,
): MessageRow[] {
  const content = formatMessageContent(item.message.content);
  
  // User messages should be gray - create simple segments without markdown processing
  const segments = [{ text: content, styling: { color: "gray" } }];
  const segmentRows = splitStyledSegmentsIntoRows(segments, terminalWidth);

  return segmentRows.map((rowSegments, index) => ({
    role: "user" as const,
    rowType: "content" as const,
    segments:
      rowSegments.length > 0 ? rowSegments : [{ text: "", styling: { color: "gray" } }],
    showBullet: index === 0,
    marginBottom: index === segmentRows.length - 1 ? 1 : 0,
  }));
}

/**
 * Process regular assistant messages (no tool calls) into MessageRow format
 */
function processAssistantMessage(
  item: ChatHistoryItem,
  terminalWidth: number,
): MessageRow[] {
  const content = formatMessageContent(item.message.content);
  const segments = processMarkdownToSegments(content);
  const segmentRows = splitStyledSegmentsIntoRows(segments, terminalWidth);

  return segmentRows.map((rowSegments, index) => ({
    role: "assistant" as const,
    rowType: "content" as const,
    segments:
      rowSegments.length > 0 ? rowSegments : [{ text: "", styling: {} }],
    showBullet: index === 0,
    marginBottom: index === segmentRows.length - 1 ? 1 : 0,
  }));
}

/**
 * Process system messages into MessageRow format
 */
function processSystemMessage(item: ChatHistoryItem): MessageRow[] {
  const content = formatMessageContent(item.message.content);

  return [
    {
      role: "system" as const,
      rowType: "content" as const,
      segments: [{ text: content, styling: { color: "gray", italic: true } }],
      showBullet: false,
      marginBottom: 1,
    },
  ];
}

/**
 * Process assistant messages with tool calls into MessageRow format
 */
function processAssistantWithToolCalls(
  item: ChatHistoryItem,
  terminalWidth: number,
): MessageRow[] {
  const messageRows: MessageRow[] = [];

  // First, add assistant message content if any
  if (item.message.content) {
    messageRows.push(...processAssistantMessage(item, terminalWidth));
  }

  // Then, process each tool call
  if (item.toolCallStates) {
    for (const toolState of item.toolCallStates) {
      const toolName = toolState.toolCall.function.name;
      const toolArgs = toolState.parsedArgs;
      const isCompleted = toolState.status === "done";
      const isErrored =
        toolState.status === "errored" || toolState.status === "canceled";

      // Create tool call header row
      const statusColor = isErrored
        ? "red"
        : isCompleted
          ? "green"
          : toolState.status === "generated"
            ? "yellow"
            : "white";
      const statusIcon = isCompleted || isErrored ? "●" : "○";

      messageRows.push({
        role: "tool-result" as const,
        rowType: "header" as const,
        segments: [
          { text: statusIcon, styling: { color: statusColor } },
          { text: " ", styling: {} },
          ...getToolCallTitleSegments(toolName, toolArgs),
        ],
        showBullet: false,
        marginBottom: 0,
        toolMeta: {
          toolCallId: toolState.toolCallId,
          toolName,
        },
      });

      // Process tool output if present
      if (toolState.output && toolState.output.length > 0) {
        const content = toolState.output.map((o) => o.content).join("\n");
        const toolResultRows = processToolResultIntoRows({
          toolName,
          content,
        });

        toolResultRows.forEach((rowData, rowIndex) => {
          messageRows.push({
            role: "tool-result" as const,
            rowType: rowData.type as "content" | "header" | "summary",
            segments: rowData.segments,
            showBullet: false,
            marginBottom: rowIndex === toolResultRows.length - 1 ? 1 : 0,
            toolMeta: {
              toolCallId: toolState.toolCallId,
              toolName,
            },
          });
        });
      }
    }
  }

  return messageRows;
}

/**
 * Helper: Format message content for display
 */
function formatMessageContent(content: any): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return JSON.stringify(content);
  }

  // Convert message parts array to display format with placeholders
  let displayText = "";
  let imageCounter = 0;

  for (const part of content) {
    if (part.type === "text") {
      displayText += part.text;
    } else if (part.type === "image_url") {
      imageCounter++;
      displayText += `[Image #${imageCounter}]`;
    }
  }

  return displayText;
}
