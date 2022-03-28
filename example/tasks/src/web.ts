import express from 'express'
import createError from 'http-errors'
import { ServerRouter } from 'restrant2'
import { routes } from './routes'
import createDebug from 'debug'
import methodOverride from 'method-override'
import path from 'path'
import { createOptions } from './endpoint_options'

process.on('uncaughtException', (err) => {
  console.error(err)
  console.error(err.stack)
})

const debug = createDebug('tasks:params')

export async function setup() {
  const app = express()

  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))
  app.set('views', path.join(__dirname, '../views'))
  app.set('view engine', 'pug')

  // @see http://expressjs.com/en/resources/middleware/method-override.html
  app.use(
    methodOverride(function (req, _res) {
      if (req.body && typeof req.body === 'object' && '_method' in req.body) {
        // look in urlencoded POST bodies and delete it
        const method = req.body._method
        delete req.body._method
        return method
      }
    })
  )

  app.use(methodOverride('_method', { methods: ['GET', 'POST'] })) // for GET Parameter

  app.use((req, res, next) => {
    debug(`${req.method} ${req.path}`)

    next()
    if (debug.enabled) {
      debug(`req.params: %o`, req.params)
      debug(`req.body: %o`, req.body)
      debug(`req.query: %o`, req.query)
    }
  })

  const router: ServerRouter = new ServerRouter(__dirname, '/', {
    createOptions,
  })
  app.use(router.router)
  await routes(router)

  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack)
    next(err)
  })

  app.use((req, res, next) => {
    next(createError(404))
  })

  return app
}
