import { nanoid } from 'nanoid'

import type { Category, Project } from '../domain/types'

const DEFAULT_CATEGORIES: [Category, Category] = [
  {
    id: 'category-left',
    name: 'Category A',
    direction: 'left',
    color: '#4d78a8',
  },
  {
    id: 'category-right',
    name: 'Category B',
    direction: 'right',
    color: '#d96645',
  },
]

export function createEmptyProject(now = new Date()): Project {
  const timestamp = now.toISOString()
  return {
    version: 1,
    id: nanoid(),
    name: 'Untitled sort',
    categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })) as [
      Category,
      Category,
    ],
    items: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function touchProject(project: Project, now = new Date()): Project {
  return { ...project, updatedAt: now.toISOString() }
}

export function withCategoryName(
  project: Project,
  categoryId: string,
  name: string,
): Project {
  return touchProject({
    ...project,
    categories: project.categories.map((category) =>
      category.id === categoryId ? { ...category, name } : category,
    ) as [Category, Category],
  })
}

export function moveProjectItem(
  project: Project,
  itemId: string,
  direction: 'up' | 'down',
): Project {
  const from = project.items.findIndex((item) => item.id === itemId)
  const to = from + (direction === 'up' ? -1 : 1)
  if (from < 0 || to < 0 || to >= project.items.length) return project

  const items = [...project.items]
  const [item] = items.splice(from, 1)
  items.splice(to, 0, item)
  return touchProject({ ...project, items })
}
