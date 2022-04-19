import { TaskCreateParams, TaskUpdateParams } from '../params'

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

let tasks: Map<number, Task>
let lastId: number

const get = (id: number): Task => {
  const task = tasks.get(id)
  if (task === undefined) {
    throw new Error(`Task not found: ${id}`)
  }
  return task
}

// Sample task model. Can be implemented as you like
export class TaskStore {
  all(): Task[] {
    return Array.from(tasks, ([_id, data]) => data)
  }

  create(params: TaskCreateParams): Task {
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
  }

  find(id: number): Task {
    return get(id)
  }

  update(params: TaskUpdateParams): Task {
    const { id, ...data } = params
    const task = { ...get(id), ...data }
    tasks.set(id, task)
    return task
  }

  destroy(id: number): Task {
    const task = get(id)
    tasks.delete(id)
    return task
  }

  done(id: number): Task {
    const task = get(id)
    task.done = true
    return task
  }

  static reset() {
    tasks = new Map([
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

    lastId = tasks.size
  }
}
