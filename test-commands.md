# API测试命令

## 前提条件
确保服务已启动：
```bash
pnpm run start:dev
```

## 1. 健康检查
```bash
curl http://localhost:23062/api/v1/health
```

## 2. 普通对话
```bash
curl -X POST http://localhost:23062/api/v1/models/gemini-2.5-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "你好，请简单介绍一下你自己"}]
      }
    ]
  }'
```

## 3. 流式对话
```bash
curl -X POST http://localhost:23062/api/v1/models/gemini-2.5-pro:streamGenerateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "请讲个短故事"}]
      }
    ]
  }'
```

## 4. 带系统指令
```bash
curl -X POST http://localhost:23062/api/v1/models/gemini-2.5-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "systemInstruction": "你是一个专业的翻译，请只输出翻译结果，不要解释。",
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "Hello, how are you today?"}]
      }
    ]
  }'
```

## 5. 多轮对话（带上下文）
```bash
# 第一轮
curl -X POST http://localhost:23062/api/v1/models/gemini-2.5-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "我的名字是李华"}]
      }
    ]
  }'

# 第二轮（记住名字）
curl -X POST http://localhost:23062/api/v1/models/gemini-2.5-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "我叫什么名字？"}]
      },
      {
        "role": "model",
        "parts": [{"text": "你好李华！很高兴认识你。你的名字是李华。"}]
      }
    ]
  }'
```

## 6. 代码生成
```bash
curl -X POST http://localhost:23062/api/v1/models/gemini-2.5-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "用Python写一个计算斐波那契数列的函数"}]
      }
    ]
  }'
```

## 7. 使用不同的模型
将 `glm-4.5` 替换为你的模型名称，例如：
```bash
curl -X POST http://localhost:23062/api/v1/models/gemini-2.5-flash:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "What is the capital of France?"}]
      }
    ]
  }'
```

## 8. 错误测试（无效模型）
```bash
curl -X POST http://localhost:23062/api/v1/v1/models/invalid-model:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "Hello"}]
      }
    ]
  }'
```

## 9. 错误测试（缺少必需字段）
```bash
curl -X POST http://localhost:23062/api/v1/models/gemini-2.5-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "invalid": "data"
  }'
```

## 美化输出（安装了jq的话）
在命令后添加 `| jq .` 来格式化JSON输出：
```bash
curl -s http://localhost:23062/api/v1/health | jq .
```