import { taskCreateSchema } from './params'
import { Router, Actions } from 'restrant2.ts/dist/lib/router'

export function routes(router: Router) {
  router.resources('/tasks', {
    construct: {
      create: {
        schema: taskCreateSchema
      }
    },
    name: 'task',
    actions: [
      ...Actions.standard(),
      { action: '_time', path: '/:id/_time', method: 'get' }
    ],
  })
}
