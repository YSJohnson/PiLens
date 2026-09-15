import path from 'node:path'
import type { PackageSource } from '@earendil-works/pi-coding-agent'
import type { ResourceKind, ResourceToggleRequest } from '../src/shared/contracts'

function resourceArrayKey(kind: ResourceKind): 'skills' | 'extensions' {
  return kind === 'skill' ? 'skills' : 'extensions'
}

function patternTarget(entry: string): string {
  return /^[!+-]/u.test(entry) ? entry.slice(1) : entry
}

export function updateTopLevelResourcePatterns(current: string[], pattern: string, enabled: boolean): string[] {
  return [
    ...current.filter((entry) => patternTarget(entry) !== pattern),
    `${enabled ? '+' : '-'}${pattern}`,
  ]
}

export function updatePackageResourcePatterns(
  packages: PackageSource[],
  request: ResourceToggleRequest,
): PackageSource[] {
  const packageIndex = packages.findIndex((entry) => (typeof entry === 'string' ? entry : entry.source) === request.source)
  if (packageIndex < 0) throw new Error(`找不到资源包 ${request.source}。`)

  const next = [...packages]
  const currentPackage = next[packageIndex]
  if (currentPackage === undefined) throw new Error(`找不到资源包 ${request.source}。`)
  const packageConfig = typeof currentPackage === 'string' ? { source: currentPackage } : { ...currentPackage }
  const key = resourceArrayKey(request.kind)
  const baseDir = request.baseDir ?? path.dirname(request.path)
  const pattern = path.relative(baseDir, request.path)
  const filters = (packageConfig[key] ?? []).filter((entry) => patternTarget(entry) !== pattern)
  filters.push(`${request.enabled ? '+' : '-'}${pattern}`)
  packageConfig[key] = filters
  next[packageIndex] = packageConfig
  return next
}

export function getTopLevelResourcePattern(request: ResourceToggleRequest, cwd: string, agentDir: string): string {
  const defaultBase = request.scope === 'project' ? path.join(cwd, '.pi') : agentDir
  return path.relative(request.baseDir ?? defaultBase, request.path)
}
