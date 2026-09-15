import * as Dialog from '@radix-ui/react-dialog'
import { Check, Clipboard, ExternalLink, KeyRound, LoaderCircle, LogIn, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import type { AuthPromptView } from '../shared/contracts'
import { useAppStore } from '../store/use-app-store'
import { ProviderLogo } from './ProviderLogo'

export function ProviderAuthDialog() {
  const flow = useAppStore((state) => state.authFlow)
  const answerAuthPrompt = useAppStore((state) => state.answerAuthPrompt)
  const cancelProviderLogin = useAppStore((state) => state.cancelProviderLogin)
  const [copied, setCopied] = useState(false)

  if (!flow) return null
  const prompt = flow.prompt
  const latestNotice = flow.notices.at(-1)

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) void cancelProviderLogin() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="auth-dialog" aria-describedby="auth-dialog-description">
          <header className="auth-dialog-header">
            <ProviderLogo providerId={flow.providerId} providerName={flow.providerName} size={42} className="provider-large-logo" />
            <div><Dialog.Title>连接 {flow.providerName}</Dialog.Title><Dialog.Description id="auth-dialog-description">通过 Provider 官方 OAuth 流程登录</Dialog.Description></div>
            <Dialog.Close asChild><button className="icon-button" type="button" aria-label="取消登录"><X size={18} /></button></Dialog.Close>
          </header>

          <div className="auth-dialog-body">
            <div className="auth-security-note"><ShieldCheck size={17} /><span>登录凭据由 Pi 保存在本机；PiLens 不会读取或显示访问令牌。</span></div>

            {flow.notices.map((notice, index) => {
              if (notice.type === 'device_code') {
                return (
                  <div className="auth-device-code" key={`${notice.type}:${index}`}>
                    <span>在已打开的浏览器中输入设备代码</span>
                    <button type="button" onClick={() => void copyCode(notice.userCode)}><code>{notice.userCode}</code>{copied ? <Check size={16} /> : <Clipboard size={16} />}</button>
                    <small><ExternalLink size={12} />{notice.verificationUri}</small>
                  </div>
                )
              }
              if (notice.type === 'auth_url') {
                return <div className="auth-notice" key={`${notice.type}:${index}`}><ExternalLink size={16} /><span><strong>浏览器已打开</strong><small>{notice.instructions || '请在浏览器中完成授权，然后返回 PiLens。'}</small></span></div>
              }
              if (notice.type === 'info') {
                return <div className="auth-notice" key={`${notice.type}:${index}`}><LogIn size={16} /><span><small>{notice.message}</small></span></div>
              }
              return index === flow.notices.length - 1
                ? <div className="auth-progress" key={`${notice.type}:${index}`}><LoaderCircle className="spin" size={16} /><span>{notice.message}</span></div>
                : null
            })}

            {prompt?.type === 'select' ? (
              <div className="auth-prompt">
                <strong>{prompt.message}</strong>
                <div className="auth-select-options">
                  {prompt.options?.map((option) => <button type="button" key={option.id} onClick={() => void answerAuthPrompt(prompt.id, option.id)}><span>{option.label}</span>{option.description ? <small>{option.description}</small> : null}</button>)}
                </div>
              </div>
            ) : prompt ? (
              <AuthTextPrompt key={prompt.id} prompt={prompt} onAnswer={(value) => void answerAuthPrompt(prompt.id, value)} />
            ) : !latestNotice || latestNotice.type !== 'progress' ? (
              <div className="auth-progress"><LoaderCircle className="spin" size={16} /><span>正在准备安全登录…</span></div>
            ) : null}
          </div>

          <footer className="auth-dialog-footer"><button className="secondary-button" type="button" onClick={() => void cancelProviderLogin()}>取消</button></footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function AuthTextPrompt({ prompt, onAnswer }: { prompt: AuthPromptView; onAnswer: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <form className="auth-prompt" onSubmit={(event) => { event.preventDefault(); if (value.trim()) onAnswer(value.trim()) }}>
      <label htmlFor={`auth-answer-${prompt.id}`}>{prompt.message}</label>
      <div className="auth-input"><KeyRound size={16} /><input id={`auth-answer-${prompt.id}`} autoFocus type={prompt.type === 'secret' ? 'password' : 'text'} value={value} placeholder={prompt.placeholder || (prompt.type === 'manual_code' ? '粘贴授权码' : '输入内容')} autoComplete="off" onChange={(event) => setValue(event.target.value)} /></div>
      <button className="settings-save" type="submit" disabled={!value.trim()}>继续</button>
    </form>
  )
}
