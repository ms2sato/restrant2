import { z } from 'zod'

export const taskCreateSchema = z.object({
  title: z.string().max(255),
  description: z.string().max(4096)
})

export type TaskCreateParams = z.infer<typeof taskCreateSchema>