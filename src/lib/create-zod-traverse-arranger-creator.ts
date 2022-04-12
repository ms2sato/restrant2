import { z } from 'zod'
import { TraverseArranger, TraverseArrangerCreator } from './request-body-parser'

export function createZodTraverseArrangerCreator(schema: z.AnyZodObject): TraverseArrangerCreator {
  return () => new ZodArranger(schema)
}

export class ZodArranger implements TraverseArranger {
  constructor(private schema: z.AnyZodObject) {}

  next(path: string, node: Record<string, any>, value: any, pathIndex: number): void {
    this.schema = this.schema.shape[path]
  }

  nextItem(name: string, node: Record<string, any>, value: any, pathIndex: number): void {
    this.schema = this.schema.shape[name].element
  }

  arrangeIndexedArrayOnLast(name: string, node: Record<string, any>, value: any, pathIndex: number) {
    if (this.schema instanceof z.ZodArray) {
      return this.cast(this.schema.element, value)
    }
  }

  arrangePropertyOnLast(path: string, node: Record<string, any>, value: any, pathIndex: number) {
    const casted = this.cast(this.schema, value)
    if (casted) {
      return casted
    }

    if (this.schema instanceof z.ZodArray) {
      return this.castArray(this.schema.element, value)
    }
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
