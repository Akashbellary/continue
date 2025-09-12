import { Box, Text } from "ink";
import React from "react";

interface SimpleChecklistDisplayProps {
  content: string;
}

/**
 * Simple checklist display for tool previews - replaces ChecklistDisplay.deprecated
 */
export const SimpleChecklistDisplay: React.FC<SimpleChecklistDisplayProps> = ({
  content,
}) => {
  const lines = content.split('\n');
  
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Text key={index} color="yellow">
          {line}
        </Text>
      ))}
    </Box>
  );
};