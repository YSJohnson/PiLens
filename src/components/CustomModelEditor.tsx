import { ArrowLeft, Check, Cpu, Edit3, Globe2, Image, KeyRound, LoaderCircle, Plus, Server, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CustomModelApi, CustomModelConfig } from '../shared/contracts'
import { useAppStore } from '../store/use-app-store'
import { ProviderLogo } from './ProviderLogo'

const EMPTY_MODEL: CustomModelConfig = {
  providerId: '',
  providerName: '',
  baseUrl: 'http://localhost:11434/v1',
  api: 'openai-completions',
  modelId: '',
  modelName: '',
  contextWindow: 128_000,
  maxTokens: 16_384,
  reasoning: false,
  imageInput: false,
  localNoAuth: true,
  compatibilityMode: true,
}

const API_OPTIONS: Array<{ value: CustomModelApi; label: string }> = [
  { value: 'openai-completions', label: 'OpenAI Chat Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'google-generative-ai', label: 'Google Generative AI' },
]

export function CustomModelEditor({ onBack, onProviderSaved }: { onBack: () => void; onProviderSaved: (providerId: string) => void }) {
  const customModels = useAppStore((state) => state.customModels)
  const busy = useAppStore((state) => state.busy)
  const getCustomModels = useAppStore((state) => state.getCustomModels)
  const saveCustomModel = useAppStore((state) => state.saveCustomModel)
  const deleteCustomModel = useAppStore((state) => state.deleteCustomModel)
  const [draft, setDraft] = useState<CustomModelConfig>(EMPTY_MODEL)
  const [editingKey, setEditingKey] = useState<string>()
  const [deleteArmed, setDeleteArmed] = useState<string>()

  useEffect(() => {
    void getCustomModels()
  }, [getCustomModels])

  const update = <K extends keyof CustomModelConfig>(key: K, value: CustomModelConfig[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const edit = (model: CustomModelConfig) => {
    setDraft(model)
    setEditingKey(`${model.providerId}/${model.modelId}`)
    setDeleteArmed(undefined)
  }

  const reset = () => {
    setDraft(EMPTY_MODEL)
    setEditingKey(undefined)
  }

  const save = async () => {
    const success = await saveCustomModel(draft)
    if (!success) return
    onProviderSaved(draft.providerId.trim().toLowerCase())
    setEditingKey(`${draft.providerId.trim().toLowerCase()}/${draft.modelId.trim()}`)
  }

  return (
    <div className="custom-model-editor">
      <header className="custom-model-heading">
        <button className="icon-button" type="button" aria-label="返回 Provider" onClick={onBack}><ArrowLeft size={17} /></button>
        <div><h2>自定义模型</h2><p>连接 Ollama、LM Studio、vLLM、代理或兼容 API。</p></div>
        <button className="secondary-button" type="button" onClick={reset}><Plus size={14} />新建</button>
      </header>

      <section className="settings-section custom-model-form">
        <div className="section-title"><div><h3>{editingKey ? '编辑模型' : '添加模型'}</h3><p>保存到 Pi 的 models.json，其他 Pi 客户端也可使用。</p></div><Server size={18} /></div>
        <div className="custom-form-grid">
          <label><span>Provider ID</span><input value={draft.providerId} disabled={Boolean(editingKey)} placeholder="例如 ollama" onChange={(event) => update('providerId', event.target.value)} /></label>
          <label><span>Provider 名称</span><input value={draft.providerName} placeholder="例如 Ollama Local" onChange={(event) => update('providerName', event.target.value)} /></label>
          <label className="wide"><span>Base URL</span><div className="custom-input-icon"><Globe2 size={15} /><input value={draft.baseUrl} placeholder="http://localhost:11434/v1" onChange={(event) => update('baseUrl', event.target.value)} /></div></label>
          <label className="wide"><span>API 协议</span><select value={draft.api} onChange={(event) => update('api', event.target.value as CustomModelApi)}>{API_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span>模型 ID</span><input value={draft.modelId} disabled={Boolean(editingKey)} placeholder="例如 qwen3-coder" onChange={(event) => update('modelId', event.target.value)} /></label>
          <label><span>显示名称</span><input value={draft.modelName} placeholder="例如 Qwen 3 Coder" onChange={(event) => update('modelName', event.target.value)} /></label>
          <label><span>上下文窗口</span><input type="number" min={1024} max={10000000} value={draft.contextWindow} onChange={(event) => update('contextWindow', Number(event.target.value))} /></label>
          <label><span>最大输出</span><input type="number" min={256} max={draft.contextWindow} value={draft.maxTokens} onChange={(event) => update('maxTokens', Number(event.target.value))} /></label>
        </div>

        <div className="custom-model-toggles">
          <button type="button" data-active={draft.localNoAuth || undefined} onClick={() => update('localNoAuth', !draft.localNoAuth)}><span className="custom-toggle-icon"><KeyRound size={17} /></span><span><strong>本地免密服务</strong><small>使用占位凭据启用本地端点</small></span>{draft.localNoAuth ? <Check size={15} /> : null}</button>
          <button type="button" data-active={draft.reasoning || undefined} onClick={() => update('reasoning', !draft.reasoning)}><span className="custom-toggle-icon"><Cpu size={17} /></span><span><strong>推理模型</strong><small>允许选择思考强度</small></span>{draft.reasoning ? <Check size={15} /> : null}</button>
          <button type="button" data-active={draft.imageInput || undefined} onClick={() => update('imageInput', !draft.imageInput)}><span className="custom-toggle-icon"><Image size={17} /></span><span><strong>图片输入</strong><small>模型可接收图片内容</small></span>{draft.imageInput ? <Check size={15} /> : null}</button>
          <button type="button" disabled={!draft.api.startsWith('openai-')} data-active={draft.compatibilityMode || undefined} onClick={() => update('compatibilityMode', !draft.compatibilityMode)}><span className="custom-toggle-icon"><Server size={17} /></span><span><strong>兼容模式</strong><small>适合 Ollama / vLLM / LM Studio</small></span>{draft.compatibilityMode ? <Check size={15} /> : null}</button>
        </div>

        <div className="custom-model-save-row"><span>{draft.localNoAuth ? '保存后可直接选择；请确保本地服务正在运行。' : '保存后请在 Provider 页面添加 API Key。'}</span><button className="settings-save" type="button" disabled={busy || !draft.providerId.trim() || !draft.providerName.trim() || !draft.modelId.trim() || !draft.modelName.trim()} onClick={() => void save()}>{busy ? <LoaderCircle className="spin" size={15} /> : null}{busy ? '保存中…' : editingKey ? '保存修改' : '添加模型'}</button></div>
      </section>

      <section className="settings-section custom-model-library">
        <div className="section-title"><div><h3>models.json 中的模型</h3><p>{customModels.length} 个可视化管理的自定义模型。</p></div></div>
        <div className="custom-model-list">
          {customModels.map((model) => {
            const key = `${model.providerId}/${model.modelId}`
            return (
              <article key={key} data-editing={editingKey === key || undefined}>
                <ProviderLogo providerId={model.providerId} providerName={model.providerName} size={34} />
                <div><strong>{model.modelName}</strong><span>{model.providerName} · {model.api.replaceAll('-', ' ')}</span><small>{Math.round(model.contextWindow / 1000)}K context · {model.localNoAuth ? '本地免密' : '需凭据'}</small></div>
                <button type="button" aria-label={`编辑 ${model.modelName}`} onClick={() => edit(model)}><Edit3 size={14} /></button>
                <button type="button" aria-label={`删除 ${model.modelName}`} data-danger={deleteArmed === key || undefined} onClick={() => { if (deleteArmed !== key) { setDeleteArmed(key); return }; void deleteCustomModel(model.providerId, model.modelId).then((ok) => { if (ok) { setDeleteArmed(undefined); if (editingKey === key) reset() } }) }}><Trash2 size={14} />{deleteArmed === key ? <span>确认</span> : null}</button>
              </article>
            )
          })}
          {!customModels.length ? <div className="resource-empty"><Server size={22} /><span>还没有自定义模型</span><small>上面的表单会安全创建 Pi 配置。</small></div> : null}
        </div>
      </section>
    </div>
  )
}
