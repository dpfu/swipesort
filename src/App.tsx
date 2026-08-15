import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { nanoid } from 'nanoid'

import {
  applyReviewCorrection,
  commitAssignment,
  createSortSession,
  deriveRecordedAssignments,
  deriveResultAssignments,
  getNextCardId,
  undoLastAssignment,
} from './domain'
import type { Project, Screen, SortSession } from './domain/types'
import { ResultsScreen } from './features/results/ResultsScreen'
import { ReplayScreen } from './features/replay/ReplayScreen'
import { SetupScreen } from './features/setup/SetupScreen'
import { SortScreen } from './features/sort/SortScreen'
import type { PresentedMedia, ReplayFrame, SwipeCommit } from './features/types'
import {
  createDemoMedia,
  ObjectUrlRegistry,
  prepareMediaFile,
} from './media'
import {
  exportProjectArchive,
  importProjectArchive,
  swipeSortStorage,
} from './storage'
import {
  createEmptyProject,
  moveProjectItem,
  touchProject,
  withCategoryName,
} from './app/project'
import './App.css'

const storage = swipeSortStorage

function fileTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || 'Untitled media'
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [session, setSession] = useState<SortSession | null>(null)
  const [screen, setScreen] = useState<Screen>('setup')
  const [presentedMedia, setPresentedMedia] = useState<PresentedMedia[]>([])
  const [hydratedMediaKey, setHydratedMediaKey] = useState<string>()
  const [missingMediaItemIds, setMissingMediaItemIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [isHydrated, setIsHydrated] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [replayStep, setReplayStep] = useState(0)
  const [isReplayPlaying, setIsReplayPlaying] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const urlRegistryRef = useRef(new ObjectUrlRegistry())
  const presentedMediaRef = useRef<PresentedMedia[]>([])
  const projectLoadRequestRef = useRef(0)
  const projectRef = useRef<Project | null>(null)
  projectRef.current = project

  const reportError = useCallback((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : 'Something went wrong.'
    setError(message)
    setStatus(undefined)
  }, [])

  const loadProject = useCallback(
    async (nextProject: Project, allowResume = true) => {
      const request = ++projectLoadRequestRef.current
      projectRef.current = nextProject
      setProject(nextProject)
      setSession(null)
      setScreen('setup')
      setError(undefined)
      setReplayStep(0)
      setIsReplayPlaying(false)
      const sessions = await storage.listSessions(nextProject.id)
      if (request !== projectLoadRequestRef.current) return
      const active = nextProject.activeSessionId
        ? sessions.find((candidate) => candidate.id === nextProject.activeSessionId)
        : sessions[0]
      setSession(active ?? null)
      setScreen(
        allowResume && active && !active.completedAt ? 'sort' : 'setup',
      )
    },
    [],
  )

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const existingProjects = await storage.listProjects()
        let initial = existingProjects[0]
        if (!initial) {
          initial = createEmptyProject()
          await storage.putProject(initial)
        }
        if (!active) return
        setProjects(existingProjects.length > 0 ? existingProjects : [initial])
        await loadProject(initial)
      } catch (cause) {
        if (active) reportError(cause)
      } finally {
        if (active) setIsHydrated(true)
      }
    })()
    return () => {
      active = false
    }
  }, [loadProject, reportError])

  useEffect(() => {
    const registry = urlRegistryRef.current
    return () => registry.dispose()
  }, [])

  const projectId = project?.id
  const projectItems = project?.items
  const sessionProjectId = session?.projectId
  const sessionItems = session?.itemSnapshot
  const mediaItems = useMemo(() => {
    const byId = new Map(projectItems?.map((item) => [item.id, item]) ?? [])
    if (sessionItems && sessionProjectId === projectId) {
      for (const item of sessionItems) byId.set(item.id, item)
    }
    return [...byId.values()]
  }, [projectId, projectItems, sessionItems, sessionProjectId])
  const mediaKey = useMemo(
    () => mediaItems.map((item) => `${item.id}:${item.assetId}`).join('|'),
    [mediaItems],
  )

  useEffect(() => {
    let active = true
    void (async () => {
      const primaryAssets = await storage.getAssets(
        mediaItems.map((item) => item.assetId),
      )
      const primaryById = new Map(primaryAssets.map((asset) => [asset.id, asset]))
      const posterAssets = await storage.getAssets(
        primaryAssets.flatMap((asset) =>
          asset.posterAssetId ? [asset.posterAssetId] : [],
        ),
      )
      const posterById = new Map(posterAssets.map((asset) => [asset.id, asset]))
      if (!active) return
      const next = mediaItems.flatMap((item): PresentedMedia[] => {
        const asset = primaryById.get(item.assetId)
        if (!asset) return []
        const poster = asset.posterAssetId
          ? posterById.get(asset.posterAssetId)
          : undefined
        return [
          {
            item,
            asset,
            src: urlRegistryRef.current.get(asset.id, asset.blob),
            posterSrc: poster
              ? urlRegistryRef.current.get(poster.id, poster.blob)
              : undefined,
          },
        ]
      })
      const retainedIds = new Set(
        next.flatMap((media) => [
          media.asset.id,
          ...(media.asset.posterAssetId ? [media.asset.posterAssetId] : []),
        ]),
      )
      for (const previous of presentedMediaRef.current) {
        if (!retainedIds.has(previous.asset.id)) {
          urlRegistryRef.current.release(previous.asset.id)
        }
        if (
          previous.asset.posterAssetId &&
          !retainedIds.has(previous.asset.posterAssetId)
        ) {
          urlRegistryRef.current.release(previous.asset.posterAssetId)
        }
      }
      presentedMediaRef.current = next
      setPresentedMedia(next)
      setMissingMediaItemIds(
        new Set(
          mediaItems
            .filter((item) => !next.some((media) => media.item.id === item.id))
            .map((item) => item.id),
        ),
      )
      setHydratedMediaKey(mediaKey)
    })().catch((cause) => {
      if (active) {
        setMissingMediaItemIds(new Set(mediaItems.map((item) => item.id)))
        setHydratedMediaKey(mediaKey)
        reportError(cause)
      }
    })
    return () => {
      active = false
    }
  }, [mediaItems, mediaKey, reportError])

  useEffect(() => {
    if (!status) return
    const timeout = window.setTimeout(() => setStatus(undefined), 3200)
    return () => window.clearTimeout(timeout)
  }, [status])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [project?.id, screen])

  const updateProject = useCallback(
    (updater: (current: Project) => Project) => {
      const currentProject = projectRef.current
      if (!currentProject) return
      const next = updater(currentProject)
      projectRef.current = next
      setProject(next)
      setProjects((current) => [
        next,
        ...current.filter((candidate) => candidate.id !== next.id),
      ])
      void storage.putProject(next).catch(reportError)
    },
    [reportError],
  )

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!project || files.length === 0) return
      const projectIdAtStart = project.id
      setIsImporting(true)
      setError(undefined)
      try {
        const nextItems = []
        for (const file of files) {
          const prepared = await prepareMediaFile(file)
          await storage.putAsset(prepared.asset)
          if (prepared.posterAsset) await storage.putAsset(prepared.posterAsset)
          nextItems.push({
            id: nanoid(),
            assetId: prepared.asset.id,
            title: fileTitle(file.name),
            createdAt: prepared.asset.createdAt,
          })
        }
        const currentProject = projectRef.current
        if (!currentProject || currentProject.id !== projectIdAtStart) return
        const next = touchProject({
          ...currentProject,
          items: [...currentProject.items, ...nextItems],
        })
        projectRef.current = next
        setProject(next)
        setProjects((current) => [
          next,
          ...current.filter((candidate) => candidate.id !== next.id),
        ])
        await storage.putProject(next)
        setStatus(`${files.length} ${files.length === 1 ? 'item' : 'items'} added.`)
      } catch (cause) {
        reportError(cause)
      } finally {
        setIsImporting(false)
      }
    },
    [project, reportError],
  )

  const handleLoadDemo = useCallback(async () => {
    if (!project) return
    const projectIdAtStart = project.id
    setIsImporting(true)
    try {
      const demo = createDemoMedia(projectIdAtStart)
      await Promise.all(demo.assets.map((asset) => storage.putAsset(asset)))
      const currentProject = projectRef.current
      if (!currentProject || currentProject.id !== projectIdAtStart) return
      const next = touchProject({ ...currentProject, items: demo.items })
      projectRef.current = next
      setProject(next)
      setProjects((current) => [
        next,
        ...current.filter((candidate) => candidate.id !== next.id),
      ])
      await storage.putProject(next)
      setStatus('Demo set ready to sort.')
    } catch (cause) {
      reportError(cause)
    } finally {
      setIsImporting(false)
    }
  }, [project, reportError])

  const startSort = useCallback(async () => {
    if (!project || project.items.length === 0) return
    try {
      const nextSession = createSortSession(project, {
        id: nanoid(),
        startedAt: new Date().toISOString(),
      })
      const nextProject = touchProject({
        ...project,
        activeSessionId: nextSession.id,
      })
      await Promise.all([
        storage.putSession(nextSession),
        storage.putProject(nextProject),
      ])
      setSession(nextSession)
      projectRef.current = nextProject
      setProject(nextProject)
      setProjects((current) => [
        nextProject,
        ...current.filter((candidate) => candidate.id !== nextProject.id),
      ])
      setScreen('sort')
      setReplayStep(0)
      setError(undefined)
    } catch (cause) {
      reportError(cause)
    }
  }, [project, reportError])

  const handleAssign = useCallback(
    async (commit: SwipeCommit) => {
      if (!session) return
      const atMs = Math.max(0, Date.now() - Date.parse(session.startedAt))
      try {
        const next = commitAssignment(session, {
          id: nanoid(),
          ...commit,
          atMs,
        })
        await storage.putSession(next)
        setSession(next)
        if (!getNextCardId(next)) {
          window.setTimeout(() => setScreen('results'), 240)
        }
      } catch (cause) {
        reportError(cause)
        throw cause
      }
    },
    [reportError, session],
  )

  const handleUndo = useCallback(async () => {
    if (!session) return
    const next = undoLastAssignment(session, {
      id: nanoid(),
      atMs: Math.max(0, Date.now() - Date.parse(session.startedAt)),
    })
    if (next === session) return
    try {
      await storage.putSession(next)
      setSession(next)
    } catch (cause) {
      reportError(cause)
    }
  }, [reportError, session])

  const handleCorrection = useCallback(
    async (itemId: string, categoryId: string) => {
      if (!session) return
      try {
        const next = applyReviewCorrection(session, {
          id: nanoid(),
          itemId,
          categoryId,
          changedAt: new Date().toISOString(),
        })
        await storage.putSession(next)
        setSession(next)
      } catch (cause) {
        reportError(cause)
      }
    },
    [reportError, session],
  )

  const presentedById = useMemo(
    () => new Map(presentedMedia.map((media) => [media.item.id, media])),
    [presentedMedia],
  )
  const setupMedia = useMemo(
    () =>
      (project?.items ?? []).flatMap((item) => {
        const media = presentedById.get(item.id)
        return media ? [{ ...media, item }] : []
      }),
    [presentedById, project?.items],
  )
  const currentCardId = session ? getNextCardId(session) : undefined
  const currentMedia = currentCardId
    ? presentedById.get(currentCardId)
    : undefined
  const isCurrentMediaLoading = Boolean(
    currentCardId && hydratedMediaKey !== mediaKey,
  )
  const isCurrentMediaMissing = Boolean(
    currentCardId &&
      hydratedMediaKey === mediaKey &&
      missingMediaItemIds.has(currentCardId),
  )
  const assignmentCount = session
    ? deriveRecordedAssignments(session).length
    : 0
  const resultCategoryByItemId = useMemo(() => {
    if (!session) return {}
    return Object.fromEntries(
      deriveResultAssignments(session).map((assignment) => [
        assignment.itemId,
        assignment.categoryId,
      ]),
    )
  }, [session])
  const replayFrames = useMemo<ReplayFrame[]>(() => {
    if (!session) return []
    const undoneEventIds = new Set(
      session.events.flatMap((event) =>
        event.type === 'undo' ? [event.targetEventId] : [],
      ),
    )
    return session.events.flatMap((event): ReplayFrame[] => {
      if (event.type !== 'assign') return []
      const item = presentedById.get(event.itemId)
      return item
        ? [
            {
              item,
              categoryId: event.categoryId,
              direction: event.direction,
              atMs: event.atMs,
              undone: undoneEventIds.has(event.id),
            },
          ]
        : []
    })
  }, [presentedById, session])

  useEffect(() => {
    if (!isReplayPlaying) return
    if (replayStep >= replayFrames.length) {
      setIsReplayPlaying(false)
      return
    }
    const timeout = window.setTimeout(
      () => setReplayStep((current) => Math.min(replayFrames.length, current + 1)),
      700,
    )
    return () => window.clearTimeout(timeout)
  }, [isReplayPlaying, replayFrames.length, replayStep])

  const handleExport = useCallback(async () => {
    if (!project) return
    try {
      const archive = await exportProjectArchive(storage, project.id)
      const safeName = project.name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
      downloadBlob(archive, `${safeName || 'swipesort-project'}.swipesort.zip`)
      setStatus('Project exported.')
    } catch (cause) {
      reportError(cause)
    }
  }, [project, reportError])

  const handleImport = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      setIsImporting(true)
      try {
        const imported = await importProjectArchive(storage, file)
        const nextProjects = await storage.listProjects()
        setProjects(nextProjects)
        await loadProject(imported, true)
        setStatus('Project imported.')
      } catch (cause) {
        reportError(cause)
      } finally {
        setIsImporting(false)
      }
    },
    [loadProject, reportError],
  )

  const handleNewProject = useCallback(async () => {
    const next = createEmptyProject()
    try {
      await storage.putProject(next)
      setProjects((current) => [next, ...current])
      await loadProject(next, false)
    } catch (cause) {
      reportError(cause)
    }
  }, [loadProject, reportError])

  if (!isHydrated || !project) {
    return (
      <main className="loadingScreen" aria-live="polite">
        <span className="brand__mark" aria-hidden="true">↔</span>
        <p>Opening SwipeSort…</p>
      </main>
    )
  }

  const isSortScreen = screen === 'sort'
  const canShowResult = Boolean(session?.completedAt)
  const hasInProgressSession = Boolean(session && !session.completedAt)

  return (
    <div className={`appShell${isSortScreen ? ' appShell--sort' : ''}`}>
      {!isSortScreen ? (
        <header className="appHeader">
          <button
            className="brand brand--button"
            type="button"
            onClick={() => setScreen('setup')}
            aria-label="SwipeSort setup"
          >
            <span className="brand__mark" aria-hidden="true">↔</span>
            <span>SwipeSort</span>
          </button>
          <nav className="appNav" aria-label="Project views">
            <button
              className="appNav__button"
              type="button"
              aria-current={screen === 'setup' ? 'page' : undefined}
              onClick={() => setScreen('setup')}
            >
              Setup
            </button>
            {canShowResult ? (
              <>
                <button
                  className="appNav__button"
                  type="button"
                  aria-current={screen === 'results' ? 'page' : undefined}
                  onClick={() => setScreen('results')}
                >
                  Results
                </button>
                <button
                  className="appNav__button"
                  type="button"
                  aria-current={screen === 'replay' ? 'page' : undefined}
                  onClick={() => {
                    setReplayStep(0)
                    setScreen('replay')
                  }}
                >
                  Replay
                </button>
              </>
            ) : null}
          </nav>
        </header>
      ) : null}

      <div className="appMain">
        {screen === 'setup' ? (
          <>
            <div className="projectTools" aria-label="Local projects">
              <label>
                <span>Project</span>
                <select
                  value={project.id}
                  disabled={isImporting}
                  onChange={(event) => {
                    const selected = projects.find(
                      (candidate) => candidate.id === event.target.value,
                    )
                    if (selected) void loadProject(selected, true).catch(reportError)
                  }}
                >
                  {projects.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={isImporting} onClick={() => void handleNewProject()}>New</button>
              <button type="button" disabled={isImporting} onClick={() => importInputRef.current?.click()}>Import</button>
              <button type="button" disabled={isImporting} onClick={() => void handleExport()}>Export</button>
              <input
                ref={importInputRef}
                className="visuallyHidden"
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => void handleImport(event)}
              />
            </div>
            {hasInProgressSession && session ? (
              <aside className="resumeSort" aria-label="Sort in progress">
                <div>
                  <strong>Sort in progress</strong>
                  <span>
                    {assignmentCount} of {session.cardOrder.length} cards placed
                  </span>
                </div>
                <button
                  className="ss-button ss-button--primary"
                  type="button"
                  disabled={isImporting}
                  onClick={() => setScreen('sort')}
                >
                  Resume sorting
                </button>
              </aside>
            ) : null}
            <SetupScreen
              projectName={project.name}
              categories={project.categories}
              items={setupMedia}
              onProjectNameChange={(name) =>
                updateProject((current) => touchProject({ ...current, name }))
              }
              onCategoryNameChange={(categoryId, name) =>
                updateProject((current) => withCategoryName(current, categoryId, name))
              }
              onFilesSelected={(files) => void handleFilesSelected(files)}
              onRemoveItem={(itemId) =>
                updateProject((current) =>
                  touchProject({
                    ...current,
                    items: current.items.filter((item) => item.id !== itemId),
                  }),
                )
              }
              onMoveItem={(itemId, direction) =>
                updateProject((current) =>
                  moveProjectItem(current, itemId, direction),
                )
              }
              onStart={() => void startSort()}
              startLabel={hasInProgressSession ? 'Start new session' : undefined}
              onLoadDemo={() => void handleLoadDemo()}
              isImporting={isImporting}
              error={error}
            />
          </>
        ) : null}

        {screen === 'sort' && session ? (
          <SortScreen
            categories={session.categorySnapshot}
            current={currentMedia}
            index={assignmentCount}
            total={session.cardOrder.length}
            canUndo={assignmentCount > 0}
            onAssign={handleAssign}
            onUndo={() => void handleUndo()}
            onExit={() => setScreen(currentCardId ? 'setup' : 'results')}
            isLoadingCurrent={isCurrentMediaLoading}
            isCurrentMissing={isCurrentMediaMissing}
          />
        ) : null}

        {screen === 'results' && session ? (
          <ResultsScreen
            categories={session.categorySnapshot}
            items={session.cardOrder.flatMap((itemId) => {
              const media = presentedById.get(itemId)
              return media ? [media] : []
            })}
            categoryIdByItemId={resultCategoryByItemId}
            onMoveItem={(itemId, categoryId) => {
              void handleCorrection(itemId, categoryId)
            }}
            onReplay={() => {
              setReplayStep(0)
              setScreen('replay')
            }}
            onNewSort={() => void startSort()}
          />
        ) : null}

        {screen === 'replay' && session ? (
          <ReplayScreen
            categories={session.categorySnapshot}
            frames={replayFrames}
            stepIndex={replayStep}
            isPlaying={isReplayPlaying}
            onStepChange={(step) => {
              setReplayStep(step)
              setIsReplayPlaying(false)
            }}
            onTogglePlaying={() => {
              if (replayStep >= replayFrames.length) setReplayStep(0)
              setIsReplayPlaying((playing) => !playing)
            }}
            onExit={() => {
              setIsReplayPlaying(false)
              setScreen('results')
            }}
          />
        ) : null}
      </div>

      {status ? <div className="appStatus" role="status">{status}</div> : null}
    </div>
  )
}

export default App
