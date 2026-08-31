import { hermesApi, profileScoped } from './client'

/**
 * The partner's task board.
 *
 * Rides the kanban plugin's own REST router (`/api/plugins/kanban/*`), which
 * the backend already mounts — the board, its schema and its lifecycle live
 * there, and a second task store would only be a second thing to disagree
 * with. The agent writes to the same board through its `kanban_*` tools, so
 * what you say in voice and what you see here are one list.
 */
const BASE = '/api/plugins/kanban'

export interface PartnerTask {
  assignee?: null | string
  body?: null | string
  created_at?: number
  id: string
  priority?: number
  status: string
  title: string
}

export interface PartnerTaskColumn {
  name: string
  tasks: PartnerTask[]
}

interface BoardResponse {
  columns: PartnerTaskColumn[]
}

export function listPartnerTasks(): Promise<BoardResponse> {
  return hermesApi<BoardResponse>({ ...profileScoped(), path: `${BASE}/board` })
}

export function createPartnerTask(title: string, body?: string): Promise<{ id: string }> {
  return hermesApi<{ id: string }>({
    ...profileScoped(),
    body: { body: body ?? '', title },
    method: 'POST',
    path: `${BASE}/tasks`
  })
}

/** Move a task between columns — the same PATCH the board drag uses. */
export function setPartnerTaskStatus(id: string, status: string): Promise<unknown> {
  return hermesApi({
    ...profileScoped(),
    body: { status },
    method: 'PATCH',
    path: `${BASE}/tasks/${encodeURIComponent(id)}`
  })
}

export function deletePartnerTask(id: string): Promise<unknown> {
  return hermesApi({
    ...profileScoped(),
    method: 'DELETE',
    path: `${BASE}/tasks/${encodeURIComponent(id)}`
  })
}
