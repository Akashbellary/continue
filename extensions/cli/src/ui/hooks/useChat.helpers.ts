import * as path from "node:path";

import type {
  ChatHistoryItem,
  MessageContent,
  MessagePart,
} from "core/index.js";
import { getLastNPathParts } from "core/util/uri.js";
import { v4 as uuidv4 } from "uuid";

import { logger } from "src/util/logger.js";

import { DEFAULT_SESSION_TITLE } from "../../constants/session.js";
import { loadSession, startNewSession } from "../../session.js";
import { posthogService } from "../../telemetry/posthogService.js";
import { telemetryService } from "../../telemetry/telemetryService.js";
import {
  processMarkdownToSegments,
  splitStyledSegmentsIntoRows,
  StyledSegment,
} from "../MarkdownProcessor.js";

import { processImagePlaceholder } from "./useChat.imageProcessing.js";
import { breakTextIntoRows } from "./useChat.splitLines.helpers.js";
import { SlashCommandResult } from "./useChat.types.js";

/**
 * Initialize chat history
 */
export async function initChatHistory(
  terminalWidth: number,
  resume?: boolean,
  _additionalRules?: string[],
): Promise<ChatHistoryItem[]> {
  if (resume) {
    const savedSession = loadSession();
    if (savedSession) {
      return savedSession.history;
    }
  }

  // Start with empty history - system message will be injected when needed
  return [];
}

/**
 * Handle /config command
 */
export function handleConfigCommand(onShowConfigSelector: () => void): void {
  posthogService.capture("useSlashCommand", {
    name: "config",
  });
  onShowConfigSelector();
}

interface ProcessSlashCommandResultOptions {
  result: SlashCommandResult;
  chatHistory: ChatHistoryItem[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatHistoryItem[]>>;
  onShowConfigSelector: () => void;
  onShowModelSelector?: () => void;
  onShowMCPSelector?: () => void;
  onShowSessionSelector?: () => void;
  onClear?: () => void;
}

/**
 * Process slash command results
 */
export function processSlashCommandResult({
  result,
  chatHistory,
  setChatHistory,
  onShowConfigSelector,
  onShowModelSelector,
  onShowMCPSelector,
  onShowSessionSelector,
  onClear,
}: ProcessSlashCommandResultOptions): string | null {
  if (result.exit) {
    process.exit(0);
  }

  if (result.openMcpSelector) {
    onShowMCPSelector?.();
    return null;
  }

  if (result.openConfigSelector) {
    onShowConfigSelector();
    return null;
  }

  if (result.openModelSelector && onShowModelSelector) {
    onShowModelSelector();
    return null;
  }

  if (result.openSessionSelector && onShowSessionSelector) {
    onShowSessionSelector();
    return null;
  }

  if (result.clear) {
    const systemMessage = chatHistory.find(
      (item) => item.message.role === "system",
    );
    const newHistory = systemMessage ? [systemMessage] : [];

    // Start a new session with a new sessionId
    startNewSession(newHistory);

    setChatHistory(newHistory);

    // Reset intro message state to show it again after clearing
    if (onClear) {
      onClear();
    }

    if (result.output) {
      setChatHistory([
        {
          message: {
            role: "system",
            content: result.output,
          },
          contextItems: [],
        },
      ]);
    }
    return null;
  }

  if (result.output) {
    setChatHistory((prev) => [
      ...prev,
      {
        message: {
          role: "system",
          content: result.output || "",
        },
        contextItems: [],
      },
    ]);
  }

  return result.newInput || null;
}

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

/**
 * Format message with attached files and images - returns multiple ChatHistoryItems (one per row)
 */
export async function formatMessageWithFiles(
  message: string,
  attachedFiles: Array<{ path: string; content: string }>,
  terminalWidth: number,
  imageMap?: Map<string, Buffer>,
): Promise<ChatHistoryItemWithSplit[]> {
  // Convert attached files to context items
  const contextItems = attachedFiles.map((file) => ({
    id: {
      providerTitle: "file",
      itemId: uuidv4(),
    },
    content: file.content,
    name: path.basename(file.path),
    description: getLastNPathParts(file.path, 2),
    uri: {
      type: "file" as const,
      value: `file://${file.path}`,
    },
  }));

  // Process message content for images
  let messageContent: MessageContent = message;

  if (imageMap && imageMap.size > 0) {
    const messageParts: MessagePart[] = [];
    let textContent = message;

    // Replace image placeholders with image parts
    for (const [placeholder, originalImageBuffer] of imageMap.entries()) {
      const result = await processImagePlaceholder(
        placeholder,
        originalImageBuffer,
        textContent,
        messageParts,
      );
      textContent = result.textContent;
    }

    // Add any remaining text
    if (textContent) {
      messageParts.push({
        type: "text",
        text: textContent,
      });
    }

    // Use message parts if we have images, otherwise keep as string
    if (messageParts.length > 0) {
      messageContent = messageParts;
    }
  }

  // Split the message content into multiple ChatHistoryItems
  return splitMessageContent(
    messageContent,
    "user",
    contextItems,
    terminalWidth,
  );
}

/**
 * Track telemetry for user message
 */
export function trackUserMessage(message: string, model?: any): void {
  telemetryService.startActiveTime();
  telemetryService.logUserPrompt(message.length, message);
  posthogService.capture("chat", {
    model: model?.name,
    provider: model?.provider,
  });
}

interface HandleSpecialCommandsOptions {
  message: string;
  isRemoteMode: boolean;
  remoteUrl?: string;
  onShowConfigSelector: () => void;
  exit: () => void;
}

/**
 * Handle special TUI commands
 */
export async function handleSpecialCommands({
  message,
  isRemoteMode,
  remoteUrl,
  onShowConfigSelector,
  exit,
}: HandleSpecialCommandsOptions): Promise<boolean> {
  const trimmedMessage = message.trim();

  // Special handling for /config command in TUI
  if (trimmedMessage === "/config") {
    handleConfigCommand(onShowConfigSelector);
    return true;
  }

  // Handle /exit command in remote mode
  if (isRemoteMode && remoteUrl && trimmedMessage === "/exit") {
    const { handleRemoteExit } = await import("./useChat.remote.helpers.js");
    await handleRemoteExit(remoteUrl, exit);
    return true;
  }

  return false;
}

/**
 * Process chat history to apply message splitting to assistant messages
 * This ensures all assistant messages are properly split for terminal display
 */
export function processHistoryForTerminalDisplay(
  history: ChatHistoryItem[],
  terminalWidth: number,
): ChatHistoryItem[] {
  const processedHistory: ChatHistoryItem[] = [];

  for (const item of history) {
    const itemWithSplit = item as ChatHistoryItemWithSplit;

    if (item.message.role === "assistant" && !itemWithSplit.splitMessage) {
      // Don't split assistant messages that have tool calls - they need special handling in MemoizedMessage
      if (item.toolCallStates && item.toolCallStates.length > 0) {
        // Keep tool call messages intact
        processedHistory.push(item);
      } else {
        // Only split regular assistant messages without tool calls
        const splitMessages = splitMessageContent(
          item.message.content,
          "assistant",
          item.contextItems || [],
          terminalWidth,
        );
        // Preserve any other properties from the original item
        const splitMessagesWithProps = splitMessages.map((splitMsg) => ({
          ...item,
          ...splitMsg,
        }));
        processedHistory.push(...splitMessagesWithProps);
      }
    } else {
      // Keep other messages as-is
      processedHistory.push(item);
    }
  }

  return processedHistory;
}

/**
 * Generate a title for the session based on the first assistant response
 */
export async function generateSessionTitle(
  assistantResponse: string,
  llmApi: any,
  model: any,
  currentSessionTitle?: string,
): Promise<string | undefined> {
  // Only generate title for untitled sessions
  if (currentSessionTitle && currentSessionTitle !== DEFAULT_SESSION_TITLE) {
    return undefined;
  }

  if (!assistantResponse || !llmApi || !model) {
    return undefined;
  }

  try {
    const { ChatDescriber } = await import("core/util/chatDescriber.js");
    const generatedTitle = await ChatDescriber.describeWithBaseLlmApi(
      llmApi,
      model,
      assistantResponse,
    );

    logger.debug("Generated session title", {
      original: currentSessionTitle,
      generated: generatedTitle,
    });

    return generatedTitle;
  } catch (error) {
    logger.error("Failed to generate session title:", error);
    return undefined;
  }
}
