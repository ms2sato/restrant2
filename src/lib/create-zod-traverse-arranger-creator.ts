import { z } from 'zod'
import { TraverseArranger, TraverseArrangerCreator } from './request-body-parser'

export function createZodTraverseArrangerCreator(schema: z.AnyZodObject): TraverseArrangerCreator {
  return () => new ZodArranger(schema)
}

function stripDefault(schema: z.AnyZodObject) {
  if (schema instanceof z.ZodDefault) {
    return (schema._def as any).innerType
  }
  return schema
}

export class ZodArranger implements TraverseArranger {
  constructor(private schema: z.AnyZodObject) {}

  next(path: string, node: Record<string, any>, value: any, pathIndex: number): void {
    this.schema = stripDefault(this.schema.shape[path])
  }

  nextItem(name: string, node: Record<string, any>, value: any, pathIndex: number): void {
    let parentSchema = stripDefault(this.schema.shape[name])
    this.schema = stripDefault(parentSchema.element)
  }

  arrangeIndexedArrayItemOnLast(name: string, node: Record<string, any>, value: any, pathIndex: number) {
    if (this.isArraySchema()) {
      return this.cast(this.elementSchema(), value)
    }
  }

  arrangeUnindexedArrayOnLast(
    name: string,
    node: Record<string, any>,
    value: any[],
    pathIndex: number
  ): any | undefined {
    if (this.isArraySchema()) {
      return this.castArray(this.elementSchema(), value)
    } else {
      console.error(this.schema, name, value)
      throw new Error(`Unexpected Type: ${this.schema}`)
    }
  }

  arrangePropertyOnLast(path: string, node: Record<string, any>, value: any, pathIndex: number) {
    const casted = this.cast(this.schema, value)
    if (casted) {
      return casted
    }

    return value
  }

  private isArraySchema() {
    return this.schema instanceof z.ZodArray
  }

  private elementSchema() {
    if (!(this.schema instanceof z.ZodArray)) {
      throw new Error('Must be array schema')
    }
    return this.schema.element
  }

  private castArray(elementSchema: z.AnyZodObject, value: any) {
    return value.map((item: any) => {
      return this.cast(elementSchema, item)
    })
  }

  private cast(schema: z.AnyZodObject, value: any) {
    if (schema instanceof z.ZodNumber) {
      return Number(value)
    }
    if (schema instanceof z.ZodDate) {
      return new Date(value)
    }
    if (schema instanceof z.ZodString) {
      return value.toString()
    }
  }
}
