import { setup } from './web'
import displayRoutes from 'express-routemap'

const boot = async () => {
  const app = await setup()
  displayRoutes(app)

  const port = process.env.PORT ? Number(process.env.PORT) : 3000
  app.listen(port, () => {
    console.log(`REST API server ready at: http://localhost:${port}`)
  })
}

boot().catch((err) => {
  console.error(err)
})
