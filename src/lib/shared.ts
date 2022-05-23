import { z } from 'zod'

export type ResourceMethod = (input?: any, ...args: any[]) => any | Promise<any>
export type Resource = Record<string, ResourceMethod>

export type ValidationError = z.ZodError

export type ConstructSource = 'body' | 'query' | 'params' | 'files'
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'option'

export type ActionDescriptor = {
  action: string
  path: string
  method: HttpMethod | readonly HttpMethod[]
  page?: boolean
}

export type ConstructDescriptor = {
  schema?: z.AnyZodObject | null
  sources?: readonly ConstructSource[]
}

export type ConstructConfig = {
  [action: string]: ConstructDescriptor
}

export type RouteConfig = {
  name: string
  construct?: ConstructConfig
  actions?: readonly ActionDescriptor[]
}

export interface Router {
  sub(...args: unknown[]): Router
  resources(path: string, config: RouteConfig): void
  resourceOf<R extends Resource>(name: string): R
}

export class RouterError extends Error {}

export type HandlerBuildRunner = () => Promise<void>