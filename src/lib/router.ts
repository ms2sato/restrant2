import express from 'express'
import { z } from 'zod'

export { z }

export type ConstructSource = 'body' | 'query' | 'params' | 'files'
export type ActionName = 'build' | 'edit' | 'show' | 'index' | 'create' | 'update' | 'destroy'

export type ActionDescriptor = {
  action: string
  path: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
}

export type ConstructDescriptor = {
  schema?: z.AnyZodObject | null
  sources?: readonly ConstructSource[]
}

export type ConstructConfig = {
  [key: string]: ConstructDescriptor
}

export type RouteConfig = {
  name: string
  construct?: ConstructConfig
  actions?: readonly ActionDescriptor[]
}

export interface Router {
  sub(...args: any[]): Router
  resources(path: string, config: RouteConfig): Promise<void>
}

export namespace Actions {
  const build: ActionDescriptor = {
    action: 'build',
    path: '/build',
    method: 'get',
  } as const
  const edit: ActionDescriptor = {
    action: 'edit',
    path: '/:id/edit',
    method: 'get',
  } as const
  const show: ActionDescriptor = {
    action: 'show',
    path: '/:id',
    method: 'get',
  } as const
  const index: ActionDescriptor = {
    action: 'index',
    path: '/',
    method: 'get',
  } as const
  const create: ActionDescriptor = {
    action: 'create',
    path: '/',
    method: 'post',
  } as const
  const update: ActionDescriptor = {
    action: 'update',
    path: '/:id',
    method: 'patch',
  } as const
  const destroy: ActionDescriptor = {
    action: 'destroy',
    path: '/:id',
    method: 'delete',
  } as const

  const all: readonly ActionDescriptor[] = [build, edit, show, index, create, update, destroy]

  export type Option =
    | {
        only: readonly ActionName[]
        except?: undefined
      }
    | {
        except: readonly ActionName[]
        only?: undefined
      }

  export function standard(option?: Option): readonly ActionDescriptor[] {
    return applyOption(all, option)
  }

  export function api(option?: Option): readonly ActionDescriptor[] {
    const actions = [show, index, create, update, destroy]
    return applyOption(actions, option)
  }

  function applyOption(actions: readonly ActionDescriptor[], option?: Option) {
    if (!option) {
      return actions
    }

    if (option.only) {
      return only(option.only, actions)
    }

    if (option.except) {
      return except(option.except, actions)
    }

    throw new RouterError('Unreachable!')
  }

  export function only(actions: readonly ActionName[], sources: readonly ActionDescriptor[] = all): ActionDescriptor[] {
    return sources.filter((ad) => actions.includes(ad.action as ActionName))
  }

  export function except(
    actions: readonly ActionName[],
    sources: readonly ActionDescriptor[] = all
  ): ActionDescriptor[] {
    return sources.filter((ad) => !actions.includes(ad.action as ActionName))
  }
}

export type ValidationError = z.ZodError

export class ActionContext {
  readonly render
  readonly redirect

  constructor(readonly req: express.Request, readonly res: express.Response) {
    // @see https://stackoverflow.com/questions/47647709/method-alias-with-typescript
    this.render = this.res.render.bind(this.res)
    this.redirect = this.res.redirect.bind(this.res)
  }

  get params() {
    return this.req.params
  }
  get body() {
    return this.req.body
  }
  get query() {
    return this.req.query
  }
}

export type Handler = (ctx: ActionContext) => void

export type MultiOptionResponder = {
  success: (ctx: ActionContext, output: any, ...options: any) => Promise<void>
  invalid?: (ctx: ActionContext, err: ValidationError, source: any, ...options: any) => Promise<void>
  fatal?: (ctx: ActionContext, err: Error, ...options: any) => Promise<void>
}

export type Responder<O> = {
  success: (ctx: ActionContext, output: any, option: O) => Promise<void>
  invalid?: (ctx: ActionContext, err: ValidationError, source: any, option: O) => Promise<void>
  fatal?: (ctx: ActionContext, err: Error, option: O) => Promise<void>
}

export type MultiOptionAdapter = {
  [key: string]: Handler | MultiOptionResponder
}

export type Adapter<O> = {
  [key: string]: Handler | Responder<O>
}

export class RouterError extends Error {}

export type CreateOptionsFunction = {
  (ctx: ActionContext, httpPath: string, ad: ActionDescriptor): Promise<any[]>
}

export type ServerRouterConfig = {
  inputKey: string
  errorKey: string
  sourceKey: string
  actions: readonly ActionDescriptor[]
  inputArranger: InputArranger
  createOptions: CreateOptionsFunction
  constructConfig: ConstructConfig
  adapterRoot: string
  adapterFileName: string
  resourceRoot: string
  resourceFileName: string
}

export type InputArranger = (
  input: Record<string, any>,
  schema: z.ZodObject<any>,
  ctx: ActionContext
) => Record<string, any>

export class ActionSupport {
  constructor(readonly rootPath: string, readonly serverRouterConfig: ServerRouterConfig) {}
}

export class ResourceSupport {
  constructor(readonly rootPath: string, readonly serverRouterConfig: ServerRouterConfig) {}
}

export function defineResource(callback: (support: ResourceSupport, config: RouteConfig) => Record<string, Function>) {
  return callback
}

export function defineMultiOptionAdapter(
  callback: (support: ActionSupport, config: RouteConfig) => MultiOptionAdapter
) {
  return callback
}

export function defineAdapter<O = undefined>(callback: (support: ActionSupport, config: RouteConfig) => Adapter<O>) {
  return callback
}
