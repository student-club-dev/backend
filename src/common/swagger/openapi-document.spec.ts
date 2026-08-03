import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
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
  /** The unfiltered path set, so the split can be checked for anything it dropped entirely. */
  let fullPaths: OpenAPIObject['paths'];

  beforeAll(async () => {
    const app = await NestFactory.create(AppModule, { preview: true, logger: false });
    docs = buildAppDocuments(app, 'v1', 'docs');
    fullPaths = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('full').setVersion('v1').build(),
    ).paths;
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

  /**
   * ⚠️ `filterOpenApiByTags` drops an operation whose tag is in no document's list, and the tag
   * guard in `buildAppDocuments` only checks the other direction — so a new student-facing
   * controller silently vanishes from the mobile contract. `Calls` did exactly that until `'Calls'`
   * was added to `STUDENT_DOC_TAGS` and `.addTag`.
   */
  it('serves the student call endpoints in the student document', () => {
    // Paths are prefix-less here: the preview app never calls `setGlobalPrefix`, so `/v1` is added
    // by the running app, not by the document.
    expect(Object.keys(docs.student.paths)).toEqual(
      expect.arrayContaining(['/calls', '/calls/ice-servers']),
    );
  });

  it('serves the student listing endpoints in the student document', () => {
    expect(Object.keys(docs.student.paths)).toEqual(
      expect.arrayContaining([
        '/student-listings',
        '/student-listings/mine',
        '/student-listings/{id}',
        '/student-listings/{id}/submit',
        '/student-listings/{id}/status',
      ]),
    );
  });

  /**
   * The general form of the trap above: rather than remembering to add a case per feature, assert
   * that every operation reaches at least one client document. Only genuinely server-side tags are
   * exempt — anything else missing here is a feature the mobile clients cannot call.
   */
  it('leaves no operation out of both documents', () => {
    // The admin panel and the liveness probe are not mobile surface, so they belong in neither
    // client document. Everything else reaching neither is a feature the apps cannot call.
    const isInternalOnly = (tag: string): boolean => tag.startsWith('Admin') || tag === 'Health';

    const published = new Set([
      ...Object.keys(docs.business.paths),
      ...Object.keys(docs.student.paths),
    ]);

    const orphaned = Object.entries(fullPaths)
      .filter(([path, item]) => {
        if (published.has(path)) {
          return false;
        }
        const tags = Object.values(item ?? {}).flatMap((operation) =>
          typeof operation === 'object' && operation !== null && 'tags' in operation
            ? ((operation as { tags?: string[] }).tags ?? [])
            : [],
        );
        return tags.length > 0 && !tags.every(isInternalOnly);
      })
      .map(([path]) => path);

    expect(orphaned).toEqual([]);
  });
});
