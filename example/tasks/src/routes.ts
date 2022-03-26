import { taskCreateSchema, taskUpdateSchema, userCreateSchema, userUpdateSchema } from './params'
import { idNumberSchema, Router, Actions } from 'restrant2'

export async function routes(router: Router) {
  await router.resources('/tasks', {
    construct: {
      create: { schema: taskCreateSchema },
      update: { schema: taskUpdateSchema },
      done: { schema: idNumberSchema },
    },
    name: 'task',
    actions: [...Actions.standard({ except: ['show'] }), { action: 'done', path: '/:id/done', method: 'post' }],
  })

  const adminRouter = router.sub('/admins/:adminId')
  await adminRouter.resources('/users', {
    name: 'adminUser',
    actions: Actions.standard({ only: ['index', 'edit'] }),
  })
}
