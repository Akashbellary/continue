import React, { useCallback } from "react";

import { MessageRowComponent } from "../components/MessageRow.js";
import type { MessageRow } from "../types/messageTypes.js";

export function useMessageRenderer() {
  const renderMessage = useCallback((row: MessageRow, index: number) => {
    // Generate a unique key for MessageRow format
    const contentText = row.segments.map(s => s.text).join('');
    const toolKey = row.toolMeta ? `tool-${row.toolMeta.toolCallId}-${row.toolMeta.toolName}` : "";
    const uniqueKey = `${row.role}-${row.rowType}-${contentText.slice(0, 50)}-${toolKey}-${index}`;

    return (
      <MessageRowComponent key={uniqueKey} row={row} />
    );
  }, []);

  return { renderMessage };
}
