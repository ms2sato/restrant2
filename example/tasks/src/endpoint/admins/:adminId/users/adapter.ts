import { defineAdapter } from 'restrant2'
import { AcceptLanguageOption } from '../../../../endpoint_options'

export default defineAdapter<AcceptLanguageOption>((support, routeConfig) => {
  return {
    index: {
      success: async (ctx, output, option) =>
        ctx.render('users/index', { users: output, admin: { id: Number(ctx.req.params.adminId) }, ...option }),
    },

    build: (ctx) => ctx.render('users/build', { user: {} }),

    edit: {
      success: async (ctx, output, option) =>
        ctx.render('users/edit', { admin: { id: Number(ctx.req.params.adminId) }, data: output, ...option }),
    },

    create: {
      success: async (ctx, output) => {
        ctx.redirect(`/admin/${ctx.req.params.adminId}/users`)
      },
      invalid: async (ctx, err) => {
        ctx.render('users/build', { user: ctx.req.body, err })
      },
    },

    update: {
      success: async (ctx, output) => {
        ctx.redirect('/users')
      },
      invalid: async (ctx, err) => {
        ctx.render('users/edit', { user: ctx.req.body, err })
      },
    },

    destroy: {
      success: async (ctx, output) => {
        ctx.redirect('/users')
      },
    },

    done: {
      success: async (ctx, output) => {
        ctx.redirect('/users')
      },
    },
  }
})
