import {
  taskCreateSchema,
  taskUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
  adminWithIdNumberSchema,
} from './params'
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
    name: 'admin_user',
    construct: {
      edit: { schema: adminWithIdNumberSchema },
      create: { schema: userCreateSchema },
      update: { schema: userUpdateSchema },
      photo: { schema: adminWithIdNumberSchema },
    },
    actions: [
      ...Actions.standard({ only: ['index', 'build', 'edit', 'create', 'update'] }),
      { action: 'photo', path: '/:id/photo', method: 'get' },
    ],
  })
}
