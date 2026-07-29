import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { filterOpenApiByTags } from './filter-openapi-by-tags';

// Tags served in each per-app Swagger doc. The two mobile apps are generated from their own JSON, so
// each doc carries only its account type's endpoints plus the shared ones (Profiles, Geo, Media).
// `Health` and `Admin — Business Types` belong to neither app and are left out of both. Strings must
// match the @ApiTags / DocumentBuilder.addTag names exactly — `buildAppDocuments` asserts this.
export const BUSINESS_DOC_TAGS = [
  'Auth — Business',
  'Auth — Business OTP',
  'Auth — Business Password',
  'Auth — Business Sessions',
  'Business',
  'Branches',
  'Listings',
  'Redemptions',
  'Catalog',
  'Trade Centers',
  'Profiles',
  'Geo',
  'Media',
];

export const STUDENT_DOC_TAGS = [
  'Auth — Student',
  'Auth — Student OTP',
  'Auth — Student Password',
  'Auth — Student Sessions',
  'Catalog (student feed)',
  'Discounts (student feed)',
  'Connections',
  'Chat',
  'Notifications',
  'Profiles',
  'Geo',
  'Media',
];

/** The two per-app OpenAPI documents the mobile clients are generated from. */
export interface AppDocuments {
  business: OpenAPIObject;
  student: OpenAPIObject;
}

/**
 * Builds both per-app OpenAPI documents.
 *
 * Shared by the running app (which serves them at `/${swaggerPath}/{business,student}`) and by
 * `scripts/dump-openapi.ts` (which writes them to `docs/api/generated/`), so the served spec and the
 * committed one can never drift. Pure with respect to the app: it only reads route metadata, which
 * is why the dump script can run it under Nest's `preview` mode without a database.
 */
export function buildAppDocuments(
  app: INestApplication,
  prefix: string,
  swaggerPath: string,
): AppDocuments {
  const config = new DocumentBuilder()
    .setTitle('ElonUz API')
    .setDescription(
      [
        'Student discounts platform — backend.',
        '',
        `All endpoints are served under \`/${prefix}\` and every response — success **and** error — uses the same envelope:`,
        '',
        '```jsonc',
        '{ "success": true,  "status": 200, "code": null, "message": "OK",',
        '  "result": <payload>, "error": null }',
        '',
        '{ "success": false, "status": 404, "code": null, "message": "Biznes topilmadi",',
        '  "result": null,',
        '  "error": { "code": "BUSINESS_NOT_FOUND", "message": "Biznes topilmadi", "fields": {} } }',
        '```',
        '',
        'The HTTP status code and the `status` field are always equal. `message` is user-facing Uzbek',
        'text. On 422 the per-field messages are in `error.fields`. Money is an integer number of',
        'so\'m (`currency: "UZS"`); dates are ISO-8601.',
        '',
        'Send the access token as `Authorization: Bearer <token>`. On `TOKEN_EXPIRED`, refresh and retry.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'JWT access token issued by `/auth/login`, `/auth/register` or `/auth/refresh`.',
    })
    // Declared order drives the order of the groups in the UI.
    .addTag('Auth — Student', 'Student app: register, login, OAuth, refresh, logout')
    .addTag('Auth — Student OTP', 'Student app: SMS OTP request / verify')
    .addTag('Auth — Student Password', 'Student app: set, forgot and reset password')
    .addTag('Auth — Student Sessions', 'Student app: active sessions and revocation')
    .addTag('Auth — Business', 'Business app: register, login, OAuth, refresh, logout')
    .addTag('Auth — Business OTP', 'Business app: SMS OTP request / verify')
    .addTag('Auth — Business Password', 'Business app: set, forgot and reset password')
    .addTag('Auth — Business Sessions', 'Business app: active sessions and revocation')
    .addTag('Profiles', 'The signed-in account’s profile')
    .addTag('Business', 'Owner-side business CRUD')
    .addTag('Catalog', 'Business types, categories and their attribute schemas')
    .addTag('Catalog (student feed)', 'Student app: catalog groups and their business types')
    .addTag('Discounts (student feed)', 'Student app: the offers feed — search, detail, favourites')
    .addTag('Connections', 'Student app: connections, requests, blocks and reports (chat gate)')
    .addTag('Chat', 'Student app: conversations, messages and real-time chat (`/chat` WS)')
    .addTag('Notifications', 'Student app: device-token registration for push')
    .addTag('Branches', 'Branches of a business: location, working hours, delivery')
    .addTag('Trade Centers', 'Trade centres a branch can be placed in')
    .addTag('Listings', 'Discounted and regular offers')
    .addTag('Redemptions', 'Cashier: verify/confirm a code; owner: redemption history')
    .addTag('Geo', 'Regions, districts and geocoding')
    .addTag('Media', 'Image upload')
    .addTag('Admin — Business Types', 'Admin-only catalog maintenance (ADMIN JWT)')
    .addTag('Health', 'Liveness probe')
    .build();

  const fullDocument = SwaggerModule.createDocument(app, config);

  // Fail fast if a doc's tag list drifted from the actual @ApiTags / addTag names.
  const knownTags = new Set((fullDocument.tags ?? []).map((tag) => tag.name));
  for (const tag of [...BUSINESS_DOC_TAGS, ...STUDENT_DOC_TAGS]) {
    if (!knownTags.has(tag)) {
      throw new Error(`Swagger split references an unknown tag: "${tag}"`);
    }
  }

  const commonDescription = fullDocument.info.description ?? '';
  const withAppInfo = (doc: OpenAPIObject, title: string, jsonPath: string): OpenAPIObject => ({
    ...doc,
    info: {
      ...doc.info,
      title,
      description: `${commonDescription}\n\nThe full OpenAPI JSON (feed this to the mobile client codegen) is at [${jsonPath}](${jsonPath}).`,
    },
  });

  return {
    business: withAppInfo(
      filterOpenApiByTags(fullDocument, BUSINESS_DOC_TAGS),
      'ElonUz — Business API',
      `/${swaggerPath}/business/json`,
    ),
    student: withAppInfo(
      filterOpenApiByTags(fullDocument, STUDENT_DOC_TAGS),
      'ElonUz — Student API',
      `/${swaggerPath}/student/json`,
    ),
  };
}
