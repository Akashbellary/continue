import React from "react";
import { Text } from "ink";

import {
  defaultTheme,
  detectLanguage,
  highlightCode,
  SyntaxHighlighterTheme,
} from "./SyntaxHighlighter.js";

// Represents a styled segment of text with its formatting information
export interface StyledSegment {
  text: string;
  styling: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    color?: string;
    type?: "text" | "code" | "codeblock" | "heading" | "think";
    language?: string; // For code blocks
  };
}

interface MarkdownPattern {
  regex: RegExp;
  getStyle: (match: RegExpExecArray) => StyledSegment["styling"];
  getContent: (match: RegExpExecArray) => string;
}

const patterns: MarkdownPattern[] = [
  {
    regex: /<think>([\s\S]*?)<\/think>/g,
    getStyle: () => ({ color: "gray", type: "think" }),
    getContent: (match) => match[1].trim(),
  },
  {
    regex: /^(#{1,6})\s+(.+)$/gm,
    getStyle: () => ({ bold: true, type: "heading" }),
    getContent: (match) => match[2],
  },
  {
    regex: /\*\*(.+?)\*\*/g,
    getStyle: () => ({ bold: true }),
    getContent: (match) => match[1],
  },
  {
    regex: /\*([^\s*][^*]*[^\s*]|[^\s*])\*/g,
    getStyle: () => ({ italic: true }),
    getContent: (match) => match[1],
  },
  {
    regex: /_([^_]+)_/g,
    getStyle: () => ({ italic: true }),
    getContent: (match) => match[1],
  },
  {
    regex: /~~([^~]+)~~/g,
    getStyle: () => ({ strikethrough: true }),
    getContent: (match) => match[1],
  },
  {
    regex: /`([^`\n]+)`/g,
    getStyle: () => ({ color: "magentaBright", type: "code" }),
    getContent: (match) => match[1],
  },
];

/**
 * Process markdown text and return styled segments
 */
export function processMarkdownToSegments(
  text: string | null | undefined,
  _theme: SyntaxHighlighterTheme = defaultTheme,
): StyledSegment[] {
  if (!text) {
    return [];
  }

  const segments: StyledSegment[] = [];
  let currentIndex = 0;

  // First, handle code blocks separately
  const codeBlockRegex = /```(?:(\w+)\n)?([\s\S]*?)```/g;
  const codeBlocks: Array<{
    index: number;
    length: number;
    language: string;
    code: string;
  }> = [];

  let codeMatch;
  while ((codeMatch = codeBlockRegex.exec(text)) !== null) {
    const language = codeMatch[1] || detectLanguage(codeMatch[2]);
    codeBlocks.push({
      index: codeMatch.index,
      length: codeMatch[0].length,
      language,
      code: codeMatch[2].trim(),
    });
  }

  // Find all matches for other patterns (excluding code blocks)
  const allMatches: Array<{
    index: number;
    length: number;
    segment: StyledSegment;
  }> = [];

  patterns.forEach((pattern) => {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

    while ((match = regex.exec(text)) !== null) {
      // Skip if this match is inside a code block
      const isInCodeBlock = codeBlocks.some(
        (block) =>
          match!.index >= block.index &&
          match!.index < block.index + block.length,
      );

      if (!isInCodeBlock) {
        allMatches.push({
          index: match.index,
          length: match[0].length,
          segment: {
            text: pattern.getContent(match),
            styling: pattern.getStyle(match),
          },
        });
      }
    }
  });

  // Combine code blocks and other matches
  const combinedMatches: Array<{
    index: number;
    length: number;
    segment: StyledSegment;
  }> = [
    ...codeBlocks.map((block) => ({
      index: block.index,
      length: block.length,
      segment: {
        text: block.code, // Store the raw code, we'll highlight during rendering
        styling: {
          type: "codeblock" as const,
          language: block.language,
        },
      },
    })),
    ...allMatches,
  ];

  // Sort matches by index to process them in order
  combinedMatches.sort((a, b) => a.index - b.index);

  // Process matches, avoiding overlaps
  const processedMatches: typeof combinedMatches = [];
  for (const match of combinedMatches) {
    const overlaps = processedMatches.some(
      (processed) =>
        (match.index >= processed.index &&
          match.index < processed.index + processed.length) ||
        (processed.index >= match.index &&
          processed.index < match.index + match.length),
    );

    if (!overlaps) {
      processedMatches.push(match);
    }
  }

  // Create segments
  processedMatches.forEach((match) => {
    // Add text before this match
    if (match.index > currentIndex) {
      const plainText = text.slice(currentIndex, match.index);
      if (plainText) {
        segments.push({
          text: plainText,
          styling: { type: "text" },
        });
      }
    }

    // Add the styled match
    segments.push(match.segment);
    currentIndex = match.index + match.length;
  });

  // Add remaining text
  if (currentIndex < text.length) {
    const remainingText = text.slice(currentIndex);
    if (remainingText) {
      segments.push({
        text: remainingText,
        styling: { type: "text" },
      });
    }
  }

  // If no segments were created (no patterns found and no remaining text), add the full text as plain text
  if (segments.length === 0 && text) {
    segments.push({
      text: text,
      styling: { type: "text" },
    });
  }

  return segments;
}

/**
 * Render styled segments to React components
 */
export function renderStyledSegments(
  segments: StyledSegment[],
  theme: SyntaxHighlighterTheme = defaultTheme,
): React.ReactNode[] {
  return segments.map((segment, index) => {
    const key = `segment-${index}`;

    if (segment.styling.type === "codeblock") {
      const highlightedCode = highlightCode(
        segment.text,
        segment.styling.language || "text",
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
      >
        {segment.text}
      </Text>
    );
  });
}

/**
 * Split styled segments into rows based on terminal width while preserving styling
 * Each row contains segments that fit within the specified width
 */
export function splitStyledSegmentsIntoRows(
  segments: StyledSegment[],
  terminalWidth: number,
): StyledSegment[][] {
  const availableWidth = terminalWidth - 6; // Account for bullet and spacing
  const rows: StyledSegment[][] = [];
  let currentRow: StyledSegment[] = [];
  let currentRowLength = 0;

  for (const segment of segments) {
    const segmentText = segment.text;

    // Handle segments with newlines
    if (segmentText.includes("\n")) {
      const lines = segmentText.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (i === 0) {
          // First line continues current row if there's space
          if (currentRowLength + line.length <= availableWidth) {
            if (line) {
              currentRow.push({
                text: line,
                styling: segment.styling,
              });
              currentRowLength += line.length;
            }
          } else {
            // Doesn't fit, start new row
            if (currentRow.length > 0) {
              rows.push(currentRow);
            }
            currentRow = line
              ? [
                  {
                    text: line,
                    styling: segment.styling,
                  },
                ]
              : [];
            currentRowLength = line.length;
          }

          // End current row due to newline
          if (i < lines.length - 1) {
            rows.push(currentRow);
            currentRow = [];
            currentRowLength = 0;
          }
        } else if (i === lines.length - 1) {
          // Last line starts a new row
          currentRow = line
            ? [
                {
                  text: line,
                  styling: segment.styling,
                },
              ]
            : [];
          currentRowLength = line.length;
        } else {
          // Middle lines get their own rows
          if (line) {
            rows.push([
              {
                text: line,
                styling: segment.styling,
              },
            ]);
          } else {
            rows.push([]);
          }
        }
      }
      continue;
    }

    // Handle segments that need word wrapping
    const words = segmentText.split(" ");

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Determine if we need a space before this word
      // Need space if: current row has content AND this is the first word in the current segment
      // OR: this is not the first word in the current segment (words within segment need spaces)
      const needsSpaceBefore = (currentRowLength > 0 && i === 0) || i > 0;
      const spaceToAdd = needsSpaceBefore ? " " : "";
      const totalLength = word.length + spaceToAdd.length;

      if (currentRowLength + totalLength <= availableWidth) {
        // Word fits in current row
        const textToAdd = spaceToAdd + word;

        if (
          currentRow.length > 0 &&
          currentRow[currentRow.length - 1].styling.type ===
            segment.styling.type &&
          currentRow[currentRow.length - 1].styling.bold ===
            segment.styling.bold &&
          currentRow[currentRow.length - 1].styling.italic ===
            segment.styling.italic &&
          currentRow[currentRow.length - 1].styling.color ===
            segment.styling.color
        ) {
          // Merge with previous segment if styling matches
          currentRow[currentRow.length - 1].text += textToAdd;
        } else {
          // Add as new segment
          currentRow.push({
            text: textToAdd,
            styling: segment.styling,
          });
        }

        currentRowLength += totalLength;
      } else {
        // Word doesn't fit, start new row
        if (currentRow.length > 0) {
          rows.push(currentRow);
        }

        // Check if single word is longer than available width
        if (word.length > availableWidth) {
          // Split long word by characters as fallback
          let remainingWord = word;
          while (remainingWord.length > availableWidth) {
            rows.push([
              {
                text: remainingWord.substring(0, availableWidth),
                styling: segment.styling,
              },
            ]);
            remainingWord = remainingWord.substring(availableWidth);
          }
          currentRow = remainingWord
            ? [
                {
                  text: remainingWord,
                  styling: segment.styling,
                },
              ]
            : [];
          currentRowLength = remainingWord.length;
        } else {
          currentRow = [
            {
              text: word,
              styling: segment.styling,
            },
          ];
          currentRowLength = word.length;
        }
      }
    }
  }

  // Add the final row if it has content
  if (currentRow.length > 0 || rows.length === 0) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Simple component that renders styled segments - can be used as a drop-in replacement for MarkdownRenderer
 */
export const StyledSegmentRenderer: React.FC<{
  segments: StyledSegment[];
  theme?: SyntaxHighlighterTheme;
}> = React.memo(({ segments, theme = defaultTheme }) => {
  return <Text>{renderStyledSegments(segments, theme)}</Text>;
});

StyledSegmentRenderer.displayName = "StyledSegmentRenderer";
