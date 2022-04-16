import { z } from 'zod'

function doFill(obj: any, schema: z.AnyZodObject) {
  for (const [key, subSchema] of Object.entries(schema.shape)) {
    if (key in obj) {
      if (obj[key] instanceof Array) {
        if (!(subSchema instanceof z.ZodArray)) {
          continue
        }

        for (const item of obj[key]) {
          doFill(item, subSchema.element)
        }
        continue
      }
      if (obj[key] instanceof Object) {
        if (!(subSchema instanceof z.ZodObject)) {
          continue
        }

        doFill(obj[key], subSchema)
        continue
      }
      continue
    }

    if (!(subSchema instanceof z.ZodDefault)) {
      continue
    }

    obj[key] = subSchema._def.defaultValue()
  }
  return obj
}

export function fill(obj: any, schema: z.AnyZodObject): any {
  return doFill(obj, schema)
}
