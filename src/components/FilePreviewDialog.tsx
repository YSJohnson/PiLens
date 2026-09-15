import * as Dialog from '@radix-ui/react-dialog'
import DOMPurify from 'dompurify'
import { ExternalLink, FileAudio, FileCode2, FileImage, FileText, FileType2, LoaderCircle, X } from 'lucide-react'
import { useMemo } from 'react'
import { desktop } from '../lib/desktop'
import type { FilePreview, FilePreviewKind } from '../shared/contracts'
import { useAppStore } from '../store/use-app-store'
import MarkdownContent from './MarkdownContent'

const MAX_RENDERED_LINES = 8_000

const PREVIEW_LABELS: Record<FilePreviewKind, string> = {
  text: '源码',
  markdown: 'Markdown',
  diff: 'Diff',
  image: '图片',
  audio: '音频',
  pdf: 'PDF',
  docx: 'DOCX',
  unsupported: '文件',
}

function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function PreviewIcon({ kind }: { kind: FilePreviewKind }) {
  if (kind === 'image') return <FileImage size={18} />
  if (kind === 'audio') return <FileAudio size={18} />
  if (kind === 'docx') return <FileType2 size={18} />
  if (kind === 'text' || kind === 'diff') return <FileCode2 size={18} />
  return <FileText size={18} />
}

function TextPreview({ preview }: { preview: FilePreview }) {
  if (preview.kind !== 'diff') return <pre className="source-preview"><code>{preview.content}</code></pre>
  const allLines = (preview.content ?? '').split(/\r?\n/)
  const lines = allLines.slice(0, MAX_RENDERED_LINES)
  return (
    <pre className="source-preview diff-large-preview">
      {lines.map((line, index) => {
        const kind = line.startsWith('+') && !line.startsWith('+++')
          ? 'added'
          : line.startsWith('-') && !line.startsWith('---')
            ? 'deleted'
            : line.startsWith('@@')
              ? 'hunk'
              : 'context'
        return <span key={`${index}-${line}`} data-kind={kind}><i>{index + 1}</i><code>{line || ' '}</code></span>
      })}
      {allLines.length > lines.length ? <small>为保持界面流畅，仅渲染前 {MAX_RENDERED_LINES} 行。</small> : null}
    </pre>
  )
}

export function FilePreviewDialog() {
  const preview = useAppStore((state) => state.filePreview)
  const loading = useAppStore((state) => state.previewBusy)
  const closeFilePreview = useAppStore((state) => state.closeFilePreview)
  const safeDocxHtml = useMemo(
    () => DOMPurify.sanitize(preview?.kind === 'docx' ? preview.html ?? '' : ''),
    [preview],
  )

  return (
    <Dialog.Root open={Boolean(preview)} onOpenChange={(open) => { if (!open) closeFilePreview() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="file-preview-dialog" aria-describedby="file-preview-description">
          <header className="file-preview-header">
            <span className="file-preview-icon">{preview ? <PreviewIcon kind={preview.kind} /> : <FileText size={18} />}</span>
            <div>
              <Dialog.Title>{preview?.name ?? '文件预览'}</Dialog.Title>
              <Dialog.Description id="file-preview-description">{preview?.path}</Dialog.Description>
            </div>
            {preview ? <span className="file-preview-meta">{PREVIEW_LABELS[preview.kind]} · {fileSize(preview.size)}</span> : null}
            {preview ? <button className="titlebar-text-button" type="button" onClick={() => void desktop.openWorkspaceFile(preview.path)}><ExternalLink size={14} /><span>外部打开</span></button> : null}
            <Dialog.Close asChild><button className="icon-button" type="button" aria-label="关闭预览"><X size={17} /></button></Dialog.Close>
          </header>

          <div className="file-preview-canvas" data-kind={preview?.kind}>
            {loading ? <div className="file-preview-loading"><LoaderCircle className="spin" size={20} />正在读取文件…</div> : null}
            {!loading && preview?.kind === 'markdown' ? <div className="markdown-file-preview"><MarkdownContent content={preview.content ?? ''} /></div> : null}
            {!loading && (preview?.kind === 'text' || preview?.kind === 'diff') ? <TextPreview preview={preview} /> : null}
            {!loading && preview?.kind === 'image' && preview.dataUrl ? <div className="image-file-preview"><img src={preview.dataUrl} alt={preview.name} /></div> : null}
            {!loading && preview?.kind === 'audio' && preview.dataUrl ? <div className="audio-file-preview"><FileAudio size={42} /><strong>{preview.name}</strong><audio controls src={preview.dataUrl}>你的系统不支持音频预览。</audio></div> : null}
            {!loading && preview?.kind === 'pdf' && preview.dataUrl ? <iframe className="pdf-file-preview" src={preview.dataUrl} title={`${preview.name} PDF 预览`} /> : null}
            {!loading && preview?.kind === 'docx' ? <article className="docx-file-preview" dangerouslySetInnerHTML={{ __html: safeDocxHtml }} /> : null}
            {!loading && preview?.kind === 'unsupported' ? <div className="unsupported-file-preview"><FileText size={36} /><strong>暂不支持在应用内显示</strong><p>文件可能过大或使用了尚未识别的二进制格式，你仍可在系统默认程序中打开。</p><button className="secondary-button" type="button" onClick={() => void desktop.openWorkspaceFile(preview.path)}><ExternalLink size={14} />外部打开</button></div> : null}
          </div>

          {preview?.truncated ? <footer className="file-preview-notice">文件较大，预览仅显示前 1.5 MB；原文件不会被修改。</footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
