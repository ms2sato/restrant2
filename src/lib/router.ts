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

export type ConstructActionDescriptor = {
  schema?: z.AnyZodObject
  sources?: readonly ConstructSource[]
}

export type ConstructOption = {
  [key: string]: ConstructActionDescriptor
}

export type RouteOption = {
  name: string
  construct?: ConstructOption
  actions?: readonly ActionDescriptor[]
}

export interface Router {
  sub(...args: any[]): Router
  resources(path: string, options: RouteOption): Promise<void>
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

export type Handler = (req: express.Request, res: express.Response) => void

export type PostHandler = {
  success: (output: any, req: express.Request, res: express.Response) => Promise<void>
  invalid?: (err: ValidationError, req: express.Request, res: express.Response) => Promise<void>
  fatal?: (err: Error, req: express.Request, res: express.Response) => Promise<void>
}

export type Handlers = {
  [key: string]: Handler | PostHandler
}

export class RouterError extends Error {}

export type CreateResourceMethodArguments = {
  (req: express.Request, res: express.Response, httpPath: string, ad: ActionDescriptor): any[]
}

export type ServerRouterOption = {
  inputKey: string
  errorKey: string
  actions: readonly ActionDescriptor[]
  inputArranger: InputArranger
  createResourceMethodOptions: CreateResourceMethodArguments
  actionRoot: string
  handlersFileName: string
  resourceRoot: string
  resourceFileName: string
}

export type InputArranger = (
  input: Record<string, any>,
  schema: z.ZodObject<any>,
  req: express.Request,
  res: express.Response
) => Record<string, any>

export class ActionSupport {
  constructor(readonly rootPath: string, readonly routerOption: ServerRouterOption) {}

  input(req: express.Request): any {
    return (req as any)[this.routerOption.inputKey]
  }

  error(req: express.Request): ValidationError {
    return (req as any)[this.routerOption.errorKey]
  }
}

export class ResourceSupport {
  constructor(readonly rootPath: string, readonly routerOption: ServerRouterOption) {}
}

export function defineResource(callback: (support: ResourceSupport, options: RouteOption) => Record<string, Function>) {
  return callback
}

export function defineHandlers(callback: (support: ActionSupport, options: RouteOption) => Handlers) {
  return callback
}
