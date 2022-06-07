import express from 'express'
import { z } from 'zod'
import { ValidationError, Resource, ActionDescriptor, RouteConfig, NamedResources } from '..'

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
  resources: () => NamedResources
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

export type InputArranger = (ctx: MutableActionContext, sources: readonly string[], schema: z.AnyZodObject) => unknown

export class ActionSupport {
  constructor(readonly rootPath: string) {}
}

export class ResourceSupport {
  constructor(readonly rootPath: string) {}
}

export type EndpointFunc<S, R> = (support: S, config: RouteConfig) => R
export type ResourceFunc = EndpointFunc<ResourceSupport, Resource>
export type ActionFunc = EndpointFunc<ActionSupport, MultiOptionAdapter>
