import express from 'express'
import path from 'path'
import { z } from 'zod'
import debug from 'debug'
import {
  ActionContext,
  ActionDescriptor,
  Actions,
  ActionSupport,
  ConstructActionDescriptor,
  ConstructSource,
  CreateOptionsFunction,
  Handler,
  Handlers,
  InputArranger,
  PostHandler,
  ResourceSupport,
  RouteConfig,
  Router,
  RouterError,
  ServerRouterConfig,
} from './router'

const log = debug('restrant2')
const routeLog = log.extend('route')
const handlerLog = log.extend('handler')

export const blankSchema = z.object({})
export type BlankParams = z.infer<typeof blankSchema>

const defaultConstructSources: Record<string, readonly ConstructSource[]> = {
  build: ['params'],
  edit: ['params'],
  show: ['params'],
  index: ['params'],
  create: ['body', 'files', 'params'],
  update: ['body', 'files', 'params'],
  destroy: ['params'],
}

const mergeSource = (req: express.Request, sources: readonly string[]): Record<string, any> => {
  let merged = {}
  const record = req as Record<string, any>
  for (const source of sources) {
    merged = { ...merged, ...record[source] }
  }
  return merged
}

const smartInputArranger: InputArranger = (
  input: Record<string, any>,
  schema: z.ZodObject<any>,
  req: express.Request,
  res: express.Response
) => {
  for (const [key, val] of Object.entries(input)) {
    // TODO: for other type
    if (schema.shape[key] instanceof z.ZodNumber) {
      input[key] = Number(val)
    }
  }
  return input
}

const constructMiddleware = (
  schema: z.ZodObject<any>,
  sources: readonly string[],
  routerOption: ServerRouterConfig
) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const body = routerOption.inputArranger(mergeSource(req, sources), schema, req, res)
    try {
      const input = schema.parse(body)
      routeLog('input', input)
      ;(req as any)[routerOption.inputKey] = input
      next()
    } catch (err) {
      if (err instanceof z.ZodError) {
        ;(req as any)[routerOption.errorKey] = err
        next()
      } else {
        next(err)
      }
    }
  }
}

const createNullOptions: CreateOptionsFunction = async (req, res, httpPath, ad) => {
  return []
}

export const importAndSetup = async (
  fileRoot: string,
  modulePath: string,
  support: ResourceSupport | ActionSupport,
  config: RouteConfig
) => {
  let ret
  const fullPath = path.join(fileRoot, modulePath)
  try {
    ret = await import(fullPath)
  } catch (err) {
    const error = err as any
    if (error.code === 'MODULE_NOT_FOUND') {
      routeLog.extend('debug')('%s not found', fullPath)
      return {}
    } else {
      throw err
    }
  }

  try {
    return await ret.default(support, config)
  } catch (err) {
    if (err instanceof Error) {
      // for Error 2nd argument type
      // @ts-ignore
      throw new RouterError(`Error occured "${err.message}" on calling default function in "${modulePath}"`, {
        cause: err,
      })
    } else {
      throw new TypeError(`Unexpected Error Object: ${err}`)
    }
  }
}

function defaultServerRouterConfig(): ServerRouterConfig {
  return {
    inputKey: 'input',
    errorKey: 'validationError',
    actions: Actions.standard(),
    inputArranger: smartInputArranger,
    createOptions: createNullOptions,
    actionRoot: './endpoint',
    handlersFileName: 'handlers',
    resourceRoot: './endpoint',
    resourceFileName: 'resource',
  }
}

export abstract class BasicRouter implements Router {
  protected readonly routerConfig: ServerRouterConfig

  constructor(
    readonly fileRoot: string,
    readonly httpPath: string = '/',
    routerConfig: Partial<ServerRouterConfig> = {}
  ) {
    this.routerConfig = Object.assign(defaultServerRouterConfig(), routerConfig)
  }

  abstract sub(...args: any[]): Router
  abstract resources(rpath: string, config: RouteConfig): Promise<void>

  protected getHttpPath(rpath: string) {
    return path.join(this.httpPath, rpath)
  }

  protected getResourcePath(rpath: string) {
    return path.join(this.routerConfig.resourceRoot, this.getHttpPath(rpath), this.routerConfig.resourceFileName)
  }

  protected getHandlersPath(rpath: string) {
    return path.join(this.routerConfig.actionRoot, this.getHttpPath(rpath), this.routerConfig.handlersFileName)
  }
}

export class ServerRouter extends BasicRouter {
  readonly router: express.Router

  constructor(fileRoot: string, httpPath: string = '/', routerOption: Partial<ServerRouterConfig> = {}) {
    super(fileRoot, httpPath, routerOption)
    this.router = express.Router({ mergeParams: true })
  }

  sub(...args: any[]) {
    const subRouter = new ServerRouter(this.fileRoot, path.join(this.httpPath, args[0]), this.routerConfig)
    ;(this.router as any).use.apply(this.router, [...args, subRouter.router])
    return subRouter
  }

  async resources(rpath: string, config: RouteConfig) {
    const resourcePath = this.getResourcePath(rpath)
    const resource = await importAndSetup(
      this.fileRoot,
      resourcePath,
      new ResourceSupport(this.fileRoot, this.routerConfig),
      config
    )

    const handlersPath = this.getHandlersPath(rpath)
    const handlers: Handlers = await importAndSetup(
      this.fileRoot,
      handlersPath,
      new ActionSupport(this.fileRoot, this.routerConfig),
      config
    )

    const actionDescriptors: readonly ActionDescriptor[] = config.actions || this.routerConfig.actions

    for (const ad of actionDescriptors) {
      const actionName = ad.action

      const resourceMethod: Function | undefined = resource[actionName]
      const actionFunc: Handler | PostHandler | undefined = handlers[actionName]
      const cad: ConstructActionDescriptor | undefined = config.construct?.[actionName]

      const actionOverride = actionFunc instanceof Function
      if (!actionOverride) {
        if (resourceMethod === undefined) {
          throw new RouterError(
            `Handler not found! define ${resourcePath}#${actionName} or/and ${handlersPath}#${actionName}`
          )
        }
      }

      if (actionOverride && resourceMethod) {
        routeLog.extend('warn')(
          `${resourcePath}#${actionName} is defined but will not be called auto. PostHandler support auto call`
        )
      }

      const defaultSources = defaultConstructSources[actionName] || ['params']

      const handler: express.Handler = async (req, res, next) => {
        const ctx = new ActionContext(req, res)

        if (actionFunc instanceof Function) {
          try {
            handlerLog('%s#%s as Handler', handlersPath, actionName)
            await actionFunc(ctx)
          } catch (err) {
            next(err)
          }
          return
        }

        const options = await this.routerConfig.createOptions(req, res, this.getHttpPath(rpath), ad)

        try {
          const validationError = (req as any).validationError
          if (validationError) {
            handlerLog.extend('debug')('%s#%s validationError %s', handlersPath, actionName, validationError.message)
            if (actionFunc) {
              if (actionFunc.invalid) {
                handlerLog('%s#%s.invalid', handlersPath, actionName)
                res.status(422)
                await actionFunc.invalid.apply(handlers, [ctx, validationError, ...options])
              } else {
                next(validationError)
              }
            } else {
              handlerLog('%s#%s invalid as json', handlersPath, actionName)
              res.status(422)
              res.json({
                status: 'error',
                errors: validationError.errors,
                message: validationError.message,
              })
            }
            return
          }

          const input = (req as any).input
          const args = input ? [input, ...options] : options
          handlerLog('resourceMethod args: %o', args)
          const output = await resourceMethod!.apply(resource, args)

          if (actionFunc) {
            handlerLog('%s#%s.success', handlersPath, actionName)
            await actionFunc.success.apply(handlers, [ctx, output, ...options])
          } else {
            handlerLog('%s#%s success as json', handlersPath, actionName)
            res.json({ status: 'success', data: output })
          }
        } catch (err) {
          if (!actionFunc?.fatal) {
            return next(err)
          }

          try {
            handlerLog('%s#%s.fatal', handlersPath, actionName)
            await actionFunc.fatal.apply(handlers, [ctx, err as Error, ...options])
          } catch (er) {
            next(er)
          }
        }
      }

      let params
      const urlPath = path.join(rpath, ad.path)
      handlerLog('%s#%s ConstructActionDescriptor: %s', handlersPath, actionName, cad?.schema?.constructor.name)
      if (resourceMethod && cad?.schema) {
        handlerLog('%s#%s with construct middleware', handlersPath, actionName)
        params = [constructMiddleware(cad.schema, cad.sources || defaultSources, this.routerConfig), handler]
      } else {
        handlerLog('%s#%s without construct middleware', handlersPath, actionName)
        params = [handler]
      }

      routeLog(
        '%s %s\t%s\t{validate:%s, actionOverride:%s, resourceMethod:%s}',
        ad.method,
        path.join(this.httpPath, urlPath),
        actionName,
        params.length !== 1,
        actionOverride,
        !!resourceMethod
      )
      ;(this.router as any)[ad.method].apply(this.router, [urlPath, ...params])
    }
  }
}

export class ResourceHolderCreateRouter extends BasicRouter {
  constructor(
    private resourcesHolder: any,
    fileRoot: string,
    httpPath: string = '/',
    routerOption: Partial<ServerRouterConfig> = {}
  ) {
    super(fileRoot, httpPath, routerOption)
  }

  sub(...args: any[]) {
    return new ResourceHolderCreateRouter(
      this.resourcesHolder,
      this.fileRoot,
      path.join(this.httpPath, args[0]),
      this.routerConfig
    )
  }

  async resources(rpath: string, config: RouteConfig) {
    const resourcePath = this.getResourcePath(rpath)
    const resourceSupport = new ResourceSupport(this.fileRoot, this.routerConfig)
    const resource = await importAndSetup(this.fileRoot, resourcePath, resourceSupport, config)

    const resourceProxy: Record<string, Function> = {}
    for (let actionName in resource) {
      const resourceMethod = resource[actionName]
      const cad: ConstructActionDescriptor | undefined = config.construct?.[actionName]
      if (cad?.schema) {
        resourceProxy[actionName] = function () {
          const [input, ...options] = Array.from(arguments)
          return resourceMethod.apply(resource, cad.schema?.parse(input), options)
        }
      } else {
        resourceProxy[actionName] = function () {
          return resourceMethod.apply(resource, arguments)
        }
      }

      this.resourcesHolder[path.join(this.httpPath, rpath)] = resourceProxy
    }
  }
}
