import express from 'express'
import createError from 'http-errors'
import createDebug from 'debug'
import methodOverride from 'method-override'
import path from 'path'
import os from 'os'
import fileUpload from 'express-fileupload'
import { ServerRouter } from 'restrant2'
import { routes } from './routes'
import { createActionOptions } from './endpoint_options'

process.on('uncaughtException', (err) => {
  console.error(err)
  console.error(err.stack)
})

const debug = createDebug('tasks:params')

const useMethodOverride = (app: express.Application) => {
  type BodyType = {
    _method?: string
  }

  const methodName = '_method'

  // @see http://expressjs.com/en/resources/middleware/method-override.html
  app.use(
    methodOverride(function (req, _res) {
      if (req.body && typeof req.body === 'object' && methodName in req.body) {
        const body = req.body as BodyType
        const method = body[methodName]
        if (!method) {
          throw new Error('Unreachable')
        }
        // look in urlencoded POST bodies and delete it
        delete body[methodName]
        return method
      }
      return req.method
    })
  )

  app.use(methodOverride(methodName, { methods: ['GET', 'POST'] })) // for GET Parameter
}

export async function setup() {
  const app = express()

  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))
  app.set('views', path.join(__dirname, '../views'))
  app.set('view engine', 'pug')

  app.use(
    fileUpload({
      useTempFiles: true,
      tempFileDir: os.tmpdir(),
    })
  )

  useMethodOverride(app)

  app.use((req, res, next) => {
    debug(`${req.method} ${req.path}`)

    next()
    if (debug.enabled) {
      debug(`req.params: %o`, req.params)
      debug(`req.body: %o`, req.body)
      debug(`req.query: %o`, req.query)
    }
  })

  const router: ServerRouter = new ServerRouter(__dirname, {
    createActionOptions,
  })
  app.use(router.router)
  routes(router)
  await router.build()

  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack)
    next(err)
  })

  app.use((req, res, next) => {
    next(createError(404))
  })

  return app
}
