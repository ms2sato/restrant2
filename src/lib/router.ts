import express from 'express'
import { z } from 'zod'
import { ServerRouter } from './server-router'
import { ValidationError, Resource, ResourceMethod } from '../client'

export { z }

export type ConstructSource = 'body' | 'query' | 'params' | 'files'
export type ActionName = 'build' | 'edit' | 'show' | 'index' | 'create' | 'update' | 'destroy'
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
  [key: string]: ConstructDescriptor
}

export type RouteConfig = {
  name: string
  construct?: ConstructConfig
  actions?: readonly ActionDescriptor[]
}

export interface Router {
  sub(...args: unknown[]): Router
  resources(path: string, config: RouteConfig): void
  resourceOf(name: string): Resource
}

export namespace Actions {
  const build: ActionDescriptor = {
    action: 'build',
    path: '/build',
    method: 'get',
    page: true,
  } as const
  const edit: ActionDescriptor = {
    action: 'edit',
    path: '/:id/edit',
    method: 'get',
    page: true,
  } as const
  const show: ActionDescriptor = {
    action: 'show',
    path: '/:id',
    method: 'get',
    page: true,
  } as const
  const index: ActionDescriptor = {
    action: 'index',
    path: '/',
    method: 'get',
    page: true,
  } as const
  const create: ActionDescriptor = {
    action: 'create',
    path: '/',
    method: 'post',
  } as const
  const update: ActionDescriptor = {
    action: 'update',
    path: '/:id',
    method: ['put', 'patch'],
  } as const
  const destroy: ActionDescriptor = {
    action: 'destroy',
    path: '/:id',
    method: 'delete',
  } as const

  const apiShow: ActionDescriptor = {
    action: 'show',
    path: '/:id',
    method: 'get',
  } as const
  const apiIndex: ActionDescriptor = {
    action: 'index',
    path: '/',
    method: 'get',
  } as const

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
    const actions = [build, edit, show, index, create, update, destroy]
    return applyOption(actions, option)
  }

  export function api(option?: Option): readonly ActionDescriptor[] {
    const actions = [apiShow, apiIndex, create, update, destroy]
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

  export function only(actions: readonly ActionName[], sources: readonly ActionDescriptor[]): ActionDescriptor[] {
    return sources.filter((ad) => actions.includes(ad.action as ActionName))
  }

  export function except(actions: readonly ActionName[], sources: readonly ActionDescriptor[]): ActionDescriptor[] {
    return sources.filter((ad) => !actions.includes(ad.action as ActionName))
  }
}

export type ActionContext = {
  render: express.Response['render']
  readonly redirect: express.Response['redirect']
  readonly params: express.Request['params']
  readonly body: express.Request['body']
  readonly query: express.Request['query']
  readonly format: string
  readonly input: any
  readonly req: express.Request
  readonly res: express.Response
  readonly httpPath: string
  readonly httpFilePath: string
  readonly descriptor: ActionDescriptor
  readonly willRespondJson: () => boolean
  resourceOf(name: string): Resource
}

export type MutableActionContext = ActionContext & {
  mergeInputs(sources: readonly string[], pred?: (input: any, source: string) => any): any
}

export type ActionContextProps = {
  router: Router
  req: express.Request
  res: express.Response
  descriptor: ActionDescriptor
  httpPath: string
}

export type ActionContextCreator = (props: ActionContextProps) => MutableActionContext

export type Handler = (ctx: ActionContext) => void | Promise<void>

export type MultiOptionResponder = {
  success?: (ctx: ActionContext, output: unknown, ...options: unknown[]) => unknown | Promise<unknown>
  invalid?: (ctx: ActionContext, err: ValidationError, source: unknown, ...options: unknown[]) => void | Promise<void>
  fatal?: (ctx: ActionContext, err: Error, ...options: unknown[]) => void | Promise<void>
}

export type Responder<Opt = undefined, Out = unknown, Src = unknown> = {
  success?: (ctx: ActionContext, output: Out, option?: Opt) => unknown | Promise<unknown>
  invalid?: (ctx: ActionContext, err: ValidationError, source: Src, option?: Opt) => void | Promise<void>
  fatal?: (ctx: ActionContext, err: Error, option?: Opt) => void | Promise<void>
}

export type RequestCallback<In = unknown> = {
  beforeValidation?: (ctx: ActionContext, source: unknown, schema: z.AnyZodObject) => unknown
  afterValidation?: (ctx: ActionContext, input: In, schema: z.AnyZodObject) => unknown
}

export type MultiOptionAdapter = {
  [key: string]: Handler | MultiOptionResponder | RequestCallback
}

export type Adapter<Opt = undefined, In = unknown> = {
  [key: string]: Handler | Responder<Opt> | RequestCallback<In>
}

export class RouterError extends Error {}

export type CreateActionOptionsFunction = (
  ctx: ActionContext,
  httpPath: string,
  ad: ActionDescriptor
) => unknown[] | Promise<unknown[]>

export type HandlerBuildRunner = () => Promise<void>

/**
 * @returns If not rendered return false.
 */
export type Renderer = (ctx: ActionContext, options?: unknown) => false | undefined

export type RouterCore = {
  handlerBuildRunners: HandlerBuildRunner[]
  nameToResource: Map<string, Resource>
}

export type ResourceMethodHandlerParams = {
  resourceMethod: ResourceMethod
  resource: Resource
  sources: readonly ConstructSource[]
  router: ServerRouter
  httpPath: string
  schema: z.AnyZodObject
  adapterPath: string
  actionDescriptor: ActionDescriptor
  responder: MultiOptionResponder | RequestCallback
  adapter: MultiOptionAdapter
}

export type ServerRouterConfig = {
  actions: readonly ActionDescriptor[]
  inputArranger: InputArranger
  createActionOptions: CreateActionOptionsFunction
  createActionContext: ActionContextCreator
  constructConfig: ConstructConfig
  createDefaultResponder: (params: ResourceMethodHandlerParams) => Required<Responder>
  renderDefault: Renderer
  adapterRoot: string
  adapterFileName: string
  resourceRoot: string
  resourceFileName: string
}

export type InputArranger = (ctx: MutableActionContext, sources: readonly string[], schema: z.AnyZodObject) => unknown

export class ActionSupport {
  constructor(readonly rootPath: string, readonly serverRouterConfig: ServerRouterConfig) {}
}

export class ResourceSupport {
  constructor(readonly rootPath: string, readonly serverRouterConfig: ServerRouterConfig) {}
}

export function defineResource<R extends Resource>(callback: (support: ResourceSupport, config: RouteConfig) => R) {
  return callback
}

export function defineMultiOptionAdapter(
  callback: (support: ActionSupport, config: RouteConfig) => MultiOptionAdapter
) {
  return callback
}

export function defineAdapter<AR>(callback: (support: ActionSupport, config: RouteConfig) => AR) {
  return callback
}

export type EndpointFunc<S, R> = (support: S, config: RouteConfig) => R
export type ResourceFunc = EndpointFunc<ResourceSupport, Resource>
export type ActionFunc = EndpointFunc<ActionSupport, MultiOptionAdapter>

export type AdapterOf<R extends ResourceFunc, Opt = undefined> = {
  [key in keyof ReturnType<R>]:
    | Responder<Opt, Awaited<ReturnType<ReturnType<R>[key]>>, Partial<Parameters<ReturnType<R>[key]>[0]>>
    | RequestCallback<Parameters<ReturnType<R>[key]>[0]>
}
