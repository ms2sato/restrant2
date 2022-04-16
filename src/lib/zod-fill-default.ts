import { z } from 'zod'

function fill(obj: any, schema: z.AnyZodObject) {
  for (const [key, subSchema] of Object.entries(schema.shape)) {
    if (key in obj) {
      if (obj[key] instanceof Array) {
        if (!(subSchema instanceof z.ZodArray)) {
          continue
        }

        for (const item of obj[key]) {
          fill(item, subSchema.element)
        }
        continue
      }
      if (obj[key] instanceof Object) {
        if (!(subSchema instanceof z.ZodObject)) {
          continue
        }

        fill(obj[key], subSchema)
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

export function fillDefault(obj: any, schema: z.AnyZodObject): any {
  return fill(obj, schema)
}
