import React, { useCallback } from "react";

import type { ChatHistoryItem } from "../../../../../core/index.js";
import { MemoizedMessage } from "../components/MemoizedMessage.js";
import {
  processHistoryForTerminalDisplay,
  type ChatHistoryItemWithSplit,
} from "./useChat.helpers.js";
import { useTerminalSize } from "./useTerminalSize.js";

export function useMessageRenderer() {
  const { columns } = useTerminalSize();

  const renderMessage = useCallback(
    (item: ChatHistoryItem, index: number) => {
      // Process the single item through our tool result expansion logic
      const processedItems = processHistoryForTerminalDisplay([item], columns);

      // Render each processed row as a separate MemoizedMessage
      // Wrap in a single container to avoid React key warnings in Static component
      return (
        <React.Fragment key={`message-group-${index}`}>
          {processedItems.map((processedItem, rowIndex) => {
            const itemWithSplit = processedItem as ChatHistoryItemWithSplit;

            // Generate unique key for each row
            const messageContent =
              typeof processedItem.message.content === "string"
                ? processedItem.message.content
                : JSON.stringify(processedItem.message.content);

            const toolCallsKey = processedItem.toolCallStates
              ? processedItem.toolCallStates
                  .map((tc) => tc.toolCallId)
                  .join("-")
              : "";

            const toolResultKey = itemWithSplit.toolResultRow
              ? `tool-${itemWithSplit.toolResultRow.toolCallId}-${itemWithSplit.toolResultRow.rowData.type}`
              : "";

            const splitKey = itemWithSplit.splitMessage
              ? `split-${itemWithSplit.splitMessage.rowIndex}-${itemWithSplit.splitMessage.totalRows}`
              : "";

            const uniqueKey = `${processedItem.message.role}-${messageContent.slice(0, 50)}-${toolCallsKey}-${toolResultKey}-${splitKey}-${index}-${rowIndex}`;

            return (
              <MemoizedMessage
                key={uniqueKey}
                item={itemWithSplit}
                index={index * 1000 + rowIndex} // Ensure unique indices
              />
            );
          })}
        </React.Fragment>
      );
    },
    [columns],
  );

  return { renderMessage };
}
