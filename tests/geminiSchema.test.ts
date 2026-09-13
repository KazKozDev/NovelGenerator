import { describe, it, expect } from 'vitest';
import { sanitizeGeminiSchema } from '../services/geminiService';

describe('sanitizeGeminiSchema', () => {
  it('keeps an integer-or-null field an integer, and marks it nullable', () => {
    // The line that killed two live books: type: ['integer','null'] fell through to the default and
    // the model was told payoffChapter is a string. It answered "4", and then omitted it entirely.
    const cleaned = sanitizeGeminiSchema({
      type: 'object',
      required: ['payoffChapter'],
      properties: { payoffChapter: { type: ['integer', 'null'] } },
    });
    expect(cleaned.properties.payoffChapter).toEqual({ type: 'integer', nullable: true });
    expect(cleaned.required).toEqual(['payoffChapter']);
    // An explicit nullable:false beside a nullable union does not take the null away.
    expect(sanitizeGeminiSchema({ type: ['string', 'null'], nullable: false })).toEqual({ type: 'string', nullable: true });
  });

  it('strips additionalProperties and non-Gemini fields from object schemas', () => {
    const rawSchema = {
      type: 'object',
      required: ['title', 'scenes'],
      additionalProperties: false,
      title: 'NovelPlan',
      $schema: 'http://json-schema.org/draft-07/schema#',
      properties: {
        title: { type: 'string', minLength: 1 },
        scenes: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          uniqueItems: true,
          items: {
            type: 'object',
            required: ['id', 'weight'],
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              weight: { type: 'integer', minimum: 1, maximum: 5 }
            }
          }
        }
      }
    };

    const sanitized = sanitizeGeminiSchema(rawSchema);

    expect(sanitized).toEqual({
      type: 'object',
      required: ['title', 'scenes'],
      properties: {
        title: {
          type: 'string'
        },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'weight'],
            properties: {
              id: { type: 'string' },
              weight: { type: 'integer' }
            }
          }
        }
      }
    });

    // Explicitly check that forbidden keywords were removed
    expect(sanitized).not.toHaveProperty('additionalProperties');
    expect(sanitized).not.toHaveProperty('$schema');
    expect(sanitized).not.toHaveProperty('title');
    expect(sanitized.properties.scenes).not.toHaveProperty('minItems');
    expect(sanitized.properties.scenes).not.toHaveProperty('maxItems');
    expect(sanitized.properties.scenes).not.toHaveProperty('uniqueItems');
    expect(sanitized.properties.scenes.items).not.toHaveProperty('additionalProperties');
    expect(sanitized.properties.scenes.items.properties.weight).not.toHaveProperty('minimum');
    expect(sanitized.properties.scenes.items.properties.weight).not.toHaveProperty('maximum');
  });

  it('preserves allowed fields like enum, description, format, and nullable', () => {
    const rawSchema = {
      type: 'object',
      description: 'Review issue output',
      properties: {
        category: {
          type: 'string',
          description: 'Category of issue',
          enum: ['grammar', 'plot', 'character']
        },
        resolvedAt: {
          type: 'string',
          format: 'date-time',
          nullable: true
        }
      }
    };

    const sanitized = sanitizeGeminiSchema(rawSchema);

    expect(sanitized).toEqual({
      type: 'object',
      description: 'Review issue output',
      properties: {
        category: {
          type: 'string',
          description: 'Category of issue',
          enum: ['grammar', 'plot', 'character']
        },
        resolvedAt: {
          type: 'string',
          format: 'date-time',
          nullable: true
        }
      }
    });
  });

  it('drops a property that says nothing instead of calling it a string', () => {
    // The generic contract schema the pipeline builds — required keys, empty
    // property bodies — used to describe a whole book design to Gemini as eight
    // strings. It answered with a 1.4k skeleton whose chapter_map was a
    // sentence, and validation killed the run on the first call.
    // Nothing is said about the node or its one property: the whole node drops.
    expect(sanitizeGeminiSchema({ properties: { tag: {} } })).toBeUndefined();
    // A declared object keeps its type and loses the properties that said nothing.
    expect(sanitizeGeminiSchema({ type: 'object', properties: { tag: {} } })).toEqual({ type: 'object' });

    const keys = ['contract', 'characters', 'chapter_map'];
    const loose = { type: 'object', required: keys, properties: Object.fromEntries(keys.map(k => [k, {}])) };
    const sanitized = sanitizeGeminiSchema(loose);
    expect(sanitized.properties).toBeUndefined();
    expect(sanitized.required).toBeUndefined();

    // A node that does say something still normalizes as before.
    expect(sanitizeGeminiSchema({ properties: { tag: { description: 'a label' } } })).toEqual({
      type: 'object',
      properties: { tag: { type: 'string', description: 'a label' } },
    });
  });

  it('filters required properties to only those defined in properties', () => {
    const rawSchema = {
      type: 'object',
      required: ['existingKey', 'nonExistentKey'],
      properties: {
        existingKey: { type: 'string' }
      }
    };

    const sanitized = sanitizeGeminiSchema(rawSchema);
    expect(sanitized.required).toEqual(['existingKey']);
  });
});
