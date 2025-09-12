/**
 * Pure React component for rendering styled segments - extracted from MarkdownProcessor.tsx
 * Replaces StyledSegmentRenderer with simplified implementation using new StyledSegment type
 */

import { Text } from "ink";
import React from "react";

import {
  defaultTheme,
  highlightCode,
  SyntaxHighlighterTheme,
} from "../SyntaxHighlighter.js";
import { StyledSegment } from "../types/messageTypes.js";

/**
 * Render styled segments to React components
 */
function renderStyledSegments(
  segments: StyledSegment[],
  theme: SyntaxHighlighterTheme = defaultTheme,
): React.ReactNode[] {
  return segments.map((segment, index) => {
    const key = `segment-${index}`;

    // Handle code blocks with syntax highlighting
    if (segment.styling.codeLanguage) {
      const highlightedCode = highlightCode(
        segment.text,
        segment.styling.codeLanguage,
        theme,
      );
      return <Text key={key}>{highlightedCode}</Text>;
    }

    return (
      <Text
        key={key}
        bold={segment.styling.bold}
        italic={segment.styling.italic}
        strikethrough={segment.styling.strikethrough}
        color={segment.styling.color}
        backgroundColor={segment.styling.backgroundColor}
      >
        {segment.text}
      </Text>
    );
  });
}

/**
 * Simple component that renders styled segments
 * Replaces the old StyledSegmentRenderer with simplified interface
 */
export const StyledText: React.FC<{
  segments: StyledSegment[];
  theme?: SyntaxHighlighterTheme;
}> = React.memo(({ segments, theme = defaultTheme }) => {
  return <Text>{renderStyledSegments(segments, theme)}</Text>;
});

StyledText.displayName = "StyledText";
