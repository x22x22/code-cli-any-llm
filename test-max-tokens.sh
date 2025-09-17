#!/bin/bash

# 简单的测试脚本，验证max_tokens是否生效
echo "测试maxTokens=10的限制..."

curl -X POST "http://localhost:23062/api/v1/models/gemini-2.5-pro:generateContent" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "请详细介绍一下人工智能的历史发展，从1950年图灵测试开始到现在的深度学习时代。"}]
      }
    ],
    "generationConfig": {
      "maxOutputTokens": 10
    }
  }' | jq '.'