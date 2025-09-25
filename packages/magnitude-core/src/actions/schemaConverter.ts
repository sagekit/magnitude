import { z, ZodSchema, ZodObject } from 'zod';
import { ActionDefinition } from './index';
import { Agent } from '@/agent';

export interface ConvertedActionDefinition<TConverted, TOriginal> extends ActionDefinition<TConverted> {
  originalSchema: ZodSchema<TOriginal>;
  mapToOriginal: (converted: TConverted) => TOriginal;
}

export interface CoordinateScaling {
  x: number;
  y: number;
}

export interface SchemaConverter {
  shouldApply(modelName: string): boolean;
  convertSchema<T>(actionDef: ActionDefinition<T>, modelName: string): ConvertedActionDefinition<any, T> | ActionDefinition<T>;
  getCoordinateScaling?(modelName: string): CoordinateScaling;
}

export class QwenSchemaConverter implements SchemaConverter {
  shouldApply(modelName: string): boolean {
    return modelName.includes('qwen3');
  }

  getCoordinateScaling(modelName: string): CoordinateScaling {
    // Default scaling - can be customized per model
    return { x: 1.0, y: 0.75 };
  }

  convertSchema<T>(actionDef: ActionDefinition<T>, modelName: string): ConvertedActionDefinition<any, T> | ActionDefinition<T> {
    const { name, description, schema, resolver, render } = actionDef;

    // Convert coordinate-based actions to Qwen format
    if (this.isCoordinateAction(name, schema)) {
      const convertedSchema = this.convertCoordinateSchema(name, schema);
      const scaling = this.getCoordinateScaling(modelName);
      const mapper = this.createMapper(name, scaling);

      return {
        name,
        description,
        schema: convertedSchema,
        originalSchema: schema,
        mapToOriginal: mapper,
        resolver: async ({ input, agent }: { input: any; agent: Agent }) => {
          // Map converted input back to original format for resolver
          const originalInput = mapper(input);
          return resolver({ input: originalInput, agent });
        },
        render: (convertedInput: any) => {
          // Map converted input back to original format for render
          const originalInput = mapper(convertedInput);
          return render(originalInput);
        }
      };
    }

    // Return unchanged for non-coordinate actions
    return actionDef;
  }

  private isCoordinateAction(name: string, schema: ZodSchema): boolean {
    const coordinateActions = ['mouse:click', 'mouse:double_click', 'mouse:right_click', 'mouse:scroll', 'mouse:drag'];
    return coordinateActions.includes(name) && schema instanceof ZodObject;
  }

  private convertCoordinateSchema(actionName: string, schema: ZodSchema): ZodSchema {
    if (actionName === 'mouse:scroll') {
      return z.object({
        at: z.array(z.number().int()).min(2).max(2).describe("Coordinates as [x, y] - exactly 2 numbers"),
        delta: z.array(z.number().int()).min(2).max(2).describe("Scroll delta as [deltaX, deltaY] - exactly 2 numbers")
      });
    } else if (actionName === 'mouse:drag') {
      return z.object({
        from: z.array(z.number().int()).min(2).max(2).describe("Start coordinates as [x, y] - exactly 2 numbers"),
        to: z.array(z.number().int()).min(2).max(2).describe("End coordinates as [x, y] - exactly 2 numbers")
      });
    } else {
      // mouse:click, mouse:double_click, mouse:right_click
      return z.object({
        at: z.array(z.number().int()).min(2).max(2).describe("Coordinates as [x, y] - exactly 2 numbers")
      });
    }
  }

  private createMapper(actionName: string, scaling: CoordinateScaling): (converted: any) => any {
    const scaleCoord = (x: number, y: number) => ({
      x: Math.round(x * scaling.x),
      y: Math.round(y * scaling.y)
    });

    if (actionName === 'mouse:scroll') {
      return (input) => {
        const { x, y } = scaleCoord(input.at[0], input.at[1]);
        return {
          x,
          y,
          deltaX: Math.round(input.delta[0] * scaling.x),
          deltaY: Math.round(input.delta[1] * scaling.y)
        };
      };
    } else if (actionName === 'mouse:drag') {
      return (input) => {
        const from = scaleCoord(input.from[0], input.from[1]);
        const to = scaleCoord(input.to[0], input.to[1]);
        return { from, to };
      };
    } else {
      // mouse:click, mouse:double_click, mouse:right_click
      return (input) => scaleCoord(input.at[0], input.at[1]);
    }
  }
}

export function getSchemaConverter(modelName: string): SchemaConverter | null {
  const converters = [new QwenSchemaConverter()];

  return converters.find(converter => converter.shouldApply(modelName)) || null;
}

export function convertActionDefinitionsForModel<T>(
  actionVocabulary: ActionDefinition<T>[],
  modelName: string
): ActionDefinition<any>[] {
  const converter = getSchemaConverter(modelName);

  if (!converter) {
    return actionVocabulary as ActionDefinition<any>[];
  }

  return actionVocabulary.map(actionDef => converter.convertSchema(actionDef, modelName));
}