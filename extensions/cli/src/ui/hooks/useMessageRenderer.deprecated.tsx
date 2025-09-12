/**
 * DEPRECATED: This hook has been replaced by the MessageRow processing architecture
 * 
 * Replaced by processHistoryToMessageRows() which processes all messages upstream
 * into MessageRow[] that can be rendered directly with MessageRowComponent.
 * 
 * The new approach eliminates the need for a renderMessage function and complex
 * key generation, providing consistent rendering with pre-styled segments.
 */

import React, { useCallback } from "react";

import type { ChatHistoryItem } from "../../../../../core/index.js";
import { MemoizedMessage } from "../components/MemoizedMessage.deprecated.js";

type ChatHistoryItemWithSplit = any; // Placeholder for deprecated component

export function useMessageRenderer() {
  const renderMessage = useCallback((item: ChatHistoryItem, index: number) => {
    const itemWithSplit = item as ChatHistoryItemWithSplit;

    // Generate a unique key by combining message role, content hash, and metadata
    const messageContent =
      typeof item.message.content === "string"
        ? item.message.content
        : JSON.stringify(item.message.content);

    const toolCallsKey = item.toolCallStates
      ? item.toolCallStates.map((tc) => tc.toolCallId).join("-")
      : "";

    const toolResultKey = itemWithSplit.toolResultRow
      ? `tool-${itemWithSplit.toolResultRow.toolCallId}-${itemWithSplit.toolResultRow.rowData.type}`
      : "";

    const splitKey = itemWithSplit.splitMessage
      ? `split-${itemWithSplit.splitMessage.rowIndex}-${itemWithSplit.splitMessage.totalRows}`
      : "";

    const uniqueKey = `${item.message.role}-${messageContent.slice(0, 50)}-${toolCallsKey}-${toolResultKey}-${splitKey}-${index}`;

    return (
      <MemoizedMessage key={uniqueKey} item={itemWithSplit} index={index} />
    );
  }, []);

  return { renderMessage };
}
