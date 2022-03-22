import { z } from 'restrant2'

export { idNumberSchema, IdNumberParams } from 'restrant2'

const taskCoreProps = {
  title: z.string().min(3).max(255),
  description: z.string().min(3).max(4096),
}

export const taskCreateSchema = z.object(taskCoreProps)

export type TaskCreateParams = z.infer<typeof taskCreateSchema>

export const taskUpdateSchema = z.object({
  id: z.number(),
  ...taskCoreProps,
  done: z.boolean().optional(),
})

export type TaskUpdateParams = z.infer<typeof taskUpdateSchema>

const userCoreProps = {
  name: z.string().min(3).max(255),
  photo: z.string().min(3).max(4096).optional(),
}

export const userCreateSchema = z.object(userCoreProps)

export type UserCreateParams = z.infer<typeof userCreateSchema>

export const userUpdateSchema = z.object({
  id: z.number(),
  ...userCoreProps,
})

export type UserUpdateParams = z.infer<typeof userUpdateSchema>
