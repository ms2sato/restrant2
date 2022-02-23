import { Handler, PostHandler, defineActions } from 'restrant2'

export default defineActions((support, options) => {
  const _time: Handler = (req, res) => {
    res.json({ id: req.params.id, time: new Date() })
  }

  const create: PostHandler = {
    success: async (output, req, res) => { 
      res.redirect('/tasks')
    }, 
    invalid: async (err, req, res) => { 
      res.render('tasks/build', { body: req.body, err }) 
    }
  }

  const update = () => {}

  const destroy = () => {}

  return { create, update, destroy, _time };
})
