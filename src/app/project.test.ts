import { describe, expect, it } from 'vitest'

import {
  createEmptyProject,
  moveProjectItem,
  withCategoryName,
} from './project'

describe('project helpers', () => {
  it('creates exactly one left and one right category', () => {
    const project = createEmptyProject(new Date('2026-08-15T10:00:00Z'))
    expect(project.categories.map((category) => category.direction)).toEqual([
      'left',
      'right',
    ])
  })

  it('renames a category without changing its stable identity', () => {
    const project = createEmptyProject()
    const next = withCategoryName(
      project,
      project.categories[0].id,
      'Not selected',
    )
    expect(next.categories[0]).toMatchObject({
      id: project.categories[0].id,
      name: 'Not selected',
      direction: 'left',
    })
  })

  it('reorders items without mutating the original project', () => {
    const project = {
      ...createEmptyProject(),
      items: [
        { id: 'a', assetId: 'asset-a', title: 'A', createdAt: 'now' },
        { id: 'b', assetId: 'asset-b', title: 'B', createdAt: 'now' },
      ],
    }
    const next = moveProjectItem(project, 'b', 'up')
    expect(next.items.map((item) => item.id)).toEqual(['b', 'a'])
    expect(project.items.map((item) => item.id)).toEqual(['a', 'b'])
  })
})
