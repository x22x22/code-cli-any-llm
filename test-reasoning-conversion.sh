#!/bin/bash

# 测试 reasoning_content 转换为 thought 字段
echo "Testing reasoning_content to thought field conversion..."

# 使用 GLM 模型（它会返回 reasoning_content）
curl -X POST http://localhost:3002/v1beta/models/glm-4-flash:generateContent \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: test-key" \
  -H "x-goog-user-project: test-project" \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{ "text": "What is 2+2? Think step by step." }]
    }],
    "generationConfig": {
      "maxOutputTokens": 500
    }
  }'

echo -e "\n\n=== 测试完成 ==="
echo "检查响应中是否包含 thought 字段而不是 text 字段中的 reasoning_content"