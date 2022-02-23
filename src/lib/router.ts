import express from 'express'
import path from 'path'
import { z } from 'zod'
import debug from 'debug'

const log = debug('restrant2')
const routeLog = log.extend('route')

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
  const update:ActionDescriptor = { action: 'update', path: '/:id', method: 'patch' } as const
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

export type ValidationError = z.ZodError

export type Handler = (req: express.Request, res: express.Response) => void

export type PostHandler = {
  success: (output: any, req: express.Request, res: express.Response) => Promise<void>,
  invalid: (err: ValidationError, req: express.Request, res: express.Response) => Promise<void>,
  fatal?:  (err: Error, req: express.Request, res: express.Response) => Promise<void>,
}

export type Handlers = {
  [key:string]: Handler|PostHandler
}


type InputArranger = (input: Record<string, any>, schema: z.ZodObject<any>, req: express.Request, res: express.Response) => Record<string, any>

type ServerRouterOption = {
  inputKey: string;
  errorKey: string;
  actions: readonly ActionDescriptor[];
  inputArranger: InputArranger;
  actionPath: string;
  resourcePath: string;
}

const mergeSource = (req: express.Request, sources: readonly string[]): Record<string, any> => {
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
    const body = routerOption.inputArranger(mergeSource(req, sources), schema, req, res)
    try {
      const input = schema.parse(body);
      (req as any)[routerOption.inputKey] = input
      next()
    } catch(err) {
      if(err instanceof z.ZodError) {
        (req as any)[routerOption.errorKey] = err
        next()
      } else {
        next(err)
      }
    }
  }
}

export class ServerRouter implements Router {
  constructor(
    readonly router: express.Router, 
    readonly rootPath: string,
    readonly routerOption: ServerRouterOption = {
      inputKey: 'input', 
      errorKey: 'validationError', 
      actions: Actions.standard(),
      inputArranger: smartInputArranger,
      actionPath: './actions',
      resourcePath: './resources'
    }
  ) { }

  async resources(rpath: string, option: RouteOption) {
    const setupDynamic = async(modulePath:string, support: any, option: RouteOption) => {
      const ret = await import(path.join(this.rootPath, modulePath))
      return await ret.default(support, option)
    }
  
    const resourcePath = path.join(this.routerOption.resourcePath, rpath)
    const resource = await setupDynamic(
      resourcePath, new ResourceSupport(this.rootPath, this.routerOption), option
    )

    const actionPath = path.join(this.routerOption.actionPath, rpath)
    const handlers: Handlers = await setupDynamic(
      actionPath, new ActionSupport(this.rootPath, this.routerOption), option
    )

    const actionDescriptors: readonly ActionDescriptor[] = option.actions || this.routerOption.actions

    for(const ad of actionDescriptors) {
      const actionName = ad.action

      const resourceMethod:Function|undefined = resource[actionName]
      const actionFunc: Handler|PostHandler|undefined = handlers[actionName]

      if(!(actionFunc instanceof Function) && resourceMethod === undefined) {
        throw new Error(`Handler not found! define ${resourcePath}#${actionName} or/and ${actionPath}#${actionName}`)
      }

      const cad:ConstructActionDescriptor|undefined = option.construct[actionName]
      const defaultSources = defaultConstructSources[actionName] || ['params']

      const handler: express.Handler = async (req, res, next) => {
        if(actionFunc instanceof Function) {
          try {
            await actionFunc(req, res)
          } catch(err) {
            next(err)
          }
          return
        }

        try {
          const validationError = (req as any).validationError
          if(validationError) { 
            if(actionFunc) {
              res.status(422)
              await actionFunc.invalid(validationError, req, res)
            } else {
              res.status(422)
              res.json({ status: 'error', errors: validationError.errors, message: validationError.message } )        
            }
            return
          }
          
          const input = (req as any).input || mergeSource(req, defaultSources)
          const output = await resourceMethod!.call(resource, input)
          if(actionFunc) {
            await actionFunc.success(output, req, res)
          } else {
            res.json({ status: 'success', data: output })
          }
        } catch (err) {
          if(!actionFunc.fatal) { 
            return next(err)
          }

          try {
            await actionFunc.fatal(err as Error, req, res)
          } catch (er) {
            next(er)
          }
        }
      }

      let params
      const urlPath = path.join(rpath, ad.path)
      if(cad && cad.schema) {
        params = [
          constructMiddleware(
            cad.schema, 
            cad.sources || defaultSources, 
            this.routerOption
          ), 
          handler
        ]
      } else {
        params = [handler]
      }
      
      routeLog('%s\t%s\t%s', ad.method, urlPath, actionName);

      (this.router as any)[ad.method].apply(this.router, [urlPath, ...params])
    }
  }
}

export class ActionSupport {
  constructor(readonly rootPath:string, readonly routerOption:ServerRouterOption) {
  }

  input(req: express.Request): any {
    return (req as any)[this.routerOption.inputKey]
  }
  
  error(req: express.Request): ValidationError {
    return (req as any)[this.routerOption.errorKey]
  }  
}

export class ResourceSupport {
  constructor(readonly rootPath:string, readonly routerOption:ServerRouterOption) {
  }
}

export function defineResource(callback: (support: ResourceSupport, options: RouteOption) => Record<string, Function>) {
  return callback
}

export function defineActions(callback: (support: ActionSupport, options: RouteOption) => Handlers) {
  return callback
}
