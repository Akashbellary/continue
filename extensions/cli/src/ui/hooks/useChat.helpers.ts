import * as path from "node:path";

import type {
  ChatHistoryItem,
  MessageContent,
  MessagePart,
} from "core/index.js";
import { getLastNPathParts } from "core/util/uri.js";
import { v4 as uuidv4 } from "uuid";

import { logger } from "src/util/logger.js";
import { processMarkdownToSegments, splitStyledSegmentsIntoRows, StyledSegment } from "../MarkdownProcessor.js";

import { DEFAULT_SESSION_TITLE } from "../../constants/session.js";
import { loadSession, startNewSession } from "../../session.js";
import { posthogService } from "../../telemetry/posthogService.js";
import { telemetryService } from "../../telemetry/telemetryService.js";

import { processImagePlaceholder } from "./useChat.imageProcessing.js";
import { SlashCommandResult } from "./useChat.types.js";

// Helper function to break text into chunks that fit within available width
// Respects word boundaries to avoid splitting words across rows
const breakTextIntoRows = (text: string, width: number): string[] => {
  const rows: string[] = [];
  let currentRow = "";
  const availableWidth = width - 6;

  const words = text.split(' ');

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Check if word contains explicit newlines
    if (word.includes('\n')) {
      const parts = word.split('\n');

      // Add first part to current row if there's space
      if (parts[0]) {
        const testRow = currentRow + (currentRow ? ' ' : '') + parts[0];
        if (testRow.length <= availableWidth) {
          currentRow = testRow;
        } else {
          // Current word doesn't fit, start new row
          if (currentRow) {
            rows.push(currentRow);
          }
          currentRow = parts[0];
        }
      }

      // Handle newline breaks
      if (currentRow || parts[0] === '') {
        rows.push(currentRow);
      }

      // Process remaining parts after newlines
      for (let j = 1; j < parts.length - 1; j++) {
        rows.push(parts[j]);
      }

      // Set current row to last part
      currentRow = parts[parts.length - 1] || '';
    } else {
      // Regular word without newlines
      const testRow = currentRow + (currentRow ? ' ' : '') + word;

      if (testRow.length <= availableWidth) {
        // Word fits in current row
        currentRow = testRow;
      } else {
        // Word doesn't fit, start new row
        if (currentRow) {
          rows.push(currentRow);
        }

        // Check if single word is longer than available width
        if (word.length > availableWidth) {
          // Split long word by characters as fallback
          let remainingWord = word;
          while (remainingWord.length > availableWidth) {
            rows.push(remainingWord.substring(0, availableWidth));
            remainingWord = remainingWord.substring(availableWidth);
          }
          currentRow = remainingWord;
        } else {
          currentRow = word;
        }
      }
    }
  }

  // Add the final row if it has content
  if (currentRow.length > 0 || rows.length === 0) {
    rows.push(currentRow);
  }

  return rows;
};

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

  const longText =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris ut enim massa. Vivamus mi nunc, rutrum in convallis volutpat, dignissim quis felis. Phasellus iaculis malesuada magna, vel venenatis est feugiat ac. Suspendisse bibendum neque nec ultricies pharetra. Sed eu pulvinar felis. Nunc eget sapien vel libero porta dictum et sed augue. Sed bibendum lobortis nulla, at blandit lacus tempus sed. Sed viverra augue eget turpis porta finibus. Suspendisse fringilla nulla a urna scelerisque tristique. Aliquam feugiat neque at commodo convallis. Phasellus aliquam orci dui, sed porta elit mattis id. Cras at ultrices nibh. Nulla scelerisque leo vitae felis interdum, sed rhoncus nibh mattis. Proin sed neque tortor. Ut sit amet tempus dolor, non ultricies orci. Nunc nibh velit, vehicula sed justo at, hendrerit ornare nisi. Morbi in risus felis. Sed ultrices sodales leo, et placerat nibh viverra ac. Ut at metus sed purus facilisis rutrum. Aenean hendrerit imperdiet consequat. Sed vitae nunc vitae urna scelerisque auctor nec a odio. Proin pharetra tempus enim, eget finibus metus pellentesque pellentesque. Maecenas libero velit, gravida consequat tempor eu, pretium tristique mi. Donec eget massa mattis, finibus tellus eu, ullamcorper mi. Pellentesque in augue nec massa suscipit eleifend. Donec dapibus est ut felis tincidunt elementum. Ut viverra neque a dolor accumsan rutrum. Suspendisse id erat posuere velit finibus vestibulum ut in turpis. Nunc tincidunt tortor a ligula ornare, ac consequat dolor volutpat. Quisque sed ultrices justo. Ut ut erat gravida, sagittis purus ac, placerat mauris. Donec dapibus justo sit amet laoreet fermentum. Pellentesque fermentum id urna vel tincidunt. Praesent bibendum lorem libero, vitae feugiat dolor egestas non. In non lacus molestie, interdum enim sed, finibus lectus. Quisque quis sem vel nulla sollicitudin tincidunt vitae vel massa. Phasellus et felis vel magna imperdiet feugiat. Nulla sed lobortis ipsum. Nunc sit amet magna sed est blandit venenatis id eu velit. Donec augue sapien, accumsan non congue a, pellentesque sit amet mauris. Sed ut ante non dolor ultrices placerat. Proin sed arcu in turpis ullamcorper faucibus in eu tortor. Donec eget consequat elit, eu dictum leo. Duis vitae velit ante. Duis pellentesque tincidunt nisi, quis fermentum tortor fringilla quis. Duis consectetur lacus vel nibh laoreet, at bibendum lorem gravida. Donec luctus, est in bibendum ornare, orci est pulvinar nunc, accumsan scelerisque purus mi sed lorem. Nulla facilisi. Pellentesque blandit odio sed magna volutpat dictum. Nam tincidunt augue id enim accumsan, quis porttitor diam viverra. Nam sodales, odio ut dignissim volutpat, leo neque faucibus neque, a ornare lectus purus non nunc. Phasellus consequat, nibh vel varius dignissim, purus felis scelerisque massa, dignissim fringilla ex mauris et nunc. Duis varius ex non mattis ornare. Curabitur dictum eleifend sem non pellentesque. Maecenas laoreet metus vel pellentesque molestie. Quisque ut auctor purus. Praesent at libero vitae purus ultricies egestas at at sem. Nulla pellentesque rhoncus libero, vitae faucibus massa molestie in. Integer iaculis interdum sapien iaculis malesuada. Nulla sed fringilla dui. Aliquam iaculis est mi, vel hendrerit risus imperdiet ornare. Nulla nec rutrum libero, ut gravida purus. Integer nec imperdiet lacus. Fusce varius lorem quis blandit consectetur. Duis tempor varius tellus, sit amet ornare ipsum sollicitudin nec. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam elementum laoreet felis, ac convallis ligula varius eu. In pellentesque mi ac orci malesuada hendrerit. Nam at commodo nisl, nec euismod turpis. Suspendisse id ullamcorper orci, non porta urna. Quisque feugiat leo eu congue tincidunt. In at risus in ligula vulputate eleifend sed ut nisl. Pellentesque feugiat arcu nec felis facilisis aliquet nec nec elit. Vivamus efficitur quam eu sagittis rhoncus. Etiam arcu enim, pulvinar non quam id, faucibus accumsan ligula. Sed malesuada scelerisque magna sed molestie. Phasellus consectetur erat ac lacus luctus fringilla. Nulla sit amet suscipit orci. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Aenean ipsum orci, posuere ac cursus sed, interdum quis ligula. Quisque nulla magna, mollis id leo in, malesuada feugiat tellus. Fusce eget metus mi. Praesent ut enim sit amet nibh iaculis congue in sit amet ipsum. Praesent velit mauris, tempor a tristique eu, viverra a nisi. Maecenas tincidunt cursus fermentum. Phasellus consequat enim quis hendrerit sollicitudin. Interdum et malesuada fames ac ante ipsum primis in faucibus. Suspendisse condimentum id justo nec lacinia. Maecenas id sollicitudin lacus. Morbi lorem orci, egestas ac facilisis ut, maximus ac est. In in odio tristique, convallis ex quis, aliquet nisl. Etiam viverra condimentum mi a mollis. Sed ac rutrum arcu. Pellentesque sed varius nulla, vel placerat justo. Morbi nibh enim, ultrices a quam vel, ornare ultricies odio. Quisque sollicitudin nisl ullamcorper dolor rhoncus viverra ac nec nunc. Vivamus imperdiet ut neque sed gravida. Nullam volutpat lacus eu massa imperdiet hendrerit. Nunc pellentesque, justo eu elementum sodales, orci urna ultrices lorem, vitae tristique nulla metus eget elit. Morbi eget sapien ac mauris gravida dapibus. Proin dui quam, tincidunt vel rutrum eget, dictum congue lectus. Ut non pretium magna. Maecenas eu odio iaculis, vehicula tortor in, vehicula lorem. Suspendisse metus arcu, aliquet sit amet aliquam ac, auctor et tellus. Nam volutpat eget erat quis ultricies. Sed tempus interdum tellus in rhoncus. Sed tincidunt neque eu tincidunt pulvinar. Mauris malesuada mollis lectus ut efficitur. Donec cursus dolor mauris, a sodales lorem maximus eu. Interdum et malesuada fames ac ante ipsum primis in faucibus. Etiam non lacus porttitor, efficitur ex nec, varius magna.";

  // Break the long text into rows and create separate messages
  const textRows = breakTextIntoRows(longText, terminalWidth);
  const messages: ChatHistoryItem[] = textRows.map((row, index) => ({
    message: {
      role: "system",
      content: row,
    },
    contextItems: [],
  }));

  // Add a final assistant response
  // let messages: ChatHistoryItem[] = [];
  // messages.push({
  //   message: {
  //     role: "user",
  //     content:
  //       "This is the end of the broken-up Lorem ipsum text demonstration. This is the end of the broken-up Lorem ipsum text demonstration.".repeat(20),
  //   },
  //   contextItems: [],
  // });

  return messages;
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
    const segmentRows = splitStyledSegmentsIntoRows(styledSegments, terminalWidth);

    // If only one row, return as normal (not split) - avoids unnecessary metadata
    if (segmentRows.length === 1) {
      return [{
        message: {
          role,
          content: fullContentText, // Keep original content for compatibility
          isStreaming: false, // Ensure completed messages are not marked as streaming
        },
        contextItems: contextItems,
        styledSegments: segmentRows[0],
      }];
    }

    // Create separate ChatHistoryItems for each row with split metadata
    return segmentRows.map((rowSegments, index) => ({
      message: {
        role,
        content: rowSegments.map(seg => seg.text).join(''), // Reconstruct text for the row
        isStreaming: false, // Ensure split messages are not marked as streaming
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
      return [{
        message: {
          role,
          content: textRows[0],
          isStreaming: false,
        },
        contextItems: contextItems,
      }];
    }

    return textRows.map((rowContent, index) => ({
      message: {
        role,
        content: rowContent,
        isStreaming: false,
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
    if (item.message.role === "assistant" && !item.splitMessage) {
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
          terminalWidth
        );
        // Preserve any other properties from the original item
        const splitMessagesWithProps = splitMessages.map(splitMsg => ({
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
