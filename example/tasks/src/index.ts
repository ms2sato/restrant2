import { setup } from './web'
import displayRoutes from 'express-routemap'

setup().then((app) => {
  displayRoutes(app)

  const port = 3000
  app.listen(port, () => {
    console.log(`REST API server ready at: http://localhost:${port}`)
  })
})
