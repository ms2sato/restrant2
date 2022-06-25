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
  ConstructSource,
  CreateActionOptionsFunction,
  Handler,
  InputArranger,
  Renderer,
  MultiOptionAdapter,
  MultiOptionResponder,
  ResourceSupport,
  RouteConfig,
  Router,
  RouterError,
  RequestCallback,
  parseFormBody,
  createZodTraverseArrangerCreator,
  SchemaUtil,
  Responder,
  HandlerBuildRunner,
  Resource,
  EndpointFunc,
  ValidationError,
  ResourceMethod,
  MutableActionContext,
  isImportError,
  NamedResources,
  choiceSchema,
  choiseSources,
} from '..'

const log = debug('restrant2')
const routeLog = log.extend('route')
const handlerLog = log.extend('handler')

export type ActionContextProps = {
  router: ServerRouter
  req: express.Request
  res: express.Response
  descriptor: ActionDescriptor
  httpPath: string
}

export type ActionContextCreator = (props: ActionContextProps) => MutableActionContext

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

export function arrangeFormInput(ctx: MutableActionContext, sources: readonly string[], schema: z.AnyZodObject) {
  return parseFormBody(ctx.mergeInputs(sources), createZodTraverseArrangerCreator(schema))
}

export function arrangeJsonInput(ctx: MutableActionContext, sources: readonly string[], schema: z.AnyZodObject) {
  const pred = (input: any, source: string) => {
    return source === 'body' ? input : SchemaUtil.deepCast(schema, input)
  }
  return ctx.mergeInputs(sources, pred)
}

export type ContentArranger = {
  (ctx: MutableActionContext, sources: readonly string[], schema: z.AnyZodObject): any
}

type ContentType2Arranger = Record<string, ContentArranger>

export const defaultContentType2Arranger: ContentType2Arranger = {
  'application/json': arrangeJsonInput,
  'application/x-www-form-urlencoded': arrangeFormInput,
  'multipart/form-data': arrangeFormInput,
  '': arrangeFormInput,
}

export const createSmartInputArranger = (contentType2Arranger: ContentType2Arranger = defaultContentType2Arranger) => {
  return (ctx: MutableActionContext, sources: readonly string[], schema: z.AnyZodObject) => {
    const requestedContentType = ctx.req.headers['content-type']
    if (requestedContentType) {
      for (const [contentType, contentArranger] of Object.entries<ContentArranger>(contentType2Arranger)) {
        if (contentType === '') continue
        if (requestedContentType.indexOf(contentType) >= 0) {
          return contentArranger(ctx, sources, schema)
        }
      }
    }
    return contentType2Arranger[''](ctx, sources, schema) // TODO: overwritable
  }
}

// FIXME: @see https://google.github.io/styleguide/jsoncstyleguide.xml
class StandardJsonResponder<Opt = undefined, Out = any, Src = any> implements Responder<Opt, Out, Src> {
  success(ctx: ActionContext, output: Out): void | Promise<void> {
    let data = output
    if ('ctx' in output) {
      data = { ...output }
      delete (data as any).ctx
    }

    ctx.res.json({ status: 'success', data })
  }

  invalid(ctx: ActionContext, validationError: ValidationError, source: Src): void | Promise<void> {
    ctx.res.status(422)
    ctx.res.json({
      status: 'error',
      errors: validationError.errors,
      message: validationError.message,
    })
  }

  fatal(ctx: ActionContext, err: Error): void | Promise<void> {
    // FIXME: dispatch Error class
    ctx.res.status(500)

    if (process.env.NODE_ENV === 'production') {
      ctx.res.json({
        status: 'fatal',
      })
    } else {
      throw err
    }
  }
}

type FatalHandler = (ctx: ActionContext, err: Error) => void

class SmartResponder<Opt = undefined, Out = any, Src = any> implements Responder<Opt, Out, Src> {
  constructor(
    private router: ServerRouter,
    private fatalHandler: FatalHandler,
    private jsonResonder = new StandardJsonResponder()
  ) {}

  success(ctx: ActionContext, output: Out): void | Promise<void> {
    if (ctx.willRespondJson()) {
      return this.jsonResonder.success(ctx, output)
    }

    if (this.router.serverRouterConfig.renderDefault(ctx, output) === false) {
      return this.jsonResonder.success(ctx, output)
    }
  }

  invalid(ctx: ActionContext, validationError: ValidationError, source: Src): void | Promise<void> {
    return this.jsonResonder.invalid(ctx, validationError, source)
  }

  fatal(ctx: ActionContext, err: Error): void | Promise<void> {
    console.error('fatal', err)
    if (ctx.willRespondJson()) {
      return this.jsonResonder.fatal(ctx, err)
    }

    this.fatalHandler(ctx, err)
  }
}

const createSmartResponder = ({ router }: ResourceMethodHandlerParams) => {
  return new SmartResponder(
    router,
    () => {
      throw new Error('Unimplemented Fatal Handler')
    },
    new StandardJsonResponder()
  )
}

const createResourceMethodHandler = (params: ResourceMethodHandlerParams): express.Handler => {
  const {
    resourceMethod,
    resource,
    sources,
    router,
    httpPath,
    schema,
    adapterPath,
    actionDescriptor,
    responder,
    adapter,
  } = params

  const serverRouterConfig = router.serverRouterConfig
  const defaultResponder = serverRouterConfig.createDefaultResponder(params)
  const actionName = actionDescriptor.action

  return (req, res, next) => {
    ;(async () => {
      const ctx = serverRouterConfig.createActionContext({ router, req, res, descriptor: actionDescriptor, httpPath })
      const options = await serverRouterConfig.createActionOptions(ctx, httpPath, actionDescriptor)

      const handleFatal = async (err: Error) => {
        if (responder && 'fatal' in responder) {
          try {
            handlerLog('%s#%s.fatal', adapterPath, actionName)
            await responder.fatal?.apply(adapter, [ctx, err, ...options])
          } catch (er) {
            console.log('Unexpected Error on responder.fatal, dispatch to default responder', er)
            await defaultResponder.fatal(ctx, err)
          }
        } else {
          return next(err)
        }
      }

      try {
        let source = serverRouterConfig.inputArranger(ctx, sources, schema)
        handlerLog('source: %o', source)

        try {
          if (responder && 'beforeValidation' in responder) {
            source = await responder.beforeValidation?.(ctx, source, schema)
          }

          let input = schema.parse(source)
          if (responder && 'afterValidation' in responder) {
            input = (await responder.afterValidation?.(ctx, input, schema)) as { [x: string]: any }
          }

          handlerLog('input', input)
          const args = input ? [input, ...options] : options
          handlerLog('resourceMethod args: %o', args)
          const output = await resourceMethod.apply(resource, args)

          if (responder && 'success' in responder) {
            handlerLog('%s#%s.success', adapterPath, actionName)
            const ret = await responder.success?.apply(adapter, [ctx, output, ...options])
            if (ret === false) {
              handlerLog(' dispatch to default responder')
              defaultResponder.success(ctx, output)
            } else if (ret !== undefined) {
              handlerLog(' dispatch to default responder for ret value')
              defaultResponder.success(ctx, ret)
            }
          } else {
            handlerLog('%s#%s success by default responder', adapterPath, actionName)
            defaultResponder.success(ctx, output)
          }
        } catch (err) {
          if (err instanceof z.ZodError) {
            const validationError = err
            handlerLog.extend('debug')('%s#%s validationError %s', adapterPath, actionName, validationError.message)
            if (responder) {
              if ('invalid' in responder) {
                const filledSource = SchemaUtil.fillDefault(schema, source)
                handlerLog('%s#%s.invalid', adapterPath, actionName, filledSource)
                res.status(422)
                await responder.invalid!.apply(adapter, [ctx, validationError, filledSource, ...options])
              } else {
                next(validationError)
              }
            } else {
              handlerLog('%s#%s invalid by default responder', adapterPath, actionName)
              defaultResponder.invalid(ctx, validationError, source)
            }
          } else {
            handleFatal(err as Error)
          }
        }
      } catch (err) {
        return handleFatal(err as Error)
      }
    })().catch((err) => {
      next(err)
    })
  }
}

export const createNullActionOptions: CreateActionOptionsFunction = async (ctx, httpPath, ad) => {
  return []
}

export function renderDefault(ctx: ActionContext, options: any = undefined) {
  if (!ctx.descriptor.page) {
    return false
  }

  ctx.render(ctx.httpFilePath.replace(/^\//, ''), options)
}

export const importAndSetup = async <S, R>(
  fileRoot: string,
  modulePath: string,
  support: S,
  config: RouteConfig
): Promise<R> => {
  let ret: { default: EndpointFunc<S, R> }
  const fullPath = path.join(fileRoot, modulePath)
  try {
    ret = (await import(fullPath)) as { default: EndpointFunc<S, R> }
  } catch (err) {
    if (isImportError(err) && err.code === 'MODULE_NOT_FOUND') {
      routeLog.extend('debug')('%s not found', fullPath)
      return {} as R
    } else {
      throw err
    }
  }

  try {
    return ret.default(support, config)
  } catch (err) {
    if (err instanceof Error) {
      throw new RouterError(`Error occured "${err.message}" on calling default function in "${modulePath}"`, {
        cause: err,
      })
    } else {
      throw new TypeError(`Unexpected Error Object: ${err as string}`)
    }
  }
}

export const createDefaultActionContext: ActionContextCreator = ({ router, req, res, descriptor, httpPath }) => {
  return new ActionContextImpl(router, req, res, descriptor, httpPath)
}

export class ActionContextImpl implements MutableActionContext {
  render
  redirect
  private _input: any

  constructor(
    private router: ServerRouter,
    readonly req: express.Request,
    readonly res: express.Response,
    readonly descriptor: ActionDescriptor,
    readonly httpPath: string
  ) {
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

  get input() {
    return this._input
  }
  get format() {
    return this.req.params.format
  }
  get httpFilePath() {
    return `${this.httpPath}/${this.descriptor.action}`
  }

  resources(): NamedResources {
    return this.router.namedResources()
  }

  willRespondJson() {
    const contentType = this.req.headers['content-type']
    return this.format === 'json' || (contentType !== undefined && contentType.indexOf('application/json') >= 0)
  }

  mergeInputs(sources: readonly string[], pred: (input: any, source: string) => any = (input) => input) {
    const request = this.req as Record<string, any>
    const input = sources.reduce((prev, source) => {
      if (request[source] === undefined) {
        return prev
      }

      return { ...prev, ...pred(request[source], source) }
    }, {})

    this._input = input
    return input
  }
}

export function defaultServerRouterConfig(): ServerRouterConfig {
  return {
    actions: Actions.standard(),
    inputArranger: createSmartInputArranger(),
    createActionOptions: createNullActionOptions,
    createActionContext: createDefaultActionContext,
    constructConfig: Actions.defaultConstructConfig(),
    createDefaultResponder: createSmartResponder,
    renderDefault: renderDefault,
    adapterRoot: './endpoint',
    adapterFileName: 'adapter',
    resourceRoot: './endpoint',
    resourceFileName: 'resource',
  }
}

export type RouterCore = {
  handlerBuildRunners: HandlerBuildRunner[]
  nameToResource: Map<string, Resource>
}

export abstract class BasicRouter implements Router {
  readonly serverRouterConfig: ServerRouterConfig

  constructor(
    readonly fileRoot: string,
    serverRouterConfig: Partial<ServerRouterConfig> = {},
    readonly httpPath: string = '/',
    protected readonly routerCore: RouterCore = { handlerBuildRunners: [], nameToResource: new Map() }
  ) {
    this.serverRouterConfig = Object.assign(defaultServerRouterConfig(), serverRouterConfig)
  }

  abstract sub(...args: any[]): Router
  protected abstract createHandlerBuildRunner(rpath: string, routeConfig: RouteConfig): HandlerBuildRunner

  resources(rpath: string, config: RouteConfig): void {
    this.routerCore.handlerBuildRunners.push(this.createHandlerBuildRunner(rpath, config))
  }

  async build() {
    for (const requestHandlerSources of this.routerCore.handlerBuildRunners) {
      await requestHandlerSources()
    }
  }

  protected getHttpPath(rpath: string) {
    return path.join(this.httpPath, rpath)
  }

  protected getResourcePath(rpath: string) {
    return path.join(
      this.serverRouterConfig.resourceRoot,
      this.getHttpPath(rpath),
      this.serverRouterConfig.resourceFileName
    )
  }

  protected getAdapterPath(rpath: string) {
    return path.join(
      this.serverRouterConfig.adapterRoot,
      this.getHttpPath(rpath),
      this.serverRouterConfig.adapterFileName
    )
  }
}

const createLocalResourceProxy = (config: RouteConfig, resource: Resource): Resource => {
  const resourceProxy: Resource = {}
  for (const actionName in resource) {
    const resourceMethod = resource[actionName]
    const cad: ConstructDescriptor | undefined = config.construct?.[actionName]
    if (cad?.schema) {
      const schema = cad.schema
      resourceProxy[actionName] = function (input, ...options) {
        const parsedInput = schema.parse(input)
        if (parsedInput === undefined) {
          throw new Error('UnexpectedInput')
        }
        return resourceMethod.apply(resource, [parsedInput, ...options])
      }
    } else {
      resourceProxy[actionName] = function (...args) {
        return resourceMethod.apply(resource, args)
      }
    }
  }

  return resourceProxy
}

export class ServerRouter extends BasicRouter {
  readonly router: express.Router

  constructor(
    fileRoot: string,
    serverRouterConfig: Partial<ServerRouterConfig> = {},
    httpPath = '/',
    readonly routerCore: RouterCore = { handlerBuildRunners: [], nameToResource: new Map() }
  ) {
    super(fileRoot, serverRouterConfig, httpPath, routerCore)
    this.router = express.Router({ mergeParams: true })
  }

  sub(rpath: string, ...args: unknown[]) {
    // TODO: impl class SubServerRouter without build
    const subRouter = new ServerRouter(
      this.fileRoot,
      this.serverRouterConfig,
      path.join(this.httpPath, rpath),
      this.routerCore
    )
    ;(this.router as any).use.apply(this.router, [rpath, ...args, subRouter.router])
    return subRouter
  }

  namedResources(): NamedResources {
    return Object.fromEntries(this.routerCore.nameToResource)
  }

  protected createHandlerBuildRunner(rpath: string, routeConfig: RouteConfig): HandlerBuildRunner {
    return async () => {
      handlerLog('buildHandler: %s', path.join(this.httpPath, rpath))

      const resourcePath = this.getResourcePath(rpath)
      const resource = await importAndSetup<ResourceSupport, Resource>(
        this.fileRoot,
        resourcePath,
        new ResourceSupport(this.fileRoot),
        routeConfig
      )

      const resourceName = routeConfig.name
      if (this.routerCore.nameToResource.get(resourceName)) {
        throw new Error(`Duplicated Resource Name: ${resourceName}`)
      }
      this.routerCore.nameToResource.set(resourceName, createLocalResourceProxy(routeConfig, resource))

      const adapterPath = this.getAdapterPath(rpath)
      const adapter: MultiOptionAdapter = await importAndSetup<ActionSupport, MultiOptionAdapter>(
        this.fileRoot,
        adapterPath,
        new ActionSupport(this.fileRoot),
        routeConfig
      )

      const actionDescriptors: readonly ActionDescriptor[] = routeConfig.actions || this.serverRouterConfig.actions

      for (const actionDescriptor of actionDescriptors) {
        const actionName = actionDescriptor.action
        const resourceHttpPath = this.getHttpPath(rpath)

        const resourceMethod: ResourceMethod | undefined = resource[actionName]
        const actionFunc: Handler | MultiOptionResponder | RequestCallback | undefined = adapter[actionName]
        const constructDescriptor: ConstructDescriptor | undefined = routeConfig.construct?.[actionName]

        const actionOverride = actionFunc instanceof Function
        if (!actionOverride) {
          if (resourceMethod === undefined && !actionDescriptor.page) {
            throw new RouterError(
              `Logic not found! define action.page option on routes, or define ${resourcePath}#${actionName} or/and ${adapterPath}#${actionName}`
            )
          }
        }

        if (actionOverride && resourceMethod !== undefined) {
          routeLog.extend('warn')(
            `${resourcePath}#${actionName} is defined but will not be called auto. Responder support auto call; proposal: 'Remove ${resourcePath}#${actionName}' or 'Change to Responder(not Function) ${adapterPath}/#${actionName}' or 'Remove ${adapterPath}/#${actionName}'`
          )
        }

        const schema: z.AnyZodObject | undefined =
          resourceMethod === undefined
            ? undefined
            : choiceSchema(this.serverRouterConfig.constructConfig, constructDescriptor, actionName)

        let params
        if (actionOverride) {
          handlerLog('%s#%s without construct middleware', adapterPath, actionName)
          const handler: express.Handler = async (req, res, next) => {
            const ctx = this.serverRouterConfig.createActionContext({
              router: this,
              req,
              res,
              descriptor: actionDescriptor,
              httpPath: resourceHttpPath,
            })
            try {
              handlerLog('%s#%s as Handler', adapterPath, actionName)
              await actionFunc(ctx)
            } catch (err) {
              next(err)
            }
          }

          params = [handler]
        } else {
          if (!resourceMethod) {
            if (!actionDescriptor.page) {
              throw new Error('Unreachable: resourceMethod is undefined and action.page not set')
            }

            const handler: express.Handler = async (req, res, next) => {
              const ctx = this.serverRouterConfig.createActionContext({
                router: this,
                req,
                res,
                descriptor: actionDescriptor,
                httpPath: resourceHttpPath,
              })
              try {
                handlerLog('page: %s', ctx.httpFilePath)
                await this.serverRouterConfig.renderDefault(ctx)
              } catch (err) {
                next(err)
              }
            }

            params = [handler]
          } else {
            if (!schema) {
              throw new Error('Unreachable: schema is undefined')
            }

            const sources = choiseSources(this.serverRouterConfig.constructConfig, constructDescriptor, actionName)
            handlerLog(
              '%s#%s  with construct middleware; schema: %s, sources: %o',
              adapterPath,
              actionName,
              schema.constructor.name,
              sources
            )

            const handler: express.Handler = createResourceMethodHandler({
              resourceMethod,
              resource,
              sources,
              router: this,
              httpPath: resourceHttpPath,
              schema,
              adapterPath,
              actionDescriptor,
              responder: actionFunc,
              adapter,
            })
            params = [handler]
          }
        }

        const urlPath = path.join(rpath, actionDescriptor.path)
        routeLog(
          '%s %s\t%s\t{actionOverride:%s, resourceMethod:%s}',
          actionDescriptor.method instanceof Array ? actionDescriptor.method.join(',') : actionDescriptor.method,
          path.join(this.httpPath, urlPath),
          actionName,
          actionOverride,
          !!resourceMethod
        )

        const urlPathWithExt = `${urlPath.replace(/\/$/, '')}.:format?`
        if (actionDescriptor.method instanceof Array) {
          for (const method of actionDescriptor.method) {
            ;(this.router as any)[method].apply(this.router, [urlPathWithExt, ...params])
          }
        } else {
          ;(this.router as any)[actionDescriptor.method].apply(this.router, [urlPathWithExt, ...params])
        }
      }
    }
  }
}

export class ResourceHolderCreateRouter extends BasicRouter {
  constructor(
    private resourcesHolder: Record<string, Resource>,
    fileRoot: string,
    routerOption: Partial<ServerRouterConfig> = {},
    httpPath = '/'
  ) {
    super(fileRoot, routerOption, httpPath)
  }

  sub(rpath: string) {
    return new ResourceHolderCreateRouter(
      this.resourcesHolder,
      this.fileRoot,
      this.serverRouterConfig,
      path.join(this.httpPath, rpath)
    )
  }

  protected createHandlerBuildRunner(rpath: string, config: RouteConfig): HandlerBuildRunner {
    return async () => {
      const resourcePath = this.getResourcePath(rpath)
      const resourceSupport = new ResourceSupport(this.fileRoot)
      const resource = await importAndSetup<ResourceSupport, Resource>(
        this.fileRoot,
        resourcePath,
        resourceSupport,
        config
      )

      const resourceProxy = createLocalResourceProxy(config, resource)
      this.resourcesHolder[path.join(this.httpPath, rpath)] = resourceProxy
    }
  }
}
