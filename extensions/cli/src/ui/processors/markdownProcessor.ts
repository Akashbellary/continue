/**
 * Pure markdown processing functions - extracted from MarkdownProcessor.tsx
 * Converts markdown text to styled segments for consistent rendering
 */

import {
  defaultTheme,
  detectLanguage,
  SyntaxHighlighterTheme,
} from "../SyntaxHighlighter.js";
import { StyledSegment } from "../types/messageTypes.js";

interface MarkdownPattern {
  regex: RegExp;
  getStyle: (match: RegExpExecArray) => StyledSegment["styling"];
  getContent: (match: RegExpExecArray) => string;
}

const patterns: MarkdownPattern[] = [
  {
    regex: /<think>([\s\S]*?)<\/think>/g,
    getStyle: () => ({ color: "gray" }),
    getContent: (match) => match[1].trim(),
  },
  {
    regex: /^(#{1,6})\s+(.+)$/gm,
    getStyle: () => ({ bold: true }),
    getContent: (match) => match[2],
  },
  {
    regex: /\*\*(.+?)\*\*/g,
    getStyle: () => ({ bold: true }),
    getContent: (match) => match[1],
  },
  {
    regex: /\*([^\s*][^*]*?[^\s*]|[^\s*])\*/g,
    getStyle: () => ({ italic: true }),
    getContent: (match) => match[1],
  },
  {
    regex: /(^|[^_])_([^_\s][^_]*?[^_\s]|[^_\s])_([^_]|$)/g,
    getStyle: () => ({ italic: true }),
    getContent: (match) => match[2],
  },
  {
    regex: /~~([^~]+)~~/g,
    getStyle: () => ({ strikethrough: true }),
    getContent: (match) => match[1],
  },
  {
    regex: /`([^`\n]+)`/g,
    getStyle: () => ({ color: "magentaBright" }),
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

  // Process text with code blocks as placeholders - use unique markers that won't be processed by other patterns
  let textWithPlaceholders = text;
  codeBlocks.forEach((block, i) => {
    textWithPlaceholders = textWithPlaceholders.replace(
      text.substring(block.index, block.index + block.length),
      `\uE000CODEBLOCK_${i}\uE000`, // Use private use area Unicode characters
    );
  });

  // Process inline patterns on text without code blocks
  const allMatches: Array<{
    index: number;
    length: number;
    segments: StyledSegment[];
  }> = [];

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0; // Reset regex state
    let match;
    while ((match = pattern.regex.exec(textWithPlaceholders)) !== null) {
      allMatches.push({
        index: match.index,
        length: match[0].length,
        segments: [
          {
            text: pattern.getContent(match),
            styling: pattern.getStyle(match),
          },
        ],
      });
    }
  }

  // Sort matches by index and remove overlapping matches
  allMatches.sort((a, b) => a.index - b.index);
  
  // Remove overlapping matches - keep the first one
  const nonOverlappingMatches: typeof allMatches = [];
  let lastEndIndex = 0;
  
  for (const match of allMatches) {
    if (match.index >= lastEndIndex) {
      nonOverlappingMatches.push(match);
      lastEndIndex = match.index + match.length;
    }
  }

  // Process non-overlapping matches and add unmatched text
  for (const match of nonOverlappingMatches) {
    // Add any unmatched text before this match
    if (match.index > currentIndex) {
      const unmatched = textWithPlaceholders.substring(
        currentIndex,
        match.index,
      );
      if (unmatched) {
        segments.push({ text: unmatched, styling: {} });
      }
    }

    // Add the matched styled segments
    segments.push(...match.segments);
    currentIndex = match.index + match.length;
  }

  // Add any remaining unmatched text
  if (currentIndex < textWithPlaceholders.length) {
    const remaining = textWithPlaceholders.substring(currentIndex);
    if (remaining) {
      segments.push({ text: remaining, styling: {} });
    }
  }

  // Replace code block placeholders with actual code block segments
  const finalSegments: StyledSegment[] = [];
  for (const segment of segments) {
    const codeBlockMatch = segment.text.match(/\uE000CODEBLOCK_(\d+)\uE000/);
    if (codeBlockMatch) {
      const blockIndex = parseInt(codeBlockMatch[1]);
      const codeBlock = codeBlocks[blockIndex];
      if (codeBlock) {
        finalSegments.push({
          text: codeBlock.code,
          styling: {
            codeLanguage: codeBlock.language,
          },
        });
      }
    } else {
      finalSegments.push(segment);
    }
  }

  // If no segments were created, add the full text as plain text
  if (finalSegments.length === 0 && text) {
    finalSegments.push({
      text: text,
      styling: {},
    });
  }

  return finalSegments;
}

interface RowState {
  rows: StyledSegment[][];
  currentRow: StyledSegment[];
  currentRowLength: number;
}

function createSegment(
  text: string,
  styling: StyledSegment["styling"],
): StyledSegment {
  return { text, styling };
}

function finishRow(state: RowState): void {
  if (state.currentRow.length > 0) {
    state.rows.push([...state.currentRow]);
    state.currentRow = [];
    state.currentRowLength = 0;
  }
}

/**
 * Split styled segments into rows based on terminal width while preserving styling
 */
export function splitStyledSegmentsIntoRows(
  segments: StyledSegment[],
  terminalWidth: number,
): StyledSegment[][] {
  const availableWidth = terminalWidth - 6; // Account for bullet and spacing
  const state: RowState = {
    rows: [],
    currentRow: [],
    currentRowLength: 0,
  };

  for (const segment of segments) {
    if (segment.text.includes("\n")) {
      processSegmentWithNewlines(segment, state, availableWidth);
    } else {
      processWordsInSegment(segment, state, availableWidth);
    }
  }

  // Add the final row if it has content
  if (state.currentRow.length > 0 || state.rows.length === 0) {
    state.rows.push(state.currentRow);
  }

  return state.rows;
}

function processSegmentWithNewlines(
  segment: StyledSegment,
  state: RowState,
  availableWidth: number,
): void {
  const lines = segment.text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFirstLine = i === 0;
    const isLastLine = i === lines.length - 1;

    if (isFirstLine) {
      const fitsInCurrentRow =
        state.currentRowLength + line.length <= availableWidth;

      if (fitsInCurrentRow && line) {
        state.currentRow.push(createSegment(line, segment.styling));
        state.currentRowLength += line.length;
      } else if (!fitsInCurrentRow) {
        finishRow(state);
        if (line) {
          state.currentRow.push(createSegment(line, segment.styling));
          state.currentRowLength = line.length;
        }
      }

      if (!isLastLine) {
        finishRow(state);
      }
    } else if (isLastLine) {
      if (line) {
        state.currentRow.push(createSegment(line, segment.styling));
        state.currentRowLength = line.length;
      }
    } else {
      state.rows.push(line ? [createSegment(line, segment.styling)] : []);
    }
  }
}

function processWordsInSegment(
  segment: StyledSegment,
  state: RowState,
  availableWidth: number,
): void {
  const words = segment.text.split(/(\s+)/);

  for (const word of words) {
    if (!word) continue;

    const fitsInCurrentRow =
      state.currentRowLength + word.length <= availableWidth;

    if (fitsInCurrentRow) {
      state.currentRow.push(createSegment(word, segment.styling));
      state.currentRowLength += word.length;
    } else {
      finishRow(state);
      state.currentRow.push(createSegment(word, segment.styling));
      state.currentRowLength = word.length;
    }
  }
}
