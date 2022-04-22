import { defineAdapter, Handler, AdapterOf } from 'restrant2'
import { AcceptLanguageOption } from '../../../../endpoint_options'
import { globalUploadedFileCache } from '../../../../lib/upload'

import type resource from './resource'

type Adapter = AdapterOf<typeof resource, AcceptLanguageOption> & { build: Handler; photoCache: Handler }

export default defineAdapter<Adapter>((_support, _routeConfig): Adapter => {
  return {
    index: {
      success: (ctx, output, option) => {
        ctx.render('users/index', { users: output, admin: { id: Number(ctx.params.adminId) }, ...option })
      },
    },

    build: (ctx) => ctx.render('users/build', { data: { adminId: Number(ctx.params.adminId) } }),

    edit: {
      success: (ctx, output, option) => ctx.render('users/edit', { data: output, ...option }),
    },

    create: {
      afterValidation: (ctx, input) => {
        if (!input.photo && input.photoCache) {
          input.photo = globalUploadedFileCache.load(input.photoCache)
        }
        return input
      },
      success: (ctx, output) => {
        ctx.redirect(`/admins/${output.adminId}/users`)
      },
      invalid: async (ctx, err, source) => {
        const photoCache = source.photo ? await globalUploadedFileCache.store(source.photo) : source.photoCache
        ctx.render('users/build', { data: { ...source, photo: undefined, photoCache }, err })
      },
    },

    update: {
      afterValidation: (ctx, input) => {
        if (!input.photo && input.photoCache) {
          input.photo = globalUploadedFileCache.load(input.photoCache)
        }
        return input
      },
      success: (ctx, output) => {
        ctx.redirect(`/admins/${output.adminId}/users`)
      },
      invalid: async (ctx, err, source) => {
        const photoCache = source.photo ? await globalUploadedFileCache.store(source.photo) : source.photoCache
        ctx.render('users/edit', { data: { ...source, photo: undefined, photoCache }, err })
      },
    },

    destroy: {
      success: (ctx) => {
        ctx.redirect('/users')
      },
    },

    photo: {
      success: (ctx, output) => {
        if (!output) {
          ctx.res.send('Photo not found')
          return
        }
        ctx.res.sendFile(output)
      },
    },

    photoCache: (ctx) => {
      if (!ctx.params.key) {
        // TODO: error code 400
        throw new Error('Unexpected access')
      }
      ctx.res.sendFile(globalUploadedFileCache.fullPath(ctx.params.key))
    },
  }
})
