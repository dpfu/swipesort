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
import { parseTikTokUrls, prepareTikTokLink } from './media/tiktok'
import './App.css'

const storage = swipeSortStorage

type NoticeAction = {
  label: string
  itemId: string
  categoryId: string
  projectId: string
  sessionId: string
}

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
  const [statusRevision, setStatusRevision] = useState(0)
  const [noticeAction, setNoticeAction] = useState<NoticeAction>()
  const [replayStep, setReplayStep] = useState(0)
  const [isReplayPlaying, setIsReplayPlaying] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const urlRegistryRef = useRef(new ObjectUrlRegistry())
  const presentedMediaRef = useRef<PresentedMedia[]>([])
  const projectLoadRequestRef = useRef(0)
  const projectRef = useRef<Project | null>(null)
  projectRef.current = project

  const reportError = useCallback((_cause: unknown, message = 'Something went wrong. Try again.') => {
    setError(message)
    setStatus(undefined)
    setNoticeAction(undefined)
  }, [])

  const showStatus = useCallback((message: string, action?: NoticeAction) => {
    setStatus(message)
    setStatusRevision((revision) => revision + 1)
    setNoticeAction(action)
    setError(undefined)
  }, [])

  const loadProject = useCallback(
    async (nextProject: Project, allowResume = true) => {
      const request = ++projectLoadRequestRef.current
      projectRef.current = nextProject
      setProject(nextProject)
      setSession(null)
      setScreen('setup')
      setError(undefined)
      setStatus(undefined)
      setNoticeAction(undefined)
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
        if (active) {
          reportError(
            cause,
            'Couldn\'t open your saved projects. Reload SwipeSort and try again.',
          )
        }
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
            src: asset.kind === 'tiktok' ? '' : urlRegistryRef.current.get(asset.id, asset.blob),
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
        reportError(
          cause,
          'Some local media couldn\'t be opened. Return to Setup and add it again.',
        )
      }
    })
    return () => {
      active = false
    }
  }, [mediaItems, mediaKey, reportError])

  useEffect(() => {
    if (!status || noticeAction) return
    const timeout = window.setTimeout(() => {
      setStatus(undefined)
      setNoticeAction(undefined)
    }, 4200)
    return () => window.clearTimeout(timeout)
  }, [noticeAction, status, statusRevision])

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
      void storage.putProject(next).catch((cause) => {
        reportError(cause, 'Couldn\'t save that project change. Try again.')
      })
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
        showStatus(`${files.length} ${files.length === 1 ? 'card' : 'cards'} added.`)
      } catch (cause) {
        reportError(cause, 'Couldn\'t add that media. Choose another image or short video.')
      } finally {
        setIsImporting(false)
      }
    },
    [project, reportError, showStatus],
  )

  const handleTikTokImport = useCallback(async (text: string) => {
    const current = projectRef.current
    if (!current || isImporting) throw new Error('Wait for the current import to finish.')
    const parsed = parseTikTokUrls(text)
    setIsImporting(true)
    try {
      const existing = await storage.getAssets(current.items.map((item) => item.assetId))
      const ids = new Set(existing.flatMap((asset) => asset.kind === 'tiktok' ? [asset.tiktok.videoId] : []))
      const links = parsed.links.filter((link) => !ids.has(link.videoId))
      const duplicates = parsed.duplicates + parsed.links.length - links.length
      if (!links.length) {
        showStatus('These TikTok videos are already in this project.')
        return
      }
      const assets = links.map(prepareTikTokLink)
      const latest = projectRef.current
      if (!latest || latest.id !== current.id) throw new Error('The project changed. Add the links again.')
      const next = touchProject({ ...latest, items: [...latest.items, ...assets.map((asset) => ({
        id: nanoid(), assetId: asset.id, title: `TikTok ${new URL(asset.tiktok.url).pathname.split('/')[1]} · ${asset.tiktok.videoId.slice(-4)}`, createdAt: asset.createdAt,
      }))] })
      await storage.putProjectWithAssets(next, assets)
      projectRef.current = next
      setProject(next)
      setProjects((all) => [next, ...all.filter((entry) => entry.id !== next.id)])
      showStatus(`${links.length} TikTok ${links.length === 1 ? 'video' : 'videos'} added.${duplicates ? ` ${duplicates} duplicate ${duplicates === 1 ? 'link' : 'links'} skipped.` : ''}`)
    } finally { setIsImporting(false) }
  }, [isImporting, showStatus])

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
      showStatus('Demo cards are ready to sort.')
    } catch (cause) {
      reportError(cause, 'Couldn\'t add the demo cards. Try again.')
    } finally {
      setIsImporting(false)
    }
  }, [project, reportError, showStatus])

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
      setStatus(undefined)
      setNoticeAction(undefined)
    } catch (cause) {
      reportError(cause, 'Couldn\'t start this sort. Try again.')
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
        setError(undefined)
      } catch (cause) {
        reportError(cause, 'Couldn\'t save your choice. The card was not moved. Try again.')
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
      setError(undefined)
    } catch (cause) {
      reportError(cause, 'Couldn\'t undo that choice. Try again.')
    }
  }, [reportError, session])

  const handleCorrection = useCallback(
    async (itemId: string, categoryId: string, isUndo = false) => {
      if (!session) return
      const previousCategoryId = deriveResultAssignments(session).find(
        (assignment) => assignment.itemId === itemId,
      )?.categoryId
      try {
        const next = applyReviewCorrection(session, {
          id: nanoid(),
          itemId,
          categoryId,
          changedAt: new Date().toISOString(),
        })
        await storage.putSession(next)
        setSession(next)
        const title = session.itemSnapshot.find((item) => item.id === itemId)?.title ?? 'Card'
        const categoryName = session.categorySnapshot.find(
          (category) => category.id === categoryId,
        )?.name
        showStatus(
          `${title} moved to ${categoryName ?? 'the other category'}.`,
          !isUndo && previousCategoryId && previousCategoryId !== categoryId
            ? {
                label: 'Undo',
                itemId,
                categoryId: previousCategoryId,
                projectId: session.projectId,
                sessionId: session.id,
              }
            : undefined,
        )
      } catch (cause) {
        reportError(cause, 'Couldn\'t move that card. Try again.')
      }
    },
    [reportError, session, showStatus],
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
      showStatus('Project downloaded.')
    } catch (cause) {
      reportError(cause, 'Couldn\'t download this project. Try again.')
    }
  }, [project, reportError, showStatus])

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
        showStatus('Project imported.')
      } catch (cause) {
        reportError(
          cause,
          'Couldn\'t import that project. Choose a SwipeSort project ZIP and try again.',
        )
      } finally {
        setIsImporting(false)
      }
    },
    [loadProject, reportError, showStatus],
  )

  const handleNewProject = useCallback(async () => {
    const next = createEmptyProject()
    try {
      await storage.putProject(next)
      setProjects((current) => [next, ...current])
      await loadProject(next, false)
    } catch (cause) {
      reportError(cause, 'Couldn\'t create a new project. Try again.')
    }
  }, [loadProject, reportError])

  if (!isHydrated || !project) {
    return (
      <main className="loadingScreen" aria-live="polite" role={error ? 'alert' : undefined}>
        <span className="brand__mark" aria-hidden="true">↔</span>
        <p>{error ?? 'Opening SwipeSort…'}</p>
        {error ? (
          <button className="ss-button ss-button--primary" type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        ) : null}
      </main>
    )
  }

  const isSortScreen = screen === 'sort'
  const isReplayScreen = screen === 'replay'
  const canShowResult = Boolean(session?.completedAt)
  const hasInProgressSession = Boolean(session && !session.completedAt)

  return (
    <div
      className={`appShell${isSortScreen ? ' appShell--sort' : ''}${isReplayScreen ? ' appShell--replay' : ''}`}
    >
      {!isSortScreen ? (
        <header className="appHeader">
          <div className="brand" aria-label="SwipeSort">
            <span className="brand__mark" aria-hidden="true">↔</span>
            <span>SwipeSort</span>
          </div>
          <nav className="appNav" aria-label="Project screens">
            <button
              className="appNav__button"
              type="button"
              aria-current={screen === 'setup' ? 'page' : undefined}
              onClick={() => {
                setIsReplayPlaying(false)
                setStatus(undefined)
                setNoticeAction(undefined)
                setScreen('setup')
              }}
            >
              Setup
            </button>
            {canShowResult ? (
              <>
                <button
                  className="appNav__button"
                  type="button"
                  aria-current={screen === 'results' ? 'page' : undefined}
                  onClick={() => {
                    setIsReplayPlaying(false)
                    setStatus(undefined)
                    setNoticeAction(undefined)
                    setScreen('results')
                  }}
                >
                  Result
                </button>
                <button
                  className="appNav__button"
                  type="button"
                  aria-current={screen === 'replay' ? 'page' : undefined}
                  onClick={() => {
                    setReplayStep(0)
                    setStatus(undefined)
                    setNoticeAction(undefined)
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
                    if (selected) {
                      void loadProject(selected, true).catch((cause) => {
                        reportError(cause, 'Couldn\'t open that project. Try again.')
                      })
                    }
                  }}
                >
                  {projects.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={isImporting} onClick={() => void handleNewProject()}>New project</button>
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
                  onClick={() => {
                    setStatus(undefined)
                    setNoticeAction(undefined)
                    setScreen('sort')
                  }}
                >
                  Resume sorting
                </button>
              </aside>
            ) : null}
            <SetupScreen
              key={project.id}
              projectName={project.name}
              onTikTokImport={handleTikTokImport}
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
              onStart={() => {
                if (
                  hasInProgressSession &&
                  !window.confirm(
                    'Start this sort over? Your current progress will no longer be available from this project.',
                  )
                ) return
                void startSort()
              }}
              startLabel={hasInProgressSession ? 'Start over…' : undefined}
              onLoadDemo={() => void handleLoadDemo()}
              isImporting={isImporting}
              error={undefined}
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
              setStatus(undefined)
              setNoticeAction(undefined)
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
              setStatus(undefined)
              setNoticeAction(undefined)
              setScreen('results')
            }}
          />
        ) : null}
      </div>

      {error ? (
        <div className="appNotice appNotice--error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setError(undefined)}>Dismiss</button>
        </div>
      ) : null}
      {status ? (
        <div className="appNotice" role="status">
          <p>{status}</p>
          {noticeAction ? (
            <div className="appNotice__actions">
              <button
                type="button"
                onClick={() => {
                  const action = noticeAction
                  setStatus(undefined)
                  setNoticeAction(undefined)
                  if (
                    action.projectId !== project.id ||
                    action.sessionId !== session?.id
                  ) {
                    return
                  }
                  void handleCorrection(action.itemId, action.categoryId, true)
                }}
              >
                {noticeAction.label}
              </button>
              <button
                className="appNotice__dismiss"
                type="button"
                aria-label="Dismiss notification"
                onClick={() => {
                  setStatus(undefined)
                  setNoticeAction(undefined)
                }}
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default App
