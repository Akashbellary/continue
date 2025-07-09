import { ChatMessage, PromptLog, ToolCallDelta } from "../..";
import { renderChatMessage } from "../../util/messageContent";
import { detectToolCallStart } from "./detectToolCallStart";
import { generateOpenAIToolCallId } from "./openAiToolCallId";
import { parsePartialXml } from "./parsePartialXmlToolCall";
import { getStringDelta, splitAtTagsAndCodeblocks } from "./xmlToolUtils";

/*
    Function to intercept tool calls in XML format from a chat message stream
    1. Skips non-assistant messages
    2. Skips xml that doesn't have root "tool_call" tag
    3. Intercepts text that contains a partial <tool_call> tag at the beginning, e.g. "<too" and simply adds to buffer
    4. Once confirmed in tool call (buffer starts with <tool_call>), performs partial XML parsing
    5. Successful partial parsing yields JSON tool call delta with previous partial parses removed
    6. Failed partial parsing just adds to buffer and continues
    7. Closes when closed </tool_call> tag is found
    8. TERMINATES AFTER THE FIRST TOOL CALL - TODO - REMOVE THIS FOR PARALLEL SUPPORT
*/
export async function* interceptXMLToolCalls(
  messageGenerator: AsyncGenerator<ChatMessage[], PromptLog | undefined>,
  abortController: AbortController,
): AsyncGenerator<ChatMessage[], PromptLog | undefined> {
  let toolCallText = "";
  let currentToolCallId: string | undefined = undefined;
  let currentToolCallArgs: string = "";
  let inToolCall = false;

  let done = false;
  let buffer = "";

  while (true) {
    if (abortController.signal.aborted) {
      done = true;
    }

    const result = await messageGenerator.next();
    if (result.done) {
      return result.value;
    } else {
      for await (const message of result.value) {
        if (done) {
          break;
        }
        // Skip non-assistant messages or messages with native tool calls
        if (message.role !== "assistant" || message.toolCalls) {
          yield [message];
          continue;
        }

        const content = renderChatMessage(message);
        const splitContent = splitAtTagsAndCodeblocks(content); // split at tag starts/ends e.g. < >
        for (const chunk of splitContent) {
          buffer += chunk;
          if (!inToolCall) {
            const { isInPartialStart, isInToolCall, modifiedBuffer } =
              detectToolCallStart(buffer);

            if (isInPartialStart) {
              continue;
            }
            if (isInToolCall) {
              inToolCall = true;
              buffer = modifiedBuffer;
            }
          }

          if (inToolCall) {
            if (!currentToolCallId) {
              currentToolCallId = generateOpenAIToolCallId();
            }
            toolCallText += buffer;

            // Handle tool call
            const parsed = parsePartialXml(toolCallText);

            if (parsed?.tool_call?.tool_name) {
              const args = parsed.tool_call.args
                ? JSON.stringify(parsed.tool_call.args)
                : "";

              const argsDelta = getStringDelta(currentToolCallArgs, args);

              const toolCallDelta: ToolCallDelta = {
                id: currentToolCallId,
                type: "function",
                function: {
                  name: parsed.tool_call.tool_name,
                  arguments: argsDelta,
                },
              };

              currentToolCallArgs = args;

              yield [
                {
                  ...message,
                  content: "",
                  toolCalls: [toolCallDelta],
                },
              ];
            } else {
              // Prevent dispatching with empty name
              buffer = "";
              continue;
            }

            // Check for exit from tool call
            if (
              toolCallText.includes("</tool_call>") // parallel might need better handling for xml that comes in codeblocks
            ) {
              inToolCall = false;
              toolCallText = "";
              currentToolCallId = undefined;
              currentToolCallArgs = "";

              // Terminate at first tool call TODO parallel support
              done = true;
              break;
            }
          } else {
            // Yield normal assistant message
            yield [
              {
                ...message,
                content: buffer,
              },
            ];
          }
          buffer = "";
        }
      }
    }
  }
}
