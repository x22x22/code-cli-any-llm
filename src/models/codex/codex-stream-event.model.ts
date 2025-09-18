export interface CodexStreamEvent {
  type?: string;
  response?: {
    id?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };
  item?: {
    type?: string;
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
    call_id?: string;
    name?: string;
    arguments?: string;
    input?: string;
    output?: unknown;
    [key: string]: unknown;
  };
  delta?:
    | string
    | {
        text?: string;
        arguments?: string;
        call_id?: string;
        name?: string;
        [key: string]: unknown;
      };
  text?: string;
  content?: string;
  message?: {
    content?: Array<{ text?: string }>;
  };
  [key: string]: unknown;
}
