import { defineAdapter } from 'restrant2'
import { User } from './resource'
import { AcceptLanguageOption } from '../../../../endpoint_options'
import { globalUploadedFileCache } from '../../../../lib/upload'

export default defineAdapter<AcceptLanguageOption>((_support, _routeConfig) => {
  return {
    index: {
      success: async (ctx, output: User[], option) =>
        ctx.render('users/index', { users: output, admin: { id: Number(ctx.params.adminId) }, ...option }),
    },

    build: (ctx) => ctx.render('users/build', { data: { adminId: ctx.params.adminId } }),

    edit: {
      success: async (ctx, output: User, option) => ctx.render('users/edit', { data: output, ...option }),
    },

    create: {
      success: async (ctx, output: User) => {
        ctx.redirect(`/admins/${output.adminId}/users`)
      },
      invalid: async (ctx, err, source) => {
        const photoCache = source.photo ? await globalUploadedFileCache.cache(source.photo) : undefined
        ctx.render('users/build', { data: { ...source, photo: undefined, photoCache }, err })
      },
    },

    update: {
      success: async (ctx, output: User) => {
        ctx.redirect(`/admins/${output.adminId}/users`)
      },
      invalid: async (ctx, err, source) => {
        const photoCache = source.photo ? await globalUploadedFileCache.cache(source.photo) : undefined
        ctx.render('users/edit', { data: { ...source, photo: undefined, photoCache }, err })
      },
    },

    destroy: {
      success: async (ctx, output) => {
        ctx.redirect('/users')
      },
    },

    photo: {
      success: async (ctx, output: string | null) => {
        if (!output) {
          ctx.res.send('Photo not found')
          return
        }
        await ctx.res.sendFile(output)
      },
    },

    photoCache: async (ctx) => {
      if (!ctx.params.key) {
        throw new Error('Unexpected access')
      }
      await ctx.res.sendFile(globalUploadedFileCache.fullPath(ctx.params.key))
    },
  }
})