export interface CodexMessageContent {
  type: 'input_text' | 'output_text';
  text: string;
}

export interface CodexMessageItem {
  type: 'message';
  role: 'system' | 'user' | 'assistant';
  content: CodexMessageContent[];
}

export interface CodexFunctionCallItem {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
}

export interface CodexFunctionCallOutputItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export type CodexInputItem =
  | CodexMessageItem
  | CodexFunctionCallItem
  | CodexFunctionCallOutputItem;

export interface CodexFunctionTool {
  type: 'function';
  name: string;
  description: string;
  strict: boolean;
  parameters: Record<string, any>;
}

export type CodexTool = CodexFunctionTool;

export type CodexToolChoice =
  | 'auto'
  | 'none'
  | {
      type: 'function';
      function: { name: string };
    };

export interface CodexRequest {
  model: string;
  instructions: string;
  input: CodexInputItem[];
  tools?: CodexTool[];
  tool_choice?: CodexToolChoice;
  parallel_tool_calls?: boolean;
  reasoning?: {
    effort?: string;
    summary?: string;
    [key: string]: unknown;
  } | null;
  store?: boolean;
  stream: boolean;
  include?: string[];
  prompt_cache_key?: string;
  text?: {
    verbosity?: 'low' | 'medium' | 'high';
  };
}
