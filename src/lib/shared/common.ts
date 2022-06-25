import { z } from 'zod'
import { blankSchema } from '../../client'

export type ResourceMethod = (input?: any, ...args: any[]) => any | Promise<any>
export type Resource = Record<string, ResourceMethod>
export type NamedResources = {
  [name: string]: Resource
}

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
}

export class RouterError extends Error {}

export type HandlerBuildRunner = () => Promise<void> | void

export const choiceSchema = (
  defaultConstructConfig: ConstructConfig,
  constructDescriptor: ConstructDescriptor | undefined,
  actionName: string
) => {
  const defaultConstructDescriptor: ConstructDescriptor | undefined = defaultConstructConfig[actionName]

  if (constructDescriptor?.schema === undefined) {
    if (!defaultConstructDescriptor?.schema) {
      throw new Error(`construct.${actionName}.schema not found in routes for #${actionName}`)
    }
    return defaultConstructDescriptor.schema
  } else if (constructDescriptor.schema === null) {
    return blankSchema
  } else {
    return constructDescriptor.schema
  }
}

export const choiseSources = (
  defaultConstructConfig: ConstructConfig,
  constructDescriptor: ConstructDescriptor | undefined,
  actionName: string
) => {
  const defaultConstructDescriptor: ConstructDescriptor | undefined = defaultConstructConfig[actionName]
  return constructDescriptor?.sources || defaultConstructDescriptor?.sources || ['params']
}
