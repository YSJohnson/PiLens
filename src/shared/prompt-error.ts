export function friendlyPromptError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLocaleLowerCase()

  if (/unauthorized|forbidden|api.?key|authentication|\b401\b|\b403\b/.test(normalized)) {
    return '模型服务授权已失效，请在 Provider 设置中重新连接。'
  }
  if (/rate.?limit|quota|billing|credit|\b429\b/.test(normalized)) {
    return '当前模型服务额度不足或请求过于频繁，请稍后重试或切换模型。'
  }
  if (/image|vision|multimodal/.test(normalized) && /unsupported|not support|does not support/.test(normalized)) {
    return '当前模型不支持图片输入，请切换支持图片的模型。'
  }
  if (/network|fetch|econn|enotfound|dns|timed?\s*out|connection/.test(normalized)) {
    return '无法连接模型服务，请检查网络后重试。'
  }
  return message
}
