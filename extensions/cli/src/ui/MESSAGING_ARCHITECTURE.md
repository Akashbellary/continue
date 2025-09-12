# Message Row Architecture - Anti-Flickering Text Rendering

## Overview

This document explains the unified MessageRow architecture that eliminates UI flickering in terminal-based chat applications through upstream text processing and segmented rendering.

## The Problem

Traditional approach that causes flickering:
```tsx
// BAD: Processing during render causes flickering on terminal resize
function MessageComponent({ message }) {
  const processedContent = processMarkdown(message.content); // Expensive!
  const wrappedLines = wrapToTerminalWidth(processedContent); // Expensive!
  
  return <Text>{wrappedLines}</Text>; // Big block of text
}
```

**Issues:**
- Markdown processing happens during every render
- Text wrapping recalculated on terminal resize  
- Large text blocks cause layout shifts
- No consistent styling across message types

## The Solution: MessageRow Architecture

### Core Data Structure

```typescript
export interface StyledSegment {
  text: string;
  styling: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    color?: string;
    backgroundColor?: string;
    codeLanguage?: string; // Triggers syntax highlighting
  };
}

export interface MessageRow {
  role: "user" | "assistant" | "system" | "tool-result";
  rowType: "content" | "header" | "summary";
  segments: StyledSegment[]; // Pre-styled text pieces
  showBullet: boolean;
  marginBottom: number;
  toolMeta?: {
    toolCallId: string;
    toolName: string;
  };
}
```

### Processing Pipeline

```
ChatHistoryItem[] → processHistoryToMessageRows() → MessageRow[] → MessageRowComponent
```

**Step 1: Upstream Processing**
```typescript
// All processing happens ONCE upstream
const messageRows = processHistoryToMessageRows(chatHistory, terminalWidth);
```

**Step 2: Word-Level Segmentation**
```typescript
// Text is broken into segments for styling
[
  { text: "This is ", styling: {} },
  { text: "bold", styling: { bold: true } },
  { text: " and ", styling: {} },
  { text: "code", styling: { codeLanguage: "javascript" } }
]
```

**Step 3: Row-Level Breaking**
```typescript
// Segments are wrapped to terminal width
[
  [{ text: "This is ", styling: {} }, { text: "bold", styling: { bold: true } }],
  [{ text: "and ", styling: {} }, { text: "code", styling: { codeLanguage: "js" } }]
]
```

## Why Segment Text Instead of Large Blocks?

### 1. **Word-Level Precision**
```typescript
// GOOD: Each word can have different styling
segments: [
  { text: "Error: ", styling: { color: "red", bold: true } },
  { text: "file ", styling: { color: "white" } },
  { text: "`config.js`", styling: { codeLanguage: "javascript" } },
  { text: " not found", styling: { color: "white" } }
]

// BAD: Entire block has same styling
<Text color="red">Error: file `config.js` not found</Text>
```

### 2. **Syntax Highlighting**
```typescript
// Code segments trigger syntax highlighting
{ text: "const x = 5;", styling: { codeLanguage: "javascript" } }
// Renders with proper syntax colors automatically
```

### 3. **Terminal Width Awareness**
```typescript
// Segments wrap cleanly at word boundaries
"This is a very long line that needs to wrap"
↓
Row 1: [{ text: "This is a very long line", styling: {} }]
Row 2: [{ text: "that needs to wrap", styling: {} }]
```

### 4. **Performance**
- Processing happens once, not on every render
- Memoized components don't recalculate
- Terminal resize doesn't trigger text reprocessing

## Component System Usage

### MessageRowComponent (Main Renderer)
```tsx
// Simple, fast rendering with no processing
<MessageRowComponent row={messageRow} index={0} />
```

### StyledText (Segment Renderer)  
```tsx
// Renders array of styled segments
<StyledText segments={[
  { text: "Hello ", styling: { color: "blue" } },
  { text: "world", styling: { bold: true } }
]} />
```

### Processing Functions
```typescript
// Main processor - call once upstream
processHistoryToMessageRows(history: ChatHistoryItem[], terminalWidth: number): MessageRow[]

// Markdown processor - converts markdown to segments
processMarkdownToSegments(content: string): StyledSegment[]

// Tool result processor - handles complex tool outputs
processToolResultIntoRows({ toolName, content }): ToolResultRow[]
```

## Message Type Handling

### User Messages
```typescript
// Simple gray text, no markdown processing
{ text: userMessage, styling: { color: "gray" } }
```

### Assistant Messages  
```typescript
// Full markdown processing with syntax highlighting
processMarkdownToSegments("Here's some **bold** text with `code`")
```

### Tool Results
```typescript
// No indentation, starts at left margin
role: "tool-result",
segments: [
  { text: "⎿  ", styling: { color: "gray" } },
  { text: "File edited successfully", styling: { color: "green" } }
]
```

## Key Benefits

1. **No Flickering**: All processing happens upstream, not during render
2. **Consistent Styling**: Every message type uses the same segment system  
3. **Word-Level Control**: Each word can have different colors/formatting
4. **Syntax Highlighting**: Code segments automatically get proper syntax colors
5. **Performance**: Memoized components with pre-computed content
6. **Terminal Responsive**: Text wrapping respects terminal width without reprocessing

## Usage Example

```typescript
// 1. Process messages upstream (once)
const messageRows = useMemo(() => 
  processHistoryToMessageRows(chatHistory, terminalWidth), 
  [chatHistory, terminalWidth]
);

// 2. Render with simple component (fast)
{messageRows.map((row, index) => 
  <MessageRowComponent key={index} row={row} index={index} />
)}
```

This architecture eliminates all conditional rendering logic in components and prevents the expensive text processing that caused flickering in the previous implementation.