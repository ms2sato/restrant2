import express from 'express'
import { z } from 'zod'
import { ServerRouter } from './server-router'
import {
  ValidationError,
  Resource,
  ResourceMethod,
  ActionDescriptor,
  RouteConfig,
  ConstructSource,
} from '../client'

export * from '../client'

export { z }

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
  resourceOf<R extends Resource>(name: string): R
}

export type MutableActionContext = ActionContext & {
  mergeInputs(sources: readonly string[], pred?: (input: any, source: string) => any): any
}

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

export type CreateActionOptionsFunction = (
  ctx: ActionContext,
  httpPath: string,
  ad: ActionDescriptor
) => unknown[] | Promise<unknown[]>

/**
 * @returns If not rendered return false.
 */
export type Renderer = (ctx: ActionContext, options?: unknown) => false | undefined

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

export type InputArranger = (ctx: MutableActionContext, sources: readonly string[], schema: z.AnyZodObject) => unknown

export class ActionSupport {
  constructor(readonly rootPath: string) {}
}

export class ResourceSupport {
  constructor(readonly rootPath: string) {}
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
