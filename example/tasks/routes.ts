import { taskCreateSchema } from './params'
import { Router, Actions } from 'restrant2'

export function routes(router: Router) {
  router.resources('/tasks', {
    construct: {
      create: {
        schema: taskCreateSchema
      }
    },
    name: 'task',
    actions: [
      ...Actions.standard({ only: ['index', 'create', 'update', 'destroy'] }),
      { action: '_time', path: '/:id/_time', method: 'get' }
    ],
  })
}
