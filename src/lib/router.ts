import express from 'express'
import path from 'path'
import { z, ZodError } from 'zod'
import { Handlers, Handler } from './servers'

export type ConstructSource = 'body'|'query'|'params'

export type ActionDescriptor = {
  action: string,
  path: string,
  method: "get"|"post"|"put"|"patch"|"delete",
}

export type ConstructActionDescriptor = {
  schema?: z.ZodObject<any>,
  sources?: readonly ConstructSource[]
}

export type ConstructOption = {
  [key: string]: ConstructActionDescriptor
}

export type RouteOption = {
  name: string,
  construct: ConstructOption
  actions?: ActionDescriptor[]
}

export interface Router {
  resources(path: string, options: RouteOption): void;
}

const defaultConstructSources:Record<string, ReadonlyArray<ConstructSource>> = {
  build: ['params'],
  edit: ['params'],
  show: ['params'],
  index: ['params'],
  create: ['body', 'params'],
  update: ['body', 'params'],
  destroy: ['params'],
}

export namespace Actions {
  const build:ActionDescriptor = { action: 'build', path: '/:id/build', method: 'get' } as const
  const edit:ActionDescriptor = { action: 'edit', path: '/:id/edit', method: 'get' } as const
  const show:ActionDescriptor = { action: 'show', path: '/:id', method: 'get' } as const
  const index:ActionDescriptor = { action: 'index', path: '/', method: 'get' } as const
  const create:ActionDescriptor = { action: 'create', path: '/', method: 'post' } as const
  const update:ActionDescriptor = { action: 'update', path: '/:id', method: 'put' } as const
  const destroy:ActionDescriptor = { action: 'destroy', path: '/:id', method: 'delete' } as const

  const all: ReadonlyArray<ActionDescriptor> = [
    build, edit, show, index, create, update, destroy
  ]

  export type Option = {
    only: string[]
  }

  export function standard(option?: Option): ReadonlyArray<ActionDescriptor> {
    if(!option) { return all }

    const only = option.only
    // TODO: throw error when actions list is notfound in starndard
    return all.filter(ad => only.includes(ad.action))
  }

  export function api(option?: Option): ReadonlyArray<ActionDescriptor> {
    const actions = [show, index, create, update, destroy]
    if(!option) { return actions }

    const only = option.only
    // TODO: throw error when actions list is notfound in starndard
    return actions.filter(ad => only.includes(ad.action))
  }

  export function only(actions: string[]):ActionDescriptor[] {
    // TODO: throw error when actions list is notfound in starndard
    return standard().filter(ad => actions.includes(ad.action))
  }
}

type InputArranger = (input: Record<string, any>, schema: z.ZodObject<any>, req: express.Request, res: express.Response) => Record<string, any>

type ServerRouterOption = {
  inputKey: string;
  errorKey: string;
  actions: readonly ActionDescriptor[];
  inputArranger: InputArranger;
}

const merger = (req: express.Request, sources: readonly string[]): Record<string, any> => {
  let merged = {}
  const record = req as Record<string, any>
  for(const source of sources) {
    merged = { ...merged, ...record[source] }
  }
  return merged
}

const smartInputArranger:InputArranger = (input: Record<string, any>, schema: z.ZodObject<any>, req: express.Request, res: express.Response) => {
  for(const [key, val] of Object.entries(input)) {
    // TODO: for other type
    if(schema.shape[key] instanceof z.ZodNumber) {
      input[key] = Number(val)
    }
  }
  return input
}

const constructMiddleware = (schema: z.ZodObject<any>, sources: readonly string[], routerOption: ServerRouterOption) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const body = routerOption.inputArranger(merger(req, sources), schema, req, res)
    try {
      const input = schema.parse(body);
      (req as any)[routerOption.inputKey] = input
      next()
    } catch(err) {
      if(err instanceof ZodError) {
        (req as any)[routerOption.errorKey] = err
        next()
      } else {
        next(err)
      }
    }
  }
}

const errorHandleMiddleware = (actionFunc:Handler) => { 
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      await actionFunc(req, res)
    } catch(err) {
      next(err)
    }
  }
}

export class ServerRouter implements Router {
  constructor(
    readonly router: express.Router, 
    readonly rootPath: string,
    private routerOption: ServerRouterOption = {
      inputKey: 'input', 
      errorKey: 'validationError', 
      actions: Actions.standard(),
      inputArranger: smartInputArranger
    }
  ) { }

  async resources(rpath: string, option: RouteOption) {
    const fullPath = path.join(this.actionRoot(), rpath)
    const { setup } = await import(fullPath)
    const handlers: Handlers = await setup(option)

    const actionDescriptors: readonly ActionDescriptor[] = option.actions || this.routerOption.actions

    for(const actionName in handlers) {
      const ad: ActionDescriptor|undefined = actionDescriptors.find(ad => ad.action === actionName)
      if(ad === undefined) {
        throw new Error(`${fullPath}: "${actionName}" is not defined on router`)
      }

      const actionFunc:Handler = handlers[actionName]
      if(!actionFunc) {
        throw new Error(`${fullPath}: "${actionName}" not found`)
      }

      const cad = option.construct[actionName]
      let params
      if(cad && cad.schema) {
        params = [
          path.join(rpath, ad.path), 
          constructMiddleware(
            cad.schema, 
            cad.sources || defaultConstructSources[actionName] || ['params'], 
            this.routerOption
          ), 
          errorHandleMiddleware(actionFunc)
        ]
      } else {
        params = [path.join(rpath, ad.path), errorHandleMiddleware(actionFunc)]
      }

      (this.router as any)[ad.method].apply(this.router, params)
    }
  }

  actionRoot(): string {
    return path.join(this.rootPath, './actions')
  }
}
