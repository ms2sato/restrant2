import { TaskCreateParams } from "../params"
import { defineResource } from "restrant2"

export type Task = {
  title: string,
  description: string,
  done: boolean
}

export default defineResource((support, options) => {
  const tasks:Task[] = []

  return {
    index: () => {
      console.log(tasks)
      return tasks
    },
  
    create: (params: TaskCreateParams) => {
      console.log(params)
      const task:Task = {
        ...params,
        done: false
      }
      tasks.push(task)
      return task
    },
  
    update: () => {
  
    },
  
    destroy: () => {
  
    },
  
    _time: () => {}    
  }
})