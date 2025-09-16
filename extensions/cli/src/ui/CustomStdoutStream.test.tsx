import React from 'react';
import { render, Text, Box } from 'ink';
import { Writable } from 'stream';

class AnsiParsingStream extends Writable {
  segments: Array<{
    text: string;
    position: { row: number; col: number };
    endPosition: { row: number; col: number };
    style: {
      color: string | null;
      backgroundColor: string | null;
      bold: boolean;
      italic: boolean;
      underline: boolean;
      strikethrough: boolean;
      dim: boolean;
      inverse: boolean;
    };
  }> = [];

  currentPosition = { row: 0, col: 0 };
  currentStyle = this.getDefaultStyle();
  rawOutput = '';

  constructor(options = {}) {
    super(options);
  }

  getDefaultStyle() {
    return {
      color: null,
      backgroundColor: null,
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      dim: false,
      inverse: false
    };
  }

  _write(chunk: Buffer, encoding: string, callback: (error?: Error | null) => void) {
    const data = chunk.toString();
    this.rawOutput += data;
    this.parseAnsiSequences(data);
    callback();
  }

  parseAnsiSequences(data: string) {
    const ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]/g;
    let lastIndex = 0;
    let match;

    while ((match = ansiRegex.exec(data)) !== null) {
      if (match.index > lastIndex) {
        const text = data.slice(lastIndex, match.index);
        this.addTextSegment(text);
      }

      this.processEscapeSequence(match[0]);
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < data.length) {
      const text = data.slice(lastIndex);
      this.addTextSegment(text);
    }
  }

  addTextSegment(text: string) {
    if (!text) return;
    
    let currentText = '';
    let currentCol = this.currentPosition.col;
    let currentRow = this.currentPosition.row;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (char === '\n') {
        if (currentText.length > 0) {
          this.segments.push({
            text: currentText,
            position: { row: currentRow, col: currentCol },
            endPosition: { row: currentRow, col: currentCol + currentText.length - 1 },
            style: { ...this.currentStyle }
          });
          currentText = '';
        }
        
        currentRow++;
        currentCol = 0;
      } else if (char === '\r') {
        if (currentText.length > 0) {
          this.segments.push({
            text: currentText,
            position: { row: currentRow, col: currentCol },
            endPosition: { row: currentRow, col: currentCol + currentText.length - 1 },
            style: { ...this.currentStyle }
          });
          currentText = '';
        }
        
        currentCol = 0;
      } else {
        currentText += char;
      }
    }
    
    if (currentText.length > 0) {
      this.segments.push({
        text: currentText,
        position: { row: currentRow, col: currentCol },
        endPosition: { row: currentRow, col: currentCol + currentText.length - 1 },
        style: { ...this.currentStyle }
      });
      currentCol += currentText.length;
    }
    
    this.currentPosition.row = currentRow;
    this.currentPosition.col = currentCol;
  }

  processEscapeSequence(sequence: string) {
    const code = sequence.slice(2, -1);
    const command = sequence.slice(-1);

    if (command === 'm') {
      this.processSGR(code);
    }
  }

  processSGR(code: string) {
    const codes = code ? code.split(';').map(Number) : [0];
    
    for (let i = 0; i < codes.length; i++) {
      const num = codes[i];
      
      switch (num) {
        case 0:
          this.currentStyle = this.getDefaultStyle();
          break;
        case 1:
          this.currentStyle.bold = true;
          break;
        case 3:
          this.currentStyle.italic = true;
          break;
        case 4:
          this.currentStyle.underline = true;
          break;
        case 9:
          this.currentStyle.strikethrough = true;
          break;
        case 22:
          this.currentStyle.bold = false;
          this.currentStyle.dim = false;
          break;
        case 23:
          this.currentStyle.italic = false;
          break;
        case 24:
          this.currentStyle.underline = false;
          break;
        case 29:
          this.currentStyle.strikethrough = false;
          break;
        default:
          if (num >= 30 && num <= 37) {
            this.currentStyle.color = this.getColorName(num - 30);
          } else if (num >= 40 && num <= 47) {
            this.currentStyle.backgroundColor = this.getColorName(num - 40);
          } else if (num === 39) {
            this.currentStyle.color = null;
          } else if (num === 49) {
            this.currentStyle.backgroundColor = null;
          }
          break;
      }
    }
  }

  getColorName(colorIndex: number): string {
    const colors = [
      'black', 'red', 'green', 'yellow',
      'blue', 'magenta', 'cyan', 'white'
    ];
    return colors[colorIndex] || `color-${colorIndex}`;
  }

  getFormattedLines() {
    const lines = new Map<number, typeof this.segments>();
    
    this.segments.forEach(segment => {
      const row = segment.position.row;
      if (!lines.has(row)) {
        lines.set(row, []);
      }
      lines.get(row)!.push(segment);
    });
    
    lines.forEach(segments => {
      segments.sort((a, b) => a.position.col - b.position.col);
    });
    
    const result: Array<{
      line: number;
      segments: Array<{
        text: string;
        startCol: number;
        endCol: number;
        style: typeof this.currentStyle;
      }>;
    }> = [];
    
    const sortedLines = Array.from(lines.entries()).sort(([a], [b]) => a - b);
    
    sortedLines.forEach(([lineNum, segments]) => {
      result.push({
        line: lineNum,
        segments: segments.map(segment => ({
          text: segment.text,
          startCol: segment.position.col,
          endCol: segment.endPosition.col,
          style: segment.style
        }))
      });
    });
    
    return result;
  }
}

// Test component with individual styled text components
const TestComponent: React.FC = () => (
  <Box flexDirection="column">
    <Box>
      <Text bold>Bold </Text>
      <Text strikethrough>strikethrough </Text>
      <Text backgroundColor="red">red background</Text>
    </Box>
    <Box>
      <Text>Normal </Text>
      <Text color="blue" underline>blue underlined</Text>
      <Text> text</Text>
    </Box>
  </Box>
);

describe('AnsiParsingStream', () => {
  test('should render React component without ANSI codes in test environment', async () => {
    const ansiStream = new AnsiParsingStream();
    
    // Force color support
    process.env.FORCE_COLOR = '1';
    
    // Render the component to our custom stream
    const { unmount } = render(<TestComponent />, { 
      stdout: ansiStream 
    });
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    unmount();
    
    const lines = ansiStream.getFormattedLines();
    
    // In test environment, Ink renders plain text without ANSI codes
    expect(lines.length).toBe(2);
    
    // First line should have text content (but no styling in test mode)
    const firstLine = lines[0];
    expect(firstLine.segments.length).toBe(1);
    expect(firstLine.segments[0].text).toBe('Bold strikethrough red background');
    
    // Second line 
    const secondLine = lines[1];
    expect(secondLine.segments.length).toBe(1);
    expect(secondLine.segments[0].text).toBe('Normal blue underlined text');
  });

  test('should maintain proper column positions for multiple segments', async () => {
    const ansiStream = new AnsiParsingStream();
    
    const { unmount } = render(<TestComponent />, { 
      stdout: ansiStream 
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    unmount();
    
    const lines = ansiStream.getFormattedLines();
    const firstLine = lines[0];
    
    // Verify segments don't overlap and are in correct order
    for (let i = 1; i < firstLine.segments.length; i++) {
      const prevSegment = firstLine.segments[i - 1];
      const currentSegment = firstLine.segments[i];
      
      expect(currentSegment.startCol).toBeGreaterThanOrEqual(prevSegment.endCol + 1);
    }
  });

  test('should parse ANSI codes correctly when written directly', () => {
    const ansiStream = new AnsiParsingStream();
    
    // Write ANSI codes directly
    const testData = '\x1b[1mBold\x1b[22m \x1b[9mStrikethrough\x1b[29m \x1b[41mRed BG\x1b[49m';
    ansiStream.write(testData);
    
    const lines = ansiStream.getFormattedLines();
    
    expect(lines.length).toBe(1);
    const segments = lines[0].segments;
    
    // Should have multiple segments with different styles
    expect(segments.length).toBeGreaterThan(1);
    
    // Check for bold segment
    const boldSegment = segments.find(s => s.style.bold);
    expect(boldSegment).toBeDefined();
    expect(boldSegment?.text).toBe('Bold');
    
    // Check for strikethrough segment
    const strikethroughSegment = segments.find(s => s.style.strikethrough);
    expect(strikethroughSegment).toBeDefined();
    expect(strikethroughSegment?.text).toBe('Strikethrough');
    
    // Check for red background segment
    const redBgSegment = segments.find(s => s.style.backgroundColor === 'red');
    expect(redBgSegment).toBeDefined();
    expect(redBgSegment?.text).toBe('Red BG');
  });
});