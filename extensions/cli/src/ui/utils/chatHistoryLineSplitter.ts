import { render, Text, Box } from 'ink';
import React from 'react';
import type { ChatHistoryItem } from '../../../../../core/index.js';
import { MarkdownRenderer } from '../MarkdownRenderer.js';
import { AnsiParsingStream, StyledLine, StyledSegment } from './AnsiParsingStream.js';

/**
 * Represents a single line from a chat history item with styling information
 */
export interface ChatHistoryLine extends Omit<ChatHistoryItem, 'message'> {
  message: {
    role: ChatHistoryItem['message']['role'];
    content: string; // Always a string for line content
  };
  originalIndex: number; // Index of the original chat history item
  lineIndex: number; // Index of this line within the original message
  styledSegments?: StyledSegment[]; // ANSI styling information for this line
}

/**
 * Creates a React component that renders the content invisibly to capture ANSI output
 */
function createInvisibleRenderer(content: string, terminalWidth: number) {
  console.log(`[DEBUG] createInvisibleRenderer: content="${content.slice(0, 100)}...", width=${terminalWidth}`);
  
  return React.createElement(Box, { width: terminalWidth, flexDirection: 'column' },
    React.createElement(MarkdownRenderer, { content })
  );
}

/**
 * Renders content to an invisible ANSI stream to extract styling information
 */
async function renderToAnsiStream(content: string, terminalWidth: number): Promise<StyledLine[]> {
  const ansiStream = new AnsiParsingStream();
  
  // Create the component to render
  const component = createInvisibleRenderer(content, terminalWidth);
  
  return new Promise((resolve, reject) => {
    try {
      console.log(`[DEBUG] renderToAnsiStream: Rendering content with width ${terminalWidth}`);
      
      // Force color support for invisible rendering
      const originalForceColor = process.env.FORCE_COLOR;
      process.env.FORCE_COLOR = '1';
      
      // Make the stream appear as TTY to enable colors
      (ansiStream as any).isTTY = true;
      (ansiStream as any).columns = terminalWidth;
      (ansiStream as any).rows = 50;
      
      // Render to our ANSI parsing stream
      const { unmount } = render(component, { 
        stdout: ansiStream as any 
      });
      
      // Wait for rendering to complete, then parse results
      setTimeout(() => {
        try {
          unmount();
          
          // Restore original FORCE_COLOR setting
          if (originalForceColor !== undefined) {
            process.env.FORCE_COLOR = originalForceColor;
          } else {
            delete process.env.FORCE_COLOR;
          }
          
          // Check what raw data was captured
          console.log('[DEBUG] Raw ANSI stream data:', JSON.stringify((ansiStream as any).rawOutput || 'No raw output captured'));
          
          const lines = ansiStream.getFormattedLines();
          console.log(`[DEBUG] Parsed ${lines.length} lines from ANSI stream`);
          
          ansiStream.reset(); // Clean up for next use
          resolve(lines);
        } catch (error) {
          reject(error);
        }
      }, 50); // Small delay to ensure rendering is complete
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Splits a single ChatHistoryItem into multiple line-based items with styling preserved
 */
export async function splitChatHistoryItemIntoLines(
  item: ChatHistoryItem, 
  originalIndex: number,
  terminalWidth: number
): Promise<ChatHistoryLine[]> {
  // Handle messages without content
  if (!item.message.content) {
    return [];
  }

  const contentStr = typeof item.message.content === 'string' 
    ? item.message.content 
    : JSON.stringify(item.message.content);

  try {
    console.log(`[DEBUG] Processing message ${originalIndex}:`, JSON.stringify(contentStr.slice(0, 100)));
    
    // Render content to invisible ANSI stream to get styling information
    const styledLines = await renderToAnsiStream(contentStr, terminalWidth - 4); // Account for padding/border
    
    console.log(`[DEBUG] Rendered to ${styledLines.length} styled lines:`, styledLines.map(l => ({
      line: l.line,
      segments: l.segments.length,
      content: l.segments.map(s => s.text).join('')
    })));
    
    // Convert styled lines to ChatHistoryLine items
    const result: ChatHistoryLine[] = [];
    
    for (let lineIndex = 0; lineIndex < styledLines.length; lineIndex++) {
      const styledLine = styledLines[lineIndex];
      
      // Reconstruct the text content from segments
      const lineContent = styledLine.segments.map(seg => seg.text).join('');
      
      // Skip empty lines and lines with only cursor control codes
      if (!lineContent.trim() || /^\x1B\[\?25[lh]/.test(lineContent)) {
        continue;
      }
      
      console.log(`[DEBUG] Line ${lineIndex}: "${lineContent}" with ${styledLine.segments.length} segments`);
      styledLine.segments.forEach((seg, i) => {
        console.log(`  Segment ${i}: "${seg.text}" style:`, seg.style);
      });
      
      result.push({
        ...item,
        message: {
          role: item.message.role,
          content: lineContent
        },
        originalIndex,
        lineIndex,
        styledSegments: styledLine.segments
      });
    }
    
    // If no lines were produced, return empty array - no fallback
    if (result.length === 0) {
      console.log('[DEBUG] No lines produced, returning empty array');
      return [];
    }
    
    console.log(`[DEBUG] Final result: ${result.length} line-based items`);
    return result;
  } catch (error) {
    console.error('Failed to split chat history item into lines:', error);
    // No fallback - return empty array to force proper line-based rendering
    return [];
  }
}

/**
 * Splits an array of ChatHistoryItems into line-based items
 */
export async function splitChatHistoryIntoLines(
  chatHistory: ChatHistoryItem[],
  terminalWidth: number
): Promise<ChatHistoryLine[]> {
  const result: ChatHistoryLine[] = [];
  
  for (let i = 0; i < chatHistory.length; i++) {
    const item = chatHistory[i];
    const lines = await splitChatHistoryItemIntoLines(item, i, terminalWidth);
    result.push(...lines);
  }
  
  return result;
}

/**
 * Creates a React Text component from styled segments
 */
export function createStyledTextFromSegments(segments: StyledSegment[]): React.ReactElement[] {
  return segments.map((segment, index) => {
    const props: any = { key: `segment-${index}` };
    
    // Apply styling based on segment style
    if (segment.style.bold) props.bold = true;
    if (segment.style.italic) props.italic = true;
    if (segment.style.underline) props.underline = true;
    if (segment.style.strikethrough) props.strikethrough = true;
    if (segment.style.dim) props.dimColor = true;
    if (segment.style.inverse) props.inverse = true;
    if (segment.style.color) props.color = segment.style.color;
    if (segment.style.backgroundColor) props.backgroundColor = segment.style.backgroundColor;
    
    return React.createElement(Text, props, segment.text);
  });
}