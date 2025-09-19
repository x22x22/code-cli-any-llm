# Count Message tokens

> Count the number of tokens in a Message.

The Token Count API can be used to count the number of tokens in a Message, including tools, images, and documents, without creating it.

Learn more about token counting in our [user guide](/en/docs/build-with-claude/token-counting)

## OpenAPI

````yaml post /v1/messages/count_tokens
paths:
  path: /v1/messages/count_tokens
  method: post
  servers:
    - url: https://api.anthropic.com
  request:
    security: []
    parameters:
      path: {}
      query: {}
      header:
        anthropic-beta:
          schema:
            - type: array
              items:
                allOf:
                  - type: string
              required: false
              title: Anthropic-Beta
              description: >-
                Optional header to specify the beta version(s) you want to use.


                To use multiple betas, use a comma separated list like
                `beta1,beta2` or specify the header multiple times for each
                beta.
        anthropic-version:
          schema:
            - type: string
              required: true
              title: Anthropic-Version
              description: >-
                The version of the Claude API you want to use.


                Read more about versioning and our version history
                [here](https://docs.claude.com/en/api/versioning).
        x-api-key:
          schema:
            - type: string
              required: true
              title: X-Api-Key
              description: >-
                Your unique API key for authentication.


                This key is required in the header of all API requests, to
                authenticate your account and access Anthropic's services. Get
                your API key through the
                [Console](https://console.anthropic.com/settings/keys). Each key
                is scoped to a Workspace.
      cookie: {}
    body:
      application/json:
        schemaArray:
          - type: object
            properties:
              mcp_servers:
                allOf:
                  - description: MCP servers to be utilized in this request
                    items:
                      $ref: '#/components/schemas/RequestMCPServerURLDefinition'
                    maxItems: 20
                    title: Mcp Servers
                    type: array
              messages:
                allOf:
                  - description: >-
                      Input messages.


                      Our models are trained to operate on alternating `user`
                      and `assistant` conversational turns. When creating a new
                      `Message`, you specify the prior conversational turns with
                      the `messages` parameter, and the model then generates the
                      next `Message` in the conversation. Consecutive `user` or
                      `assistant` turns in your request will be combined into a
                      single turn.


                      Each input message must be an object with a `role` and
                      `content`. You can specify a single `user`-role message,
                      or you can include multiple `user` and `assistant`
                      messages.


                      If the final message uses the `assistant` role, the
                      response content will continue immediately from the
                      content in that message. This can be used to constrain
                      part of the model's response.


                      Example with a single `user` message:


                      ```json

                      [{"role": "user", "content": "Hello, Claude"}]

                      ```


                      Example with multiple conversational turns:


                      ```json

                      [
                        {"role": "user", "content": "Hello there."},
                        {"role": "assistant", "content": "Hi, I'm Claude. How can I help you?"},
                        {"role": "user", "content": "Can you explain LLMs in plain English?"},
                      ]

                      ```


                      Example with a partially-filled response from Claude:


                      ```json

                      [
                        {"role": "user", "content": "What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun"},
                        {"role": "assistant", "content": "The best answer is ("},
                      ]

                      ```


                      Each input message `content` may be either a single
                      `string` or an array of content blocks, where each block
                      has a specific `type`. Using a `string` for `content` is
                      shorthand for an array of one content block of type
                      `"text"`. The following input messages are equivalent:


                      ```json

                      {"role": "user", "content": "Hello, Claude"}

                      ```


                      ```json

                      {"role": "user", "content": [{"type": "text", "text":
                      "Hello, Claude"}]}

                      ```


                      See [input
                      examples](https://docs.claude.com/en/api/messages-examples).


                      Note that if you want to include a [system
                      prompt](https://docs.claude.com/en/docs/system-prompts),
                      you can use the top-level `system` parameter — there is no
                      `"system"` role for input messages in the Messages API.


                      There is a limit of 100,000 messages in a single request.
                    items:
                      $ref: '#/components/schemas/InputMessage'
                    title: Messages
                    type: array
              model:
                allOf:
                  - description: >-
                      The model that will complete your prompt.


                      See
                      [models](https://docs.claude.com/en/docs/models-overview)
                      for additional details and options.
                    examples:
                      - claude-sonnet-4-20250514
                    maxLength: 256
                    minLength: 1
                    title: Model
                    type: string
              system:
                allOf:
                  - anyOf:
                      - type: string
                      - items:
                          $ref: '#/components/schemas/RequestTextBlock'
                        type: array
                    description: >-
                      System prompt.


                      A system prompt is a way of providing context and
                      instructions to Claude, such as specifying a particular
                      goal or role. See our [guide to system
                      prompts](https://docs.claude.com/en/docs/system-prompts).
                    examples:
                      - - text: Today's date is 2024-06-01.
                          type: text
                      - Today's date is 2023-01-01.
                    title: System
              thinking:
                allOf:
                  - description: >-
                      Configuration for enabling Claude's extended thinking. 


                      When enabled, responses include `thinking` content blocks
                      showing Claude's thinking process before the final answer.
                      Requires a minimum budget of 1,024 tokens and counts
                      towards your `max_tokens` limit.


                      See [extended
                      thinking](https://docs.claude.com/en/docs/build-with-claude/extended-thinking)
                      for details.
                    discriminator:
                      mapping:
                        disabled: '#/components/schemas/ThinkingConfigDisabled'
                        enabled: '#/components/schemas/ThinkingConfigEnabled'
                      propertyName: type
                    oneOf:
                      - $ref: '#/components/schemas/ThinkingConfigEnabled'
                      - $ref: '#/components/schemas/ThinkingConfigDisabled'
              tool_choice:
                allOf:
                  - description: >-
                      How the model should use the provided tools. The model can
                      use a specific tool, any available tool, decide by itself,
                      or not use tools at all.
                    discriminator:
                      mapping:
                        any: '#/components/schemas/ToolChoiceAny'
                        auto: '#/components/schemas/ToolChoiceAuto'
                        none: '#/components/schemas/ToolChoiceNone'
                        tool: '#/components/schemas/ToolChoiceTool'
                      propertyName: type
                    oneOf:
                      - $ref: '#/components/schemas/ToolChoiceAuto'
                      - $ref: '#/components/schemas/ToolChoiceAny'
                      - $ref: '#/components/schemas/ToolChoiceTool'
                      - $ref: '#/components/schemas/ToolChoiceNone'
              tools:
                allOf:
                  - description: >-
                      Definitions of tools that the model may use.


                      If you include `tools` in your API request, the model may
                      return `tool_use` content blocks that represent the
                      model's use of those tools. You can then run those tools
                      using the tool input generated by the model and then
                      optionally return results back to the model using
                      `tool_result` content blocks.


                      There are two types of tools: **client tools** and
                      **server tools**. The behavior described below applies to
                      client tools. For [server
                      tools](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview\#server-tools),
                      see their individual documentation as each has its own
                      behavior (e.g., the [web search
                      tool](https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool)).


                      Each tool definition includes:


                      * `name`: Name of the tool.

                      * `description`: Optional, but strongly-recommended
                      description of the tool.

                      * `input_schema`: [JSON
                      schema](https://json-schema.org/draft/2020-12) for the
                      tool `input` shape that the model will produce in
                      `tool_use` output content blocks.


                      For example, if you defined `tools` as:


                      ```json

                      [
                        {
                          "name": "get_stock_price",
                          "description": "Get the current stock price for a given ticker symbol.",
                          "input_schema": {
                            "type": "object",
                            "properties": {
                              "ticker": {
                                "type": "string",
                                "description": "The stock ticker symbol, e.g. AAPL for Apple Inc."
                              }
                            },
                            "required": ["ticker"]
                          }
                        }
                      ]

                      ```


                      And then asked the model "What's the S&P 500 at today?",
                      the model might produce `tool_use` content blocks in the
                      response like this:


                      ```json

                      [
                        {
                          "type": "tool_use",
                          "id": "toolu_01D7FLrfh4GYq7yT1ULFeyMV",
                          "name": "get_stock_price",
                          "input": { "ticker": "^GSPC" }
                        }
                      ]

                      ```


                      You might then run your `get_stock_price` tool with
                      `{"ticker": "^GSPC"}` as an input, and return the
                      following back to the model in a subsequent `user`
                      message:


                      ```json

                      [
                        {
                          "type": "tool_result",
                          "tool_use_id": "toolu_01D7FLrfh4GYq7yT1ULFeyMV",
                          "content": "259.75 USD"
                        }
                      ]

                      ```


                      Tools can be used for workflows that include running
                      client-side tools and functions, or more generally
                      whenever you want the model to produce a particular JSON
                      structure of output.


                      See our [guide](https://docs.claude.com/en/docs/tool-use)
                      for more details.
                    examples:
                      - description: Get the current weather in a given location
                        input_schema:
                          properties:
                            location:
                              description: The city and state, e.g. San Francisco, CA
                              type: string
                            unit:
                              description: >-
                                Unit for the output - one of (celsius,
                                fahrenheit)
                              type: string
                          required:
                            - location
                          type: object
                        name: get_weather
                    items:
                      oneOf:
                        - $ref: '#/components/schemas/Tool'
                        - $ref: '#/components/schemas/BashTool_20241022'
                        - $ref: '#/components/schemas/BashTool_20250124'
                        - $ref: '#/components/schemas/CodeExecutionTool_20250522'
                        - $ref: '#/components/schemas/CodeExecutionTool_20250825'
                        - $ref: '#/components/schemas/ComputerUseTool_20241022'
                        - $ref: '#/components/schemas/ComputerUseTool_20250124'
                        - $ref: '#/components/schemas/TextEditor_20241022'
                        - $ref: '#/components/schemas/TextEditor_20250124'
                        - $ref: '#/components/schemas/TextEditor_20250429'
                        - $ref: '#/components/schemas/TextEditor_20250728'
                        - $ref: '#/components/schemas/WebSearchTool_20250305'
                        - $ref: '#/components/schemas/WebFetchTool_20250910'
                    title: Tools
                    type: array
            required: true
            title: CountMessageTokensParams
            refIdentifier: '#/components/schemas/CountMessageTokensParams'
            examples:
              - messages: &ref_0
                  - content: Hello, world
                    role: user
                model: claude-sonnet-4-20250514
            requiredProperties:
              - messages
              - model
            additionalProperties: false
            example:
              messages: *ref_0
              model: claude-sonnet-4-20250514
        examples:
          example:
            value:
              messages:
                - content: Hello, world
                  role: user
              model: claude-sonnet-4-20250514
    codeSamples:
      - lang: bash
        source: |-
          curl https://api.anthropic.com/v1/messages/count_tokens \
               --header "x-api-key: $ANTHROPIC_API_KEY" \
               --header "anthropic-version: 2023-06-01" \
               --header "content-type: application/json" \
               --data \
          '{
              "model": "claude-3-7-sonnet-20250219",
              "messages": [
                  {"role": "user", "content": "Hello, world"}
              ]
          }'
      - lang: python
        source: |-
          import anthropic

          anthropic.Anthropic().messages.count_tokens(
              model="claude-3-7-sonnet-20250219",
              messages=[
                  {"role": "user", "content": "Hello, world"}
              ]
          )
      - lang: javascript
        source: |-
          import { Anthropic } from '@anthropic-ai/sdk';

          const anthropic = new Anthropic();

          await anthropic.messages.countTokens({
            model: "claude-3-7-sonnet-20250219",
            messages: [
              {"role": "user", "content": "Hello, world"}
            ]
          });
  response:
    '200':
      application/json:
        schemaArray:
          - type: object
            properties:
              input_tokens:
                allOf:
                  - type: integer
                    title: Input Tokens
                    description: >-
                      The total number of tokens across the provided list of
                      messages, system prompt, and tools.
                    examples:
                      - 2095
            title: CountMessageTokensResponse
            refIdentifier: '#/components/schemas/CountMessageTokensResponse'
            examples:
              - input_tokens: 2095
            requiredProperties:
              - input_tokens
            example:
              input_tokens: 2095
        examples:
          example:
            value:
              input_tokens: 2095
        description: Successful Response
    4XX:
      application/json:
        schemaArray:
          - type: object
            properties:
              error:
                allOf:
                  - discriminator:
                      mapping:
                        api_error: '#/components/schemas/APIError'
                        authentication_error: '#/components/schemas/AuthenticationError'
                        billing_error: '#/components/schemas/BillingError'
                        invalid_request_error: '#/components/schemas/InvalidRequestError'
                        not_found_error: '#/components/schemas/NotFoundError'
                        overloaded_error: '#/components/schemas/OverloadedError'
                        permission_error: '#/components/schemas/PermissionError'
                        rate_limit_error: '#/components/schemas/RateLimitError'
                        timeout_error: '#/components/schemas/GatewayTimeoutError'
                      propertyName: type
                    oneOf:
                      - $ref: '#/components/schemas/InvalidRequestError'
                      - $ref: '#/components/schemas/AuthenticationError'
                      - $ref: '#/components/schemas/BillingError'
                      - $ref: '#/components/schemas/PermissionError'
                      - $ref: '#/components/schemas/NotFoundError'
                      - $ref: '#/components/schemas/RateLimitError'
                      - $ref: '#/components/schemas/GatewayTimeoutError'
                      - $ref: '#/components/schemas/APIError'
                      - $ref: '#/components/schemas/OverloadedError'
                    title: Error
              request_id:
                allOf:
                  - anyOf:
                      - type: string
                      - type: 'null'
                    default: null
                    title: Request Id
              type:
                allOf:
                  - const: error
                    default: error
                    enum:
                      - error
                    title: Type
                    type: string
            title: ErrorResponse
            refIdentifier: '#/components/schemas/ErrorResponse'
            requiredProperties:
              - error
              - request_id
              - type
        examples:
          example:
            value:
              error:
                message: Invalid request
                type: invalid_request_error
              request_id: <string>
              type: error
        description: >-
          Error response.


          See our [errors documentation](https://docs.claude.com/en/api/errors)
          for more details.
  deprecated: false
  type: path
components:
  schemas:
    APIError:
      properties:
        message:
          default: Internal server error
          title: Message
          type: string
        type:
          const: api_error
          default: api_error
          enum:
            - api_error
          title: Type
          type: string
      required:
        - message
        - type
      title: APIError
      type: object
    AuthenticationError:
      properties:
        message:
          default: Authentication error
          title: Message
          type: string
        type:
          const: authentication_error
          default: authentication_error
          enum:
            - authentication_error
          title: Type
          type: string
      required:
        - message
        - type
      title: AuthenticationError
      type: object
    Base64ImageSource:
      additionalProperties: false
      properties:
        data:
          format: byte
          title: Data
          type: string
        media_type:
          enum:
            - image/jpeg
            - image/png
            - image/gif
            - image/webp
          title: Media Type
          type: string
        type:
          const: base64
          enum:
            - base64
          title: Type
          type: string
      required:
        - data
        - media_type
        - type
      title: Base64ImageSource
      type: object
    Base64PDFSource:
      additionalProperties: false
      properties:
        data:
          format: byte
          title: Data
          type: string
        media_type:
          const: application/pdf
          enum:
            - application/pdf
          title: Media Type
          type: string
        type:
          const: base64
          enum:
            - base64
          title: Type
          type: string
      required:
        - data
        - media_type
        - type
      title: PDF (base64)
      type: object
    BashCodeExecutionToolResultErrorCode:
      enum:
        - invalid_tool_input
        - unavailable
        - too_many_requests
        - execution_time_exceeded
        - output_file_too_large
      title: BashCodeExecutionToolResultErrorCode
      type: string
    BashTool_20241022:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        name:
          const: bash
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          enum:
            - bash
          title: Name
          type: string
        type:
          const: bash_20241022
          enum:
            - bash_20241022
          title: Type
          type: string
      required:
        - name
        - type
      title: Bash tool (2024-10-22)
      type: object
    BashTool_20250124:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        name:
          const: bash
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          enum:
            - bash
          title: Name
          type: string
        type:
          const: bash_20250124
          enum:
            - bash_20250124
          title: Type
          type: string
      required:
        - name
        - type
      title: Bash tool (2025-01-24)
      type: object
    BillingError:
      properties:
        message:
          default: Billing error
          title: Message
          type: string
        type:
          const: billing_error
          default: billing_error
          enum:
            - billing_error
          title: Type
          type: string
      required:
        - message
        - type
      title: BillingError
      type: object
    CacheControlEphemeral:
      additionalProperties: false
      properties:
        ttl:
          description: |-
            The time-to-live for the cache control breakpoint.

            This may be one the following values:
            - `5m`: 5 minutes
            - `1h`: 1 hour

            Defaults to `5m`.
          enum:
            - 5m
            - 1h
          title: Ttl
          type: string
        type:
          const: ephemeral
          enum:
            - ephemeral
          title: Type
          type: string
      required:
        - type
      title: CacheControlEphemeral
      type: object
    CodeExecutionToolResultErrorCode:
      enum:
        - invalid_tool_input
        - unavailable
        - too_many_requests
        - execution_time_exceeded
      title: CodeExecutionToolResultErrorCode
      type: string
    CodeExecutionTool_20250522:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        name:
          const: code_execution
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          enum:
            - code_execution
          title: Name
          type: string
        type:
          const: code_execution_20250522
          enum:
            - code_execution_20250522
          title: Type
          type: string
      required:
        - name
        - type
      title: Code execution tool (2025-05-22)
      type: object
    CodeExecutionTool_20250825:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        name:
          const: code_execution
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          enum:
            - code_execution
          title: Name
          type: string
        type:
          const: code_execution_20250825
          enum:
            - code_execution_20250825
          title: Type
          type: string
      required:
        - name
        - type
      title: CodeExecutionTool_20250825
      type: object
    ComputerUseTool_20241022:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        display_height_px:
          description: The height of the display in pixels.
          minimum: 1
          title: Display Height Px
          type: integer
        display_number:
          anyOf:
            - minimum: 0
              type: integer
            - type: 'null'
          description: The X11 display number (e.g. 0, 1) for the display.
          title: Display Number
        display_width_px:
          description: The width of the display in pixels.
          minimum: 1
          title: Display Width Px
          type: integer
        name:
          const: computer
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          enum:
            - computer
          title: Name
          type: string
        type:
          const: computer_20241022
          enum:
            - computer_20241022
          title: Type
          type: string
      required:
        - display_height_px
        - display_width_px
        - name
        - type
      title: Computer use tool (2024-01-22)
      type: object
    ComputerUseTool_20250124:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        display_height_px:
          description: The height of the display in pixels.
          minimum: 1
          title: Display Height Px
          type: integer
        display_number:
          anyOf:
            - minimum: 0
              type: integer
            - type: 'null'
          description: The X11 display number (e.g. 0, 1) for the display.
          title: Display Number
        display_width_px:
          description: The width of the display in pixels.
          minimum: 1
          title: Display Width Px
          type: integer
        name:
          const: computer
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          enum:
            - computer
          title: Name
          type: string
        type:
          const: computer_20250124
          enum:
            - computer_20250124
          title: Type
          type: string
      required:
        - display_height_px
        - display_width_px
        - name
        - type
      title: Computer use tool (2025-01-24)
      type: object
    ContentBlockSource:
      additionalProperties: false
      properties:
        content:
          anyOf:
            - type: string
            - items:
                discriminator:
                  mapping:
                    image: '#/components/schemas/RequestImageBlock'
                    text: '#/components/schemas/RequestTextBlock'
                  propertyName: type
                oneOf:
                  - $ref: '#/components/schemas/RequestTextBlock'
                  - $ref: '#/components/schemas/RequestImageBlock'
              type: array
          title: Content
        type:
          const: content
          enum:
            - content
          title: Type
          type: string
      required:
        - content
        - type
      title: Content block
      type: object
    FileDocumentSource:
      additionalProperties: false
      properties:
        file_id:
          title: File Id
          type: string
        type:
          const: file
          enum:
            - file
          title: Type
          type: string
      required:
        - file_id
        - type
      title: File document
      type: object
    FileImageSource:
      additionalProperties: false
      properties:
        file_id:
          title: File Id
          type: string
        type:
          const: file
          enum:
            - file
          title: Type
          type: string
      required:
        - file_id
        - type
      title: FileImageSource
      type: object
    GatewayTimeoutError:
      properties:
        message:
          default: Request timeout
          title: Message
          type: string
        type:
          const: timeout_error
          default: timeout_error
          enum:
            - timeout_error
          title: Type
          type: string
      required:
        - message
        - type
      title: GatewayTimeoutError
      type: object
    InputMessage:
      additionalProperties: false
      properties:
        content:
          anyOf:
            - type: string
            - items:
                discriminator:
                  mapping:
                    bash_code_execution_tool_result: >-
                      #/components/schemas/RequestBashCodeExecutionToolResultBlock
                    code_execution_tool_result: '#/components/schemas/RequestCodeExecutionToolResultBlock'
                    container_upload: '#/components/schemas/RequestContainerUploadBlock'
                    document: '#/components/schemas/RequestDocumentBlock'
                    image: '#/components/schemas/RequestImageBlock'
                    mcp_tool_result: '#/components/schemas/RequestMCPToolResultBlock'
                    mcp_tool_use: '#/components/schemas/RequestMCPToolUseBlock'
                    redacted_thinking: '#/components/schemas/RequestRedactedThinkingBlock'
                    search_result: '#/components/schemas/RequestSearchResultBlock'
                    server_tool_use: '#/components/schemas/RequestServerToolUseBlock'
                    text: '#/components/schemas/RequestTextBlock'
                    text_editor_code_execution_tool_result: >-
                      #/components/schemas/RequestTextEditorCodeExecutionToolResultBlock
                    thinking: '#/components/schemas/RequestThinkingBlock'
                    tool_result: '#/components/schemas/RequestToolResultBlock'
                    tool_use: '#/components/schemas/RequestToolUseBlock'
                    web_fetch_tool_result: '#/components/schemas/RequestWebFetchToolResultBlock'
                    web_search_tool_result: '#/components/schemas/RequestWebSearchToolResultBlock'
                  propertyName: type
                oneOf:
                  - $ref: '#/components/schemas/RequestTextBlock'
                    description: Regular text content.
                  - $ref: '#/components/schemas/RequestImageBlock'
                    description: >-
                      Image content specified directly as base64 data or as a
                      reference via a URL.
                  - $ref: '#/components/schemas/RequestDocumentBlock'
                    description: >-
                      Document content, either specified directly as base64
                      data, as text, or as a reference via a URL.
                  - $ref: '#/components/schemas/RequestSearchResultBlock'
                    description: >-
                      A search result block containing source, title, and
                      content from search operations.
                  - $ref: '#/components/schemas/RequestThinkingBlock'
                    description: A block specifying internal thinking by the model.
                  - $ref: '#/components/schemas/RequestRedactedThinkingBlock'
                    description: >-
                      A block specifying internal, redacted thinking by the
                      model.
                  - $ref: '#/components/schemas/RequestToolUseBlock'
                    description: A block indicating a tool use by the model.
                  - $ref: '#/components/schemas/RequestToolResultBlock'
                    description: A block specifying the results of a tool use by the model.
                  - $ref: '#/components/schemas/RequestServerToolUseBlock'
                  - $ref: '#/components/schemas/RequestWebSearchToolResultBlock'
                  - $ref: '#/components/schemas/RequestWebFetchToolResultBlock'
                  - $ref: '#/components/schemas/RequestCodeExecutionToolResultBlock'
                  - $ref: >-
                      #/components/schemas/RequestBashCodeExecutionToolResultBlock
                  - $ref: >-
                      #/components/schemas/RequestTextEditorCodeExecutionToolResultBlock
                  - $ref: '#/components/schemas/RequestMCPToolUseBlock'
                  - $ref: '#/components/schemas/RequestMCPToolResultBlock'
                  - $ref: '#/components/schemas/RequestContainerUploadBlock'
              type: array
          title: Content
        role:
          enum:
            - user
            - assistant
          title: Role
          type: string
      required:
        - content
        - role
      title: InputMessage
      type: object
    InputSchema:
      additionalProperties: true
      properties:
        properties:
          anyOf:
            - type: object
            - type: 'null'
          title: Properties
        required:
          anyOf:
            - items:
                type: string
              type: array
            - type: 'null'
          title: Required
        type:
          const: object
          enum:
            - object
          title: Type
          type: string
      required:
        - type
      title: InputSchema
      type: object
    InvalidRequestError:
      properties:
        message:
          default: Invalid request
          title: Message
          type: string
        type:
          const: invalid_request_error
          default: invalid_request_error
          enum:
            - invalid_request_error
          title: Type
          type: string
      required:
        - message
        - type
      title: InvalidRequestError
      type: object
    NotFoundError:
      properties:
        message:
          default: Not found
          title: Message
          type: string
        type:
          const: not_found_error
          default: not_found_error
          enum:
            - not_found_error
          title: Type
          type: string
      required:
        - message
        - type
      title: NotFoundError
      type: object
    OverloadedError:
      properties:
        message:
          default: Overloaded
          title: Message
          type: string
        type:
          const: overloaded_error
          default: overloaded_error
          enum:
            - overloaded_error
          title: Type
          type: string
      required:
        - message
        - type
      title: OverloadedError
      type: object
    PermissionError:
      properties:
        message:
          default: Permission denied
          title: Message
          type: string
        type:
          const: permission_error
          default: permission_error
          enum:
            - permission_error
          title: Type
          type: string
      required:
        - message
        - type
      title: PermissionError
      type: object
    PlainTextSource:
      additionalProperties: false
      properties:
        data:
          title: Data
          type: string
        media_type:
          const: text/plain
          enum:
            - text/plain
          title: Media Type
          type: string
        type:
          const: text
          enum:
            - text
          title: Type
          type: string
      required:
        - data
        - media_type
        - type
      title: Plain text
      type: object
    RateLimitError:
      properties:
        message:
          default: Rate limited
          title: Message
          type: string
        type:
          const: rate_limit_error
          default: rate_limit_error
          enum:
            - rate_limit_error
          title: Type
          type: string
      required:
        - message
        - type
      title: RateLimitError
      type: object
    RequestBashCodeExecutionOutputBlock:
      additionalProperties: false
      properties:
        file_id:
          title: File Id
          type: string
        type:
          const: bash_code_execution_output
          enum:
            - bash_code_execution_output
          title: Type
          type: string
      required:
        - file_id
        - type
      title: RequestBashCodeExecutionOutputBlock
      type: object
    RequestBashCodeExecutionResultBlock:
      additionalProperties: false
      properties:
        content:
          items:
            $ref: '#/components/schemas/RequestBashCodeExecutionOutputBlock'
          title: Content
          type: array
        return_code:
          title: Return Code
          type: integer
        stderr:
          title: Stderr
          type: string
        stdout:
          title: Stdout
          type: string
        type:
          const: bash_code_execution_result
          enum:
            - bash_code_execution_result
          title: Type
          type: string
      required:
        - content
        - return_code
        - stderr
        - stdout
        - type
      title: RequestBashCodeExecutionResultBlock
      type: object
    RequestBashCodeExecutionToolResultBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        content:
          anyOf:
            - $ref: '#/components/schemas/RequestBashCodeExecutionToolResultError'
            - $ref: '#/components/schemas/RequestBashCodeExecutionResultBlock'
          title: Content
        tool_use_id:
          pattern: ^srvtoolu_[a-zA-Z0-9_]+$
          title: Tool Use Id
          type: string
        type:
          const: bash_code_execution_tool_result
          enum:
            - bash_code_execution_tool_result
          title: Type
          type: string
      required:
        - content
        - tool_use_id
        - type
      title: RequestBashCodeExecutionToolResultBlock
      type: object
    RequestBashCodeExecutionToolResultError:
      additionalProperties: false
      properties:
        error_code:
          $ref: '#/components/schemas/BashCodeExecutionToolResultErrorCode'
        type:
          const: bash_code_execution_tool_result_error
          enum:
            - bash_code_execution_tool_result_error
          title: Type
          type: string
      required:
        - error_code
        - type
      title: RequestBashCodeExecutionToolResultError
      type: object
    RequestCharLocationCitation:
      additionalProperties: false
      properties:
        cited_text:
          title: Cited Text
          type: string
        document_index:
          minimum: 0
          title: Document Index
          type: integer
        document_title:
          anyOf:
            - maxLength: 255
              minLength: 1
              type: string
            - type: 'null'
          title: Document Title
        end_char_index:
          title: End Char Index
          type: integer
        start_char_index:
          minimum: 0
          title: Start Char Index
          type: integer
        type:
          const: char_location
          enum:
            - char_location
          title: Type
          type: string
      required:
        - cited_text
        - document_index
        - document_title
        - end_char_index
        - start_char_index
        - type
      title: Character location
      type: object
    RequestCitationsConfig:
      additionalProperties: false
      properties:
        enabled:
          title: Enabled
          type: boolean
      title: RequestCitationsConfig
      type: object
    RequestCodeExecutionOutputBlock:
      additionalProperties: false
      properties:
        file_id:
          title: File Id
          type: string
        type:
          const: code_execution_output
          enum:
            - code_execution_output
          title: Type
          type: string
      required:
        - file_id
        - type
      title: RequestCodeExecutionOutputBlock
      type: object
    RequestCodeExecutionResultBlock:
      additionalProperties: false
      properties:
        content:
          items:
            $ref: '#/components/schemas/RequestCodeExecutionOutputBlock'
          title: Content
          type: array
        return_code:
          title: Return Code
          type: integer
        stderr:
          title: Stderr
          type: string
        stdout:
          title: Stdout
          type: string
        type:
          const: code_execution_result
          enum:
            - code_execution_result
          title: Type
          type: string
      required:
        - content
        - return_code
        - stderr
        - stdout
        - type
      title: Code execution result
      type: object
    RequestCodeExecutionToolResultBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        content:
          anyOf:
            - $ref: '#/components/schemas/RequestCodeExecutionToolResultError'
            - $ref: '#/components/schemas/RequestCodeExecutionResultBlock'
          title: Content
        tool_use_id:
          pattern: ^srvtoolu_[a-zA-Z0-9_]+$
          title: Tool Use Id
          type: string
        type:
          const: code_execution_tool_result
          enum:
            - code_execution_tool_result
          title: Type
          type: string
      required:
        - content
        - tool_use_id
        - type
      title: Code execution tool result
      type: object
    RequestCodeExecutionToolResultError:
      additionalProperties: false
      properties:
        error_code:
          $ref: '#/components/schemas/CodeExecutionToolResultErrorCode'
        type:
          const: code_execution_tool_result_error
          enum:
            - code_execution_tool_result_error
          title: Type
          type: string
      required:
        - error_code
        - type
      title: Code execution tool error
      type: object
    RequestContainerUploadBlock:
      additionalProperties: false
      description: >-
        A content block that represents a file to be uploaded to the container

        Files uploaded via this block will be available in the container's input
        directory.
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        file_id:
          title: File Id
          type: string
        type:
          const: container_upload
          enum:
            - container_upload
          title: Type
          type: string
      required:
        - file_id
        - type
      title: Container upload
      type: object
    RequestContentBlockLocationCitation:
      additionalProperties: false
      properties:
        cited_text:
          title: Cited Text
          type: string
        document_index:
          minimum: 0
          title: Document Index
          type: integer
        document_title:
          anyOf:
            - maxLength: 255
              minLength: 1
              type: string
            - type: 'null'
          title: Document Title
        end_block_index:
          title: End Block Index
          type: integer
        start_block_index:
          minimum: 0
          title: Start Block Index
          type: integer
        type:
          const: content_block_location
          enum:
            - content_block_location
          title: Type
          type: string
      required:
        - cited_text
        - document_index
        - document_title
        - end_block_index
        - start_block_index
        - type
      title: Content block location
      type: object
    RequestDocumentBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        citations:
          anyOf:
            - $ref: '#/components/schemas/RequestCitationsConfig'
            - type: 'null'
        context:
          anyOf:
            - minLength: 1
              type: string
            - type: 'null'
          title: Context
        source:
          discriminator:
            mapping:
              base64: '#/components/schemas/Base64PDFSource'
              content: '#/components/schemas/ContentBlockSource'
              file: '#/components/schemas/FileDocumentSource'
              text: '#/components/schemas/PlainTextSource'
              url: '#/components/schemas/URLPDFSource'
            propertyName: type
          oneOf:
            - $ref: '#/components/schemas/Base64PDFSource'
            - $ref: '#/components/schemas/PlainTextSource'
            - $ref: '#/components/schemas/ContentBlockSource'
            - $ref: '#/components/schemas/URLPDFSource'
            - $ref: '#/components/schemas/FileDocumentSource'
        title:
          anyOf:
            - maxLength: 500
              minLength: 1
              type: string
            - type: 'null'
          title: Title
        type:
          const: document
          enum:
            - document
          title: Type
          type: string
      required:
        - source
        - type
      title: Document
      type: object
    RequestImageBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        source:
          discriminator:
            mapping:
              base64: '#/components/schemas/Base64ImageSource'
              file: '#/components/schemas/FileImageSource'
              url: '#/components/schemas/URLImageSource'
            propertyName: type
          oneOf:
            - $ref: '#/components/schemas/Base64ImageSource'
            - $ref: '#/components/schemas/URLImageSource'
            - $ref: '#/components/schemas/FileImageSource'
          title: Source
        type:
          const: image
          enum:
            - image
          title: Type
          type: string
      required:
        - source
        - type
      title: Image
      type: object
    RequestMCPServerToolConfiguration:
      additionalProperties: false
      properties:
        allowed_tools:
          anyOf:
            - items:
                type: string
              type: array
            - type: 'null'
          title: Allowed Tools
        enabled:
          anyOf:
            - type: boolean
            - type: 'null'
          title: Enabled
      title: RequestMCPServerToolConfiguration
      type: object
    RequestMCPServerURLDefinition:
      additionalProperties: false
      properties:
        authorization_token:
          anyOf:
            - type: string
            - type: 'null'
          title: Authorization Token
        name:
          title: Name
          type: string
        tool_configuration:
          anyOf:
            - $ref: '#/components/schemas/RequestMCPServerToolConfiguration'
            - type: 'null'
        type:
          const: url
          enum:
            - url
          title: Type
          type: string
        url:
          title: Url
          type: string
      required:
        - name
        - type
        - url
      title: RequestMCPServerURLDefinition
      type: object
    RequestMCPToolResultBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        content:
          anyOf:
            - type: string
            - items:
                $ref: '#/components/schemas/RequestTextBlock'
              type: array
          title: Content
        is_error:
          title: Is Error
          type: boolean
        tool_use_id:
          pattern: ^[a-zA-Z0-9_-]+$
          title: Tool Use Id
          type: string
        type:
          const: mcp_tool_result
          enum:
            - mcp_tool_result
          title: Type
          type: string
      required:
        - tool_use_id
        - type
      title: MCP tool result
      type: object
    RequestMCPToolUseBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        id:
          pattern: ^[a-zA-Z0-9_-]+$
          title: Id
          type: string
        input:
          title: Input
          type: object
        name:
          title: Name
          type: string
        server_name:
          description: The name of the MCP server
          title: Server Name
          type: string
        type:
          const: mcp_tool_use
          enum:
            - mcp_tool_use
          title: Type
          type: string
      required:
        - id
        - input
        - name
        - server_name
        - type
      title: MCP tool use
      type: object
    RequestPageLocationCitation:
      additionalProperties: false
      properties:
        cited_text:
          title: Cited Text
          type: string
        document_index:
          minimum: 0
          title: Document Index
          type: integer
        document_title:
          anyOf:
            - maxLength: 255
              minLength: 1
              type: string
            - type: 'null'
          title: Document Title
        end_page_number:
          title: End Page Number
          type: integer
        start_page_number:
          minimum: 1
          title: Start Page Number
          type: integer
        type:
          const: page_location
          enum:
            - page_location
          title: Type
          type: string
      required:
        - cited_text
        - document_index
        - document_title
        - end_page_number
        - start_page_number
        - type
      title: Page location
      type: object
    RequestRedactedThinkingBlock:
      additionalProperties: false
      properties:
        data:
          title: Data
          type: string
        type:
          const: redacted_thinking
          enum:
            - redacted_thinking
          title: Type
          type: string
      required:
        - data
        - type
      title: Redacted thinking
      type: object
    RequestSearchResultBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        citations:
          $ref: '#/components/schemas/RequestCitationsConfig'
        content:
          items:
            $ref: '#/components/schemas/RequestTextBlock'
          title: Content
          type: array
        source:
          title: Source
          type: string
        title:
          title: Title
          type: string
        type:
          const: search_result
          enum:
            - search_result
          title: Type
          type: string
      required:
        - content
        - source
        - title
        - type
      title: Search result
      type: object
    RequestSearchResultLocationCitation:
      additionalProperties: false
      properties:
        cited_text:
          title: Cited Text
          type: string
        end_block_index:
          title: End Block Index
          type: integer
        search_result_index:
          minimum: 0
          title: Search Result Index
          type: integer
        source:
          title: Source
          type: string
        start_block_index:
          minimum: 0
          title: Start Block Index
          type: integer
        title:
          anyOf:
            - type: string
            - type: 'null'
          title: Title
        type:
          const: search_result_location
          enum:
            - search_result_location
          title: Type
          type: string
      required:
        - cited_text
        - end_block_index
        - search_result_index
        - source
        - start_block_index
        - title
        - type
      title: RequestSearchResultLocationCitation
      type: object
    RequestServerToolUseBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        id:
          pattern: ^srvtoolu_[a-zA-Z0-9_]+$
          title: Id
          type: string
        input:
          title: Input
          type: object
        name:
          enum:
            - web_search
            - web_fetch
            - code_execution
            - bash_code_execution
            - text_editor_code_execution
          title: Name
          type: string
        type:
          const: server_tool_use
          enum:
            - server_tool_use
          title: Type
          type: string
      required:
        - id
        - input
        - name
        - type
      title: Server tool use
      type: object
    RequestTextBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        citations:
          anyOf:
            - items:
                discriminator:
                  mapping:
                    char_location: '#/components/schemas/RequestCharLocationCitation'
                    content_block_location: '#/components/schemas/RequestContentBlockLocationCitation'
                    page_location: '#/components/schemas/RequestPageLocationCitation'
                    search_result_location: '#/components/schemas/RequestSearchResultLocationCitation'
                    web_search_result_location: >-
                      #/components/schemas/RequestWebSearchResultLocationCitation
                  propertyName: type
                oneOf:
                  - $ref: '#/components/schemas/RequestCharLocationCitation'
                  - $ref: '#/components/schemas/RequestPageLocationCitation'
                  - $ref: '#/components/schemas/RequestContentBlockLocationCitation'
                  - $ref: >-
                      #/components/schemas/RequestWebSearchResultLocationCitation
                  - $ref: '#/components/schemas/RequestSearchResultLocationCitation'
              type: array
            - type: 'null'
          title: Citations
        text:
          minLength: 1
          title: Text
          type: string
        type:
          const: text
          enum:
            - text
          title: Type
          type: string
      required:
        - text
        - type
      title: Text
      type: object
    RequestTextEditorCodeExecutionCreateResultBlock:
      additionalProperties: false
      properties:
        is_file_update:
          title: Is File Update
          type: boolean
        type:
          const: text_editor_code_execution_create_result
          enum:
            - text_editor_code_execution_create_result
          title: Type
          type: string
      required:
        - is_file_update
        - type
      title: RequestTextEditorCodeExecutionCreateResultBlock
      type: object
    RequestTextEditorCodeExecutionStrReplaceResultBlock:
      additionalProperties: false
      properties:
        lines:
          anyOf:
            - items:
                type: string
              type: array
            - type: 'null'
          title: Lines
        new_lines:
          anyOf:
            - type: integer
            - type: 'null'
          title: New Lines
        new_start:
          anyOf:
            - type: integer
            - type: 'null'
          title: New Start
        old_lines:
          anyOf:
            - type: integer
            - type: 'null'
          title: Old Lines
        old_start:
          anyOf:
            - type: integer
            - type: 'null'
          title: Old Start
        type:
          const: text_editor_code_execution_str_replace_result
          enum:
            - text_editor_code_execution_str_replace_result
          title: Type
          type: string
      required:
        - type
      title: RequestTextEditorCodeExecutionStrReplaceResultBlock
      type: object
    RequestTextEditorCodeExecutionToolResultBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        content:
          anyOf:
            - $ref: >-
                #/components/schemas/RequestTextEditorCodeExecutionToolResultError
            - $ref: >-
                #/components/schemas/RequestTextEditorCodeExecutionViewResultBlock
            - $ref: >-
                #/components/schemas/RequestTextEditorCodeExecutionCreateResultBlock
            - $ref: >-
                #/components/schemas/RequestTextEditorCodeExecutionStrReplaceResultBlock
          title: Content
        tool_use_id:
          pattern: ^srvtoolu_[a-zA-Z0-9_]+$
          title: Tool Use Id
          type: string
        type:
          const: text_editor_code_execution_tool_result
          enum:
            - text_editor_code_execution_tool_result
          title: Type
          type: string
      required:
        - content
        - tool_use_id
        - type
      title: RequestTextEditorCodeExecutionToolResultBlock
      type: object
    RequestTextEditorCodeExecutionToolResultError:
      additionalProperties: false
      properties:
        error_code:
          $ref: '#/components/schemas/TextEditorCodeExecutionToolResultErrorCode'
        error_message:
          anyOf:
            - type: string
            - type: 'null'
          title: Error Message
        type:
          const: text_editor_code_execution_tool_result_error
          enum:
            - text_editor_code_execution_tool_result_error
          title: Type
          type: string
      required:
        - error_code
        - type
      title: RequestTextEditorCodeExecutionToolResultError
      type: object
    RequestTextEditorCodeExecutionViewResultBlock:
      additionalProperties: false
      properties:
        content:
          title: Content
          type: string
        file_type:
          enum:
            - text
            - image
            - pdf
          title: File Type
          type: string
        num_lines:
          anyOf:
            - type: integer
            - type: 'null'
          title: Num Lines
        start_line:
          anyOf:
            - type: integer
            - type: 'null'
          title: Start Line
        total_lines:
          anyOf:
            - type: integer
            - type: 'null'
          title: Total Lines
        type:
          const: text_editor_code_execution_view_result
          enum:
            - text_editor_code_execution_view_result
          title: Type
          type: string
      required:
        - content
        - file_type
        - type
      title: RequestTextEditorCodeExecutionViewResultBlock
      type: object
    RequestThinkingBlock:
      additionalProperties: false
      properties:
        signature:
          title: Signature
          type: string
        thinking:
          title: Thinking
          type: string
        type:
          const: thinking
          enum:
            - thinking
          title: Type
          type: string
      required:
        - signature
        - thinking
        - type
      title: Thinking
      type: object
    RequestToolResultBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        content:
          anyOf:
            - type: string
            - items:
                discriminator:
                  mapping:
                    document: '#/components/schemas/RequestDocumentBlock'
                    image: '#/components/schemas/RequestImageBlock'
                    search_result: '#/components/schemas/RequestSearchResultBlock'
                    text: '#/components/schemas/RequestTextBlock'
                  propertyName: type
                oneOf:
                  - $ref: '#/components/schemas/RequestTextBlock'
                  - $ref: '#/components/schemas/RequestImageBlock'
                  - $ref: '#/components/schemas/RequestSearchResultBlock'
                  - $ref: '#/components/schemas/RequestDocumentBlock'
              type: array
          title: Content
        is_error:
          title: Is Error
          type: boolean
        tool_use_id:
          pattern: ^[a-zA-Z0-9_-]+$
          title: Tool Use Id
          type: string
        type:
          const: tool_result
          enum:
            - tool_result
          title: Type
          type: string
      required:
        - tool_use_id
        - type
      title: Tool result
      type: object
    RequestToolUseBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        id:
          pattern: ^[a-zA-Z0-9_-]+$
          title: Id
          type: string
        input:
          title: Input
          type: object
        name:
          maxLength: 200
          minLength: 1
          title: Name
          type: string
        type:
          const: tool_use
          enum:
            - tool_use
          title: Type
          type: string
      required:
        - id
        - input
        - name
        - type
      title: Tool use
      type: object
    RequestWebFetchResultBlock:
      additionalProperties: false
      properties:
        content:
          $ref: '#/components/schemas/RequestDocumentBlock'
        retrieved_at:
          anyOf:
            - type: string
            - type: 'null'
          description: ISO 8601 timestamp when the content was retrieved
          title: Retrieved At
        type:
          const: web_fetch_result
          enum:
            - web_fetch_result
          title: Type
          type: string
        url:
          description: Fetched content URL
          title: Url
          type: string
      required:
        - content
        - type
        - url
      title: RequestWebFetchResultBlock
      type: object
    RequestWebFetchToolResultBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        content:
          anyOf:
            - $ref: '#/components/schemas/RequestWebFetchToolResultError'
            - $ref: '#/components/schemas/RequestWebFetchResultBlock'
          title: Content
        tool_use_id:
          pattern: ^srvtoolu_[a-zA-Z0-9_]+$
          title: Tool Use Id
          type: string
        type:
          const: web_fetch_tool_result
          enum:
            - web_fetch_tool_result
          title: Type
          type: string
      required:
        - content
        - tool_use_id
        - type
      title: RequestWebFetchToolResultBlock
      type: object
    RequestWebFetchToolResultError:
      additionalProperties: false
      properties:
        error_code:
          $ref: '#/components/schemas/WebFetchToolResultErrorCode'
        type:
          const: web_fetch_tool_result_error
          enum:
            - web_fetch_tool_result_error
          title: Type
          type: string
      required:
        - error_code
        - type
      title: RequestWebFetchToolResultError
      type: object
    RequestWebSearchResultBlock:
      additionalProperties: false
      properties:
        encrypted_content:
          title: Encrypted Content
          type: string
        page_age:
          anyOf:
            - type: string
            - type: 'null'
          title: Page Age
        title:
          title: Title
          type: string
        type:
          const: web_search_result
          enum:
            - web_search_result
          title: Type
          type: string
        url:
          title: Url
          type: string
      required:
        - encrypted_content
        - title
        - type
        - url
      title: RequestWebSearchResultBlock
      type: object
    RequestWebSearchResultLocationCitation:
      additionalProperties: false
      properties:
        cited_text:
          title: Cited Text
          type: string
        encrypted_index:
          title: Encrypted Index
          type: string
        title:
          anyOf:
            - maxLength: 512
              minLength: 1
              type: string
            - type: 'null'
          title: Title
        type:
          const: web_search_result_location
          enum:
            - web_search_result_location
          title: Type
          type: string
        url:
          maxLength: 2048
          minLength: 1
          title: Url
          type: string
      required:
        - cited_text
        - encrypted_index
        - title
        - type
        - url
      title: RequestWebSearchResultLocationCitation
      type: object
    RequestWebSearchToolResultBlock:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        content:
          anyOf:
            - items:
                $ref: '#/components/schemas/RequestWebSearchResultBlock'
              type: array
            - $ref: '#/components/schemas/RequestWebSearchToolResultError'
          title: Content
        tool_use_id:
          pattern: ^srvtoolu_[a-zA-Z0-9_]+$
          title: Tool Use Id
          type: string
        type:
          const: web_search_tool_result
          enum:
            - web_search_tool_result
          title: Type
          type: string
      required:
        - content
        - tool_use_id
        - type
      title: Web search tool result
      type: object
    RequestWebSearchToolResultError:
      additionalProperties: false
      properties:
        error_code:
          $ref: '#/components/schemas/WebSearchToolResultErrorCode'
        type:
          const: web_search_tool_result_error
          enum:
            - web_search_tool_result_error
          title: Type
          type: string
      required:
        - error_code
        - type
      title: RequestWebSearchToolResultError
      type: object
    TextEditorCodeExecutionToolResultErrorCode:
      enum:
        - invalid_tool_input
        - unavailable
        - too_many_requests
        - execution_time_exceeded
        - file_not_found
      title: TextEditorCodeExecutionToolResultErrorCode
      type: string
    TextEditor_20241022:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        name:
          const: str_replace_editor
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          enum:
            - str_replace_editor
          title: Name
          type: string
        type:
          const: text_editor_20241022
          enum:
            - text_editor_20241022
          title: Type
          type: string
      required:
        - name
        - type
      title: Text editor tool (2024-10-22)
      type: object
    TextEditor_20250124:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        name:
          const: str_replace_editor
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          enum:
            - str_replace_editor
          title: Name
          type: string
        type:
          const: text_editor_20250124
          enum:
            - text_editor_20250124
          title: Type
          type: string
      required:
        - name
        - type
      title: Text editor tool (2025-01-24)
      type: object
    TextEditor_20250429:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        name:
          const: str_replace_based_edit_tool
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          enum:
            - str_replace_based_edit_tool
          title: Name
          type: string
        type:
          const: text_editor_20250429
          enum:
            - text_editor_20250429
          title: Type
          type: string
      required:
        - name
        - type
      title: Text editor tool (2025-04-29)
      type: object
    TextEditor_20250728:
      additionalProperties: false
      properties:
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        max_characters:
          anyOf:
            - minimum: 1
              type: integer
            - type: 'null'
          description: >-
            Maximum number of characters to display when viewing a file. If not
            specified, defaults to displaying the full file.
          title: Max Characters
        name:
          const: str_replace_based_edit_tool
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          enum:
            - str_replace_based_edit_tool
          title: Name
          type: string
        type:
          const: text_editor_20250728
          enum:
            - text_editor_20250728
          title: Type
          type: string
      required:
        - name
        - type
      title: TextEditor_20250728
      type: object
    ThinkingConfigDisabled:
      additionalProperties: false
      properties:
        type:
          const: disabled
          enum:
            - disabled
          title: Type
          type: string
      required:
        - type
      title: Disabled
      type: object
    ThinkingConfigEnabled:
      additionalProperties: false
      properties:
        budget_tokens:
          description: >-
            Determines how many tokens Claude can use for its internal reasoning
            process. Larger budgets can enable more thorough analysis for
            complex problems, improving response quality. 


            Must be ≥1024 and less than `max_tokens`.


            See [extended
            thinking](https://docs.claude.com/en/docs/build-with-claude/extended-thinking)
            for details.
          minimum: 1024
          title: Budget Tokens
          type: integer
        type:
          const: enabled
          enum:
            - enabled
          title: Type
          type: string
      required:
        - budget_tokens
        - type
      title: Enabled
      type: object
    Tool:
      additionalProperties: false
      properties:
        type:
          anyOf:
            - type: 'null'
            - const: custom
              enum:
                - custom
              type: string
          title: Type
        description:
          description: >-
            Description of what this tool does.


            Tool descriptions should be as detailed as possible. The more
            information that the model has about what the tool is and how to use
            it, the better it will perform. You can use natural language
            descriptions to reinforce important aspects of the tool input JSON
            schema.
          examples:
            - Get the current weather in a given location
          title: Description
          type: string
        name:
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          maxLength: 128
          minLength: 1
          pattern: ^[a-zA-Z0-9_-]{1,128}$
          title: Name
          type: string
        input_schema:
          $ref: '#/components/schemas/InputSchema'
          description: >-
            [JSON schema](https://json-schema.org/draft/2020-12) for this tool's
            input.


            This defines the shape of the `input` that your tool accepts and
            that the model will produce.
          examples:
            - properties:
                location:
                  description: The city and state, e.g. San Francisco, CA
                  type: string
                unit:
                  description: Unit for the output - one of (celsius, fahrenheit)
                  type: string
              required:
                - location
              type: object
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
      required:
        - name
        - input_schema
      title: Custom tool
      type: object
    ToolChoiceAny:
      additionalProperties: false
      description: The model will use any available tools.
      properties:
        disable_parallel_tool_use:
          description: >-
            Whether to disable parallel tool use.


            Defaults to `false`. If set to `true`, the model will output exactly
            one tool use.
          title: Disable Parallel Tool Use
          type: boolean
        type:
          const: any
          enum:
            - any
          title: Type
          type: string
      required:
        - type
      title: Any
      type: object
    ToolChoiceAuto:
      additionalProperties: false
      description: The model will automatically decide whether to use tools.
      properties:
        disable_parallel_tool_use:
          description: >-
            Whether to disable parallel tool use.


            Defaults to `false`. If set to `true`, the model will output at most
            one tool use.
          title: Disable Parallel Tool Use
          type: boolean
        type:
          const: auto
          enum:
            - auto
          title: Type
          type: string
      required:
        - type
      title: Auto
      type: object
    ToolChoiceNone:
      additionalProperties: false
      description: The model will not be allowed to use tools.
      properties:
        type:
          const: none
          enum:
            - none
          title: Type
          type: string
      required:
        - type
      title: None
      type: object
    ToolChoiceTool:
      additionalProperties: false
      description: The model will use the specified tool with `tool_choice.name`.
      properties:
        disable_parallel_tool_use:
          description: >-
            Whether to disable parallel tool use.


            Defaults to `false`. If set to `true`, the model will output exactly
            one tool use.
          title: Disable Parallel Tool Use
          type: boolean
        name:
          description: The name of the tool to use.
          title: Name
          type: string
        type:
          const: tool
          enum:
            - tool
          title: Type
          type: string
      required:
        - name
        - type
      title: Tool
      type: object
    URLImageSource:
      additionalProperties: false
      properties:
        type:
          const: url
          enum:
            - url
          title: Type
          type: string
        url:
          title: Url
          type: string
      required:
        - type
        - url
      title: URLImageSource
      type: object
    URLPDFSource:
      additionalProperties: false
      properties:
        type:
          const: url
          enum:
            - url
          title: Type
          type: string
        url:
          title: Url
          type: string
      required:
        - type
        - url
      title: PDF (URL)
      type: object
    UserLocation:
      additionalProperties: false
      properties:
        city:
          anyOf:
            - maxLength: 255
              minLength: 1
              type: string
            - type: 'null'
          description: The city of the user.
          examples:
            - New York
            - Tokyo
            - Los Angeles
          title: City
        country:
          anyOf:
            - maxLength: 2
              minLength: 2
              type: string
            - type: 'null'
          description: >-
            The two letter [ISO country
            code](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) of the user.
          examples:
            - US
            - JP
            - GB
          title: Country
        region:
          anyOf:
            - maxLength: 255
              minLength: 1
              type: string
            - type: 'null'
          description: The region of the user.
          examples:
            - California
            - Ontario
            - Wales
          title: Region
        timezone:
          anyOf:
            - maxLength: 255
              minLength: 1
              type: string
            - type: 'null'
          description: The [IANA timezone](https://nodatime.org/TimeZones) of the user.
          examples:
            - America/New_York
            - Asia/Tokyo
            - Europe/London
          title: Timezone
        type:
          const: approximate
          enum:
            - approximate
          title: Type
          type: string
      required:
        - type
      title: UserLocation
      type: object
    WebFetchToolResultErrorCode:
      enum:
        - invalid_tool_input
        - url_too_long
        - url_not_allowed
        - url_not_accessible
        - unsupported_content_type
        - too_many_requests
        - max_uses_exceeded
        - unavailable
      title: WebFetchToolResultErrorCode
      type: string
    WebFetchTool_20250910:
      additionalProperties: false
      properties:
        allowed_domains:
          anyOf:
            - items:
                type: string
              type: array
            - type: 'null'
          description: List of domains to allow fetching from
          title: Allowed Domains
        blocked_domains:
          anyOf:
            - items:
                type: string
              type: array
            - type: 'null'
          description: List of domains to block fetching from
          title: Blocked Domains
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        citations:
          anyOf:
            - $ref: '#/components/schemas/RequestCitationsConfig'
            - type: 'null'
          description: >-
            Citations configuration for fetched documents. Citations are
            disabled by default.
        max_content_tokens:
          anyOf:
            - exclusiveMinimum: 0
              type: integer
            - type: 'null'
          description: >-
            Maximum number of tokens used by including web page text content in
            the context. The limit is approximate and does not apply to binary
            content such as PDFs.
          title: Max Content Tokens
        max_uses:
          anyOf:
            - exclusiveMinimum: 0
              type: integer
            - type: 'null'
          description: Maximum number of times the tool can be used in the API request.
          title: Max Uses
        name:
          const: web_fetch
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          enum:
            - web_fetch
          title: Name
          type: string
        type:
          const: web_fetch_20250910
          enum:
            - web_fetch_20250910
          title: Type
          type: string
      required:
        - name
        - type
      title: WebFetchTool_20250910
      type: object
    WebSearchToolResultErrorCode:
      enum:
        - invalid_tool_input
        - unavailable
        - max_uses_exceeded
        - too_many_requests
        - query_too_long
      title: WebSearchToolResultErrorCode
      type: string
    WebSearchTool_20250305:
      additionalProperties: false
      properties:
        allowed_domains:
          anyOf:
            - items:
                type: string
              type: array
            - type: 'null'
          description: >-
            If provided, only these domains will be included in results. Cannot
            be used alongside `blocked_domains`.
          title: Allowed Domains
        blocked_domains:
          anyOf:
            - items:
                type: string
              type: array
            - type: 'null'
          description: >-
            If provided, these domains will never appear in results. Cannot be
            used alongside `allowed_domains`.
          title: Blocked Domains
        cache_control:
          anyOf:
            - discriminator:
                mapping:
                  ephemeral: '#/components/schemas/CacheControlEphemeral'
                propertyName: type
              oneOf:
                - $ref: '#/components/schemas/CacheControlEphemeral'
            - type: 'null'
          description: Create a cache control breakpoint at this content block.
          title: Cache Control
        max_uses:
          anyOf:
            - exclusiveMinimum: 0
              type: integer
            - type: 'null'
          description: Maximum number of times the tool can be used in the API request.
          title: Max Uses
        name:
          const: web_search
          description: >-
            Name of the tool.


            This is how the tool will be called by the model and in `tool_use`
            blocks.
          enum:
            - web_search
          title: Name
          type: string
        type:
          const: web_search_20250305
          enum:
            - web_search_20250305
          title: Type
          type: string
        user_location:
          anyOf:
            - $ref: '#/components/schemas/UserLocation'
            - type: 'null'
          description: >-
            Parameters for the user's location. Used to provide more relevant
            search results.
      required:
        - name
        - type
      title: Web search tool (2025-03-05)
      type: object

````