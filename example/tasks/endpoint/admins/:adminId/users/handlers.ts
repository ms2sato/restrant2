import { defineHandlers } from 'restrant2'

export default defineHandlers((support, options) => {
  return {
    index: {
      success: async (output, req, res) => res.render('users/index', { users: output }),
    },

    build: (req, res) => res.render('users/build', { user: {} }),

    edit: {
      success: async (output, req, res) => res.render('users/edit', { user: output }),
    },

    create: {
      success: async (output, req, res) => {
        res.redirect(`/admin/${req.params.adminId}/users`)
      },
      invalid: async (err, req, res) => {
        res.render('users/build', { user: req.body, err })
      },
    },

    update: {
      success: async (output, req, res) => {
        res.redirect('/users')
      },
      invalid: async (err, req, res) => {
        res.render('users/edit', { user: req.body, err })
      },
    },

    destroy: {
      success: async (output, req, res) => {
        res.redirect('/users')
      },
    },

    done: {
      success: async (output, req, res) => {
        res.redirect('/users')
      },
    },
  }
})
