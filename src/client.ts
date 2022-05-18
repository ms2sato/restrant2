import { z } from 'zod'

export type ResourceMethod = (input?: any, ...args: any[]) => any | Promise<any>
export type Resource = Record<string, ResourceMethod>

export type ValidationError = z.ZodError
