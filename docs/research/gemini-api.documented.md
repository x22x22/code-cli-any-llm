# Google Gemini API 文档

## Docs
- [获取 API 密钥](https://gemini-api.apifox.cn/doc-3462186.md): 
- [API 版本说明](https://gemini-api.apifox.cn/doc-3462196.md): 
- [下载内容](https://gemini-api.apifox.cn/doc-3462286.md): 
- [在Google Cloud上运行Gemini](https://gemini-api.apifox.cn/doc-3462291.md): 
- 模型功能 [概览](https://gemini-api.apifox.cn/doc-3462109.md): 
- 模型功能 [长上下文](https://gemini-api.apifox.cn/doc-6516111.md): 
- 模型功能 [数据化输出](https://gemini-api.apifox.cn/doc-6516133.md): 
- 模型功能 [文档理解](https://gemini-api.apifox.cn/doc-6516295.md): 
- 模型功能 [图片理解](https://gemini-api.apifox.cn/doc-6516313.md): 
- 模型功能 [视频理解](https://gemini-api.apifox.cn/doc-6516321.md): 
- 模型功能 [音频理解](https://gemini-api.apifox.cn/doc-6516334.md): 
- 模型 [所有模型](https://gemini-api.apifox.cn/doc-6515339.md): 
- 模型 [价格](https://gemini-api.apifox.cn/doc-3462199.md): 
- 模型 [速率限制](https://gemini-api.apifox.cn/doc-3462234.md): 
- 模型 [账单信息](https://gemini-api.apifox.cn/doc-3462238.md): 
- 安全 [安全设置](https://gemini-api.apifox.cn/doc-3462245.md): 
- 安全 [安全指导](https://gemini-api.apifox.cn/doc-3462273.md): 

## API Docs
- 模型功能 > 文本生成 [文字输入](https://gemini-api.apifox.cn/api-288013537.md): 使用 Gemini API 生成文本的最简单方法是向模型提供单个纯文本输入，如以下示例所示：
- 模型功能 > 文本生成 [图片输入](https://gemini-api.apifox.cn/api-288016695.md): Gemini API 支持将文本和媒体文件组合在一起的多模态输入。以下示例展示了如何根据文本和图片输入生成文本：
- 模型功能 > 文本生成 [流式输出](https://gemini-api.apifox.cn/api-288019119.md): 默认情况下，模型会在完成整个文本生成流程后返回回答。您可以使用流式传输在 [`GenerateContentResponse`](https://ai.google.dev/api/generate-content?hl=zh-cn#v1beta.GenerateContentResponse) 实例生成时返回这些实例，从而实现更快的互动。
- 模型功能 > 文本生成 [多轮对话](https://gemini-api.apifox.cn/api-288028988.md): 借助 Gemini SDK，您可以将多轮问题和回答收集到一个对话中。借助聊天格式，用户可以逐步获得答案，并在遇到多部分问题时获得帮助。此 SDK 聊天实现提供了一个界面来跟踪对话历史记录，但在后台，它使用相同的 [`generateContent`](https://ai.google.dev/api/generate-content?hl=zh-cn#method:-models.generatecontent) 方法来创建响应。
- 模型功能 > 文本生成 [多轮对话（流式）](https://gemini-api.apifox.cn/api-288032325.md): 将流式传输与聊天功能搭配使用
- 模型功能 > 文本生成 [配置参数](https://gemini-api.apifox.cn/api-288035232.md): 
- 模型功能 > 图片生成 [使用 Gemini 生成图片](https://gemini-api.apifox.cn/api-288037713.md): Gemini 2.0 Flash Experimental 支持输出文本和内嵌图片。这样，您就可以使用 Gemini 以对话方式编辑图片，或生成包含交织文本的输出内容（例如，在一次对话中生成包含文本和图片的博文）。所有生成的图片都包含 [SynthID 水印](https://ai.google.dev/responsible/docs/safeguards/synthid?hl=zh-cn)，Google AI 工作室中的图片也包含可见水印。
- 模型功能 > 图片生成 [使用 Gemini 编辑图片](https://gemini-api.apifox.cn/api-288039369.md): 如需执行图片编辑，请添加图片作为输入。以下示例演示了如何上传 base64 编码的图片。对于多张图片和较大的载荷，请参阅[图片输入](https://ai.google.dev/gemini-api/docs/vision?hl=zh-cn#image-input)部分。
- 模型功能 > 图片生成 [使用 Imagen 3 生成图片](https://gemini-api.apifox.cn/api-288041439.md): Gemini API 提供对 [Imagen 3](https://deepmind.google/technologies/imagen-3/?hl=zh-cn) 的访问权限，该模型是 Google 质量最高的文本转图像模型，具有许多新功能和改进功能。Imagen 3 可以执行以下操作：
- 模型功能 > Gemini 思考 [使用思维模型](https://gemini-api.apifox.cn/api-288052516.md): 具有思考能力的模型可在 [Google AI Studio](https://aistudio.google.com/prompts/new_chat?model=gemini-2.5-flash-preview-04-17&hl=zh-cn) 中使用，也可通过 Gemini API 使用。默认情况下，API 和 AI Studio 中的思考功能处于开启状态，因为 2.5 系列模型能够根据问题自动决定何时思考以及思考多少。对于大多数用例，让系统保持思考状态是有益的。不过，如果您想关闭思考功能，可以将 `thinkingBudget` 参数设置为 0。
- 模型功能 > Gemini 思考 [为思考模型设置预算](https://gemini-api.apifox.cn/api-288054494.md): `thinkingBudget` 参数可为模型提供有关其在生成回答时可以使用的思考令牌数量的指导。令牌数量越多，通常与更详细的思考相关，而这对于解决更复杂的任务至关重要。`thinkingBudget` 必须是介于 0 到 24576 之间的整数。将思考预算设置为 0 会停用思考。
- 模型功能 > 函数调用 [使用 Gemini API 进行函数调用](https://gemini-api.apifox.cn/api-288061764.md): 借助函数调用，您可以将模型连接到外部工具和 API。 该模型不会生成文本回答，而是会了解何时调用特定函数，并提供执行实际操作所需的参数。这样，模型就可以充当自然语言与现实世界操作和数据之间的桥梁。函数调用有 3 种主要用例：