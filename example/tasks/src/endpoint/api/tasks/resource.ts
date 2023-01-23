import { TaskStore } from '../../../models/TaskStore'

import { TaskCreateParams, TaskUpdateParams } from '../../../params'
import { IdNumberParams, defineResource, Resource } from 'restrant2'

export default defineResource((_support, _routeConfig) => {
  TaskStore.reset()
  const taskStore = new TaskStore()

  return {
    index() {
      return taskStore.all()
    },

    show({ id }: IdNumberParams) {
      return taskStore.find(id)
    },

    create(params: TaskCreateParams) {
      return taskStore.create(params)
    },

    update(params: TaskUpdateParams) {
      return taskStore.update(params)
    },

    destroy({ id }: IdNumberParams) {
      return taskStore.destroy(id)
    },
  } as const satisfies Resource
})
