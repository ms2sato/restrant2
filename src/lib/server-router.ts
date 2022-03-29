import express from 'express'
import path from 'path'
import { z } from 'zod'
import debug from 'debug'
import {
  ActionContext,
  ActionDescriptor,
  Actions,
  ActionSupport,
  ConstructConfig,
  ConstructDescriptor,
  CreateOptionsFunction,
  Handler,
  MultiOptionAdapter,
  InputArranger,
  MultiOptionResponder,
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

export const idNumberSchema = z.object({
  id: z.number(),
})
export type IdNumberParams = z.infer<typeof idNumberSchema>

export const uploadedFileSchema = z.object({
  name: z.string(),
  mv: z.function().args(z.string()).returns(z.promise(z.void())),
  mimetype: z.string(),
  data: z.any(),
  tempFilePath: z.string(),
  truncated: z.boolean(),
  size: z.number(),
  md5: z.string(),
})

export type UploadedFileParams = z.infer<typeof uploadedFileSchema>

function defaultConstructConfig(idSchema: z.AnyZodObject = idNumberSchema): ConstructConfig {
  return {
    build: { schema: blankSchema, sources: ['params'] },
    edit: { schema: idSchema, sources: ['params'] },
    show: { schema: idSchema, sources: ['params'] },
    index: { schema: blankSchema, sources: ['params'] },
    create: { sources: ['body', 'files', 'params'] },
    update: { sources: ['body', 'files', 'params'] },
    destroy: { schema: idSchema, sources: ['params'] },
  }
}

const mergeSources = (req: express.Request, sources: readonly string[]): Record<string, any> => {
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
    const source = routerOption.inputArranger(mergeSources(req, sources), schema, req, res)
    ;(req as any)[routerOption.sourceKey] = source

    try {
      const input = schema.parse(source)
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

export function defaultServerRouterConfig(): ServerRouterConfig {
  return {
    inputKey: 'input',
    errorKey: 'validationError',
    sourceKey: 'inputSource',
    actions: Actions.standard(),
    inputArranger: smartInputArranger,
    createOptions: createNullOptions,
    constructConfig: defaultConstructConfig(),
    adapterRoot: './endpoint',
    adapterFileName: 'adapter',
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
    return path.join(this.routerConfig.adapterRoot, this.getHttpPath(rpath), this.routerConfig.adapterFileName)
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

    const adapterPath = this.getHandlersPath(rpath)
    const adapter: MultiOptionAdapter = await importAndSetup(
      this.fileRoot,
      adapterPath,
      new ActionSupport(this.fileRoot, this.routerConfig),
      config
    )

    const actionDescriptors: readonly ActionDescriptor[] = config.actions || this.routerConfig.actions

    for (const ad of actionDescriptors) {
      const actionName = ad.action

      const resourceMethod: Function | undefined = resource[actionName]
      const actionFunc: Handler | MultiOptionResponder | undefined = adapter[actionName]
      const constructDescriptor: ConstructDescriptor | undefined = config.construct?.[actionName]

      const actionOverride = actionFunc instanceof Function
      if (!actionOverride) {
        if (resourceMethod === undefined) {
          throw new RouterError(
            `Handler not found! define ${resourcePath}#${actionName} or/and ${adapterPath}#${actionName}`
          )
        }
      }

      if (actionOverride && resourceMethod) {
        routeLog.extend('warn')(
          `${resourcePath}#${actionName} is defined but will not be called auto. PostHandler support auto call`
        )
      }

      const defaultConstructDescriptor: ConstructDescriptor | undefined = this.routerConfig.constructConfig[actionName]
      let schema: z.AnyZodObject | null = null
      if (resourceMethod) {
        if (constructDescriptor?.schema === undefined) {
          if (!defaultConstructDescriptor?.schema) {
            throw new Error(`construct.${actionName}.schema not found in routes for ${resourcePath}#${actionName}`)
          }
          schema = defaultConstructDescriptor.schema
        } else if (constructDescriptor.schema === null) {
          schema = blankSchema
        } else {
          schema = constructDescriptor.schema
        }
      }

      const defaultSources = defaultConstructDescriptor?.sources || ['params']

      const handler: express.Handler = async (req, res, next) => {
        const ctx = new ActionContext(req, res)

        if (actionFunc instanceof Function) {
          try {
            handlerLog('%s#%s as Handler', adapterPath, actionName)
            await actionFunc(ctx)
          } catch (err) {
            next(err)
          }
          return
        }

        const options = await this.routerConfig.createOptions(req, res, this.getHttpPath(rpath), ad)

        try {
          const validationError = (req as any)[this.routerConfig.errorKey]
          if (validationError) {
            handlerLog.extend('debug')('%s#%s validationError %s', adapterPath, actionName, validationError.message)
            if (actionFunc) {
              if (actionFunc.invalid) {
                handlerLog('%s#%s.invalid', adapterPath, actionName)
                const source = (req as any)[this.routerConfig.sourceKey]
                res.status(422)
                await actionFunc.invalid.apply(adapter, [ctx, validationError, source, ...options])
              } else {
                next(validationError)
              }
            } else {
              handlerLog('%s#%s invalid as json', adapterPath, actionName)
              res.status(422)
              res.json({
                status: 'error',
                errors: validationError.errors,
                message: validationError.message,
              })
            }
            return
          }

          const input = (req as any)[this.routerConfig.inputKey]
          const args = input ? [input, ...options] : options
          handlerLog('resourceMethod args: %o', args)
          const output = await resourceMethod!.apply(resource, args)

          if (actionFunc) {
            handlerLog('%s#%s.success', adapterPath, actionName)
            await actionFunc.success.apply(adapter, [ctx, output, ...options])
          } else {
            handlerLog('%s#%s success as json', adapterPath, actionName)
            res.json({ status: 'success', data: output })
          }
        } catch (err) {
          if (!actionFunc?.fatal) {
            return next(err)
          }

          try {
            handlerLog('%s#%s.fatal', adapterPath, actionName)
            await actionFunc.fatal.apply(adapter, [ctx, err as Error, ...options])
          } catch (er) {
            next(er)
          }
        }
      }

      let params
      const urlPath = path.join(rpath, ad.path)
      handlerLog(
        '%s#%s ConstructActionDescriptor: %s',
        adapterPath,
        actionName,
        constructDescriptor?.schema?.constructor.name
      )
      if (resourceMethod) {
        handlerLog('%s#%s with construct middleware', adapterPath, actionName)
        params = [
          constructMiddleware(schema!, constructDescriptor?.sources || defaultSources, this.routerConfig),
          handler,
        ]
      } else {
        handlerLog('%s#%s without construct middleware', adapterPath, actionName)
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
      const cad: ConstructDescriptor | undefined = config.construct?.[actionName]
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
