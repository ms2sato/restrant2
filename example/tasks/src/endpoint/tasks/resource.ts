import { TaskStore } from '../../models/TaskStore'

import { TaskCreateParams, TaskUpdateParams } from '../../params'
import { IdNumberParams, defineResource } from 'restrant2'

export default defineResource((_support, _routeConfig) => {
  TaskStore.reset()
  const taskStore = new TaskStore()

  return {
    index: () => {
      return taskStore.all()
    },

    create: (params: TaskCreateParams) => {
      return taskStore.create(params)
    },

    edit: ({ id }: IdNumberParams) => {
      return taskStore.find(id)
    },

    update: (params: TaskUpdateParams) => {
      return taskStore.update(params)
    },

    destroy: ({ id }: IdNumberParams) => {
      return taskStore.destroy(id)
    },

    done: ({ id }: IdNumberParams) => {
      return taskStore.done(id)
    },
  }
})
