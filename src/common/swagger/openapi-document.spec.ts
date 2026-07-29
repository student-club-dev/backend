import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { AppDocuments, buildAppDocuments } from './openapi-document';

/**
 * Property names that are conceptually whole numbers. NestJS types every JS `number` as OpenAPI
 * `number`, which the Kotlin generator turns into `Double` — wrong for a sequence, a count, or an
 * integer number of so'm (§19.3).
 */
const MUST_BE_INTEGER = new Set([
  'seq',
  'unreadCount',
  'myReadSeq',
  'peerReadSeq',
  'peerDeliveredSeq',
  'page',
  'size',
  'total',
  'count',
  'sizeBytes',
  'durationMs',
  'width',
  'height',
]);

interface Offender {
  path: string;
  reason: string;
}

/** A schema whose only claim is `type: "object"` describes nothing the generator can name. */
function isUntypedObject(schema: Record<string, unknown>): boolean {
  return (
    schema.type === 'object' &&
    schema.properties === undefined &&
    schema.additionalProperties === undefined &&
    schema.$ref === undefined &&
    schema.allOf === undefined &&
    schema.oneOf === undefined &&
    schema.anyOf === undefined
  );
}

function findOffenders(node: unknown, path: string, out: Offender[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => findOffenders(item, `${path}/${index}`, out));
    return;
  }
  if (node === null || typeof node !== 'object') {
    return;
  }
  const schema = node as Record<string, unknown>;
  if (isUntypedObject(schema)) {
    out.push({ path, reason: 'untyped object — give the @ApiProperty an explicit `type`' });
  }
  for (const [key, value] of Object.entries(schema)) {
    if (
      MUST_BE_INTEGER.has(key) &&
      typeof value === 'object' &&
      value !== null &&
      (value as Record<string, unknown>).type === 'number'
    ) {
      out.push({
        path: `${path}/${key}`,
        reason: 'whole number typed as `number`, expected `integer`',
      });
    }
    findOffenders(value, `${path}/${key}`, out);
  }
}

/**
 * §19 — the Kotlin client is generated from these documents, so a schema the generator cannot name
 * is a client that does not compile. This runs in Nest's preview mode: metadata only, no database.
 */
describe('OpenAPI type quality (§19)', () => {
  let docs: AppDocuments;

  beforeAll(async () => {
    const app = await NestFactory.create(AppModule, { preview: true, logger: false });
    docs = buildAppDocuments(app, 'v1', 'docs');
    await app.close();
  }, 60_000);

  it.each(['student', 'business'] as const)(
    'has no codegen-hostile schemas in the %s document',
    (name) => {
      const out: Offender[] = [];
      findOffenders(docs[name].components?.schemas ?? {}, '#/components/schemas', out);
      expect(out).toEqual([]);
    },
  );
});
