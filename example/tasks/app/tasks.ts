import { TaskCreateParams } from "../params"

export type Task = {
  title: string,
  description: string,
  done: boolean
}

export class Tasks {
  constructor(private tasks:Task[] = []) {
  }

  index() {
    return this.tasks
  }

  create(params: TaskCreateParams) {
    return this.tasks.push({
      ...params,
      done: false
    })
  }

  update() {

  }

  destroy() {

  }
}