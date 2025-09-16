#!/bin/bash

# 测试流式响应中的 reasoning_content 转换
echo "Testing streaming reasoning_content conversion..."

# 发送流式请求
curl -N -X POST http://localhost:3002/v1beta/models/glm-4-flash:streamGenerateContent \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: test-key" \
  -H "x-goog-user-project: test-project" \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{ "text": "Solve step by step: What is the square root of 144?" }]
    }],
    "generationConfig": {
      "maxOutputTokens": 500
    }
  }' | grep -E "(thought|text|data)" | head -20

echo -e "\n\n=== 测试完成 ==="
echo "检查响应中是否正确包含了 thought 字段"