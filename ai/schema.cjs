const nullable = definition => ({ anyOf: [definition, { type: 'null' }] });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const string = { type: 'string' }, number = { type: 'number' };
module.exports = object({
  summary: string, review: string, questions: { type: 'array', items: string },
  changes: { type: 'array', items: object({
    action: { type: 'string', enum: ['add', 'update', 'delete'] },
    kind: { type: 'string', enum: ['text', 'shape', 'connection', 'image', 'pdf', 'ink', 'drawing'] }, id: string,
    content: nullable(string), format: nullable({ type: 'string', enum: ['md', 'html'] }),
    geometry: nullable(object({ x: number, y: number, width: number, height: number })),
    style: nullable(object({ shape: { type: 'string', enum: ['rect', 'roundrect', 'ellipse', 'diamond'] }, fill: string, stroke: string, strokeWidth: number })),
    connection: nullable(object({ source: string, target: string, sourceSide: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
      targetSide: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] }, arrow: { type: 'string', enum: ['none', 'forward', 'both'] }, dashed: { type: 'boolean' } })),
  }) },
});
