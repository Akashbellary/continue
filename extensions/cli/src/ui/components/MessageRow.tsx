/**
 * Simplified message row component - replaces MemoizedMessage.tsx
 * Uses unified MessageRow type for consistent rendering with no conditional logic
 */

import { Box, Text } from "ink";
import React, { memo } from "react";

import { MessageRow } from "../types/messageTypes.js";

import { StyledText } from "./StyledText.js";

interface MessageRowProps {
  row: MessageRow;
  index: number;
}

/**
 * Pure message row component with role-specific rendering
 * - Tool results: no indentation, content starts at left margin  
 * - User/assistant messages: bullet + space + content
 */
export const MessageRowComponent = memo<MessageRowProps>(
  ({ row, index }) => {
    // Tool results should have no indentation at all
    if (row.role === "tool-result") {
      return (
        <Box key={index} marginBottom={row.marginBottom}>
          <StyledText segments={row.segments} />
        </Box>
      );
    }

    // Regular messages (user/assistant) get bullet + space
    return (
      <Box key={index} marginBottom={row.marginBottom}>
        <Text color={row.role === "user" ? "blue" : "white"}>
          {row.showBullet ? "●" : " "}
        </Text>
        <Text> </Text>
        <StyledText segments={row.segments} />
      </Box>
    );
  },
  (prevProps, nextProps) => {
    // Simple equality check for memoization
    return (
      prevProps.row === nextProps.row && prevProps.index === nextProps.index
    );
  },
);

MessageRowComponent.displayName = "MessageRow";
