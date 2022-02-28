import { idSchema, taskCreateSchema, taskUpdateSchema } from './params'
import { Router, Actions } from 'restrant2'

export function routes(router: Router) {
  router.resources('/tasks', {
    construct: {
      create: { schema: taskCreateSchema },
      edit: { schema: idSchema },
      update: { schema: taskUpdateSchema },
      destroy: { schema: idSchema },
      done: { schema: idSchema }
    },
    name: 'task',
    actions: [
      ...Actions.standard({ except: ['show'] }),
      { action: 'done', path: '/:id/done', method: 'post' }
    ],
  })
}
