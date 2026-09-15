import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ResourceToggleRequest } from '../src/shared/contracts'
import { getTopLevelResourcePattern, updatePackageResourcePatterns, updateTopLevelResourcePatterns } from './resource-config'

const PACKAGE_RESOURCE: ResourceToggleRequest = {
  kind: 'plugin',
  path: path.join('C:\\pi', 'packages', 'demo', 'extensions', 'index.ts'),
  source: 'npm:demo',
  scope: 'user',
  origin: 'package',
  baseDir: path.join('C:\\pi', 'packages', 'demo'),
  enabled: false,
  manageable: true,
}

describe('resource config updates', () => {
  it('replaces previous top-level overrides instead of accumulating conflicts', () => {
    expect(updateTopLevelResourcePatterns(['+skills/demo/SKILL.md', 'other.md'], 'skills/demo/SKILL.md', false))
      .toEqual(['other.md', '-skills/demo/SKILL.md'])
  })

  it('writes package filters to the matching package', () => {
    const result = updatePackageResourcePatterns(['npm:demo'], PACKAGE_RESOURCE)
    expect(result).toEqual([{ source: 'npm:demo', extensions: [`-${path.join('extensions', 'index.ts')}`] }])
  })

  it('uses the resource base directory for top-level patterns', () => {
    expect(getTopLevelResourcePattern({ ...PACKAGE_RESOURCE, kind: 'skill', origin: 'top-level' }, 'C:\\project', 'C:\\pi'))
      .toBe(path.join('extensions', 'index.ts'))
  })
})
