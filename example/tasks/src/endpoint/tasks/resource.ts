import { TaskCreateParams, TaskUpdateParams } from '../../params'
import { IdNumberParams, defineResource } from 'restrant2'

export type Task = {
  id: number
  title: string
  description: string
  done: boolean
  subtasks: number[]
  phases: Phase[]
}

type Phase = {
  title: string
  point: number
  subtasks: number[]
}

export default defineResource((_support, _routeConfig) => {
  const tasks: Map<number, Task> = new Map([
    [
      1,
      {
        id: 1,
        title: 'test1',
        description: 'test',
        done: false,
        subtasks: [1],
        phases: [
          { title: 'phase1', point: 10, subtasks: [1] },
          { title: 'phase2', point: 20, subtasks: [2] },
        ],
      },
    ],
    [
      2,
      {
        id: 2,
        title: 'test2',
        description: 'test',
        done: false,
        subtasks: [],
        phases: [
          { title: 'phase1', point: 10, subtasks: [1] },
          { title: 'phase2', point: 20, subtasks: [2] },
        ],
      },
    ],
  ])

  let lastId = 2

  const get = (id: number): Task => {
    const task = tasks.get(id)
    if (task === undefined) {
      throw new Error(`Task not found: ${id}`)
    }
    return task
  }

  return {
    index: () => {
      return Array.from(tasks, ([_id, data]) => data)
    },

    create: (params: TaskCreateParams) => {
      const task: Task = {
        ...params,
        id: ++lastId,
        done: false,
        subtasks: [],
        phases: [
          { title: 'phase1', point: 10, subtasks: [1] },
          { title: 'phase2', point: 20, subtasks: [2] },
        ],
      }
      tasks.set(task.id, task)
      return task
    },

    edit: (params: IdNumberParams) => {
      return get(params.id)
    },

    update: (params: TaskUpdateParams) => {
      const { id, ...data } = params
      const task = { ...get(id), ...data }
      tasks.set(id, task)
      return task
    },

    destroy: (params: IdNumberParams) => {
      const task = get(params.id)
      tasks.delete(params.id)
      return task
    },

    done: (params: IdNumberParams) => {
      const task = get(params.id)
      task.done = true
      return task
    },
  }
})
