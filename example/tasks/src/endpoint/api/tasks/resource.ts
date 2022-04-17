import { TaskModel } from '../../../models/task-model'

import { TaskCreateParams, TaskUpdateParams } from '../../../params'
import { IdNumberParams, defineResource } from 'restrant2'

export default defineResource((_support, _routeConfig) => {
  TaskModel.reset()
  const taskModel = new TaskModel()

  return {
    index: () => {
      return taskModel.all()
    },

    create: (params: TaskCreateParams) => {
      return taskModel.create(params)
    },

    edit: ({ id }: IdNumberParams) => {
      return taskModel.find(id)
    },

    update: (params: TaskUpdateParams) => {
      return taskModel.update(params)
    },

    destroy: ({ id }: IdNumberParams) => {
      return taskModel.destroy(id)
    },
  }
})
