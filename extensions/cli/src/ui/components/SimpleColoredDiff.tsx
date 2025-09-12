import { Box, Text } from "ink";
import React from "react";

interface SimpleColoredDiffProps {
  diffContent: string;
}

/**
 * Simple diff display for tool previews - replaces ColoredDiff.deprecated
 */
export const SimpleColoredDiff: React.FC<SimpleColoredDiffProps> = ({
  diffContent,
}) => {
  const lines = diffContent.split('\n');
  
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => {
        let color = "white";
        if (line.startsWith('+')) {
          color = "green";
        } else if (line.startsWith('-')) {
          color = "red";
        }
        
        return (
          <Text key={index} color={color}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
};