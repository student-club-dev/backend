import 'reflect-metadata';
import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { ValidationError } from 'class-validator';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { swaggerBasicAuth } from './common/middleware/swagger-basic-auth.middleware';
import { filterOpenApiByTags } from './common/swagger/filter-openapi-by-tags';
import { AppException } from './common/exceptions/app.exception';
import { ERROR_CODE } from './common/errors/error-code';
import type { Env } from './config/env';

// Tags served in each per-app Swagger doc. The two mobile apps are generated from their own JSON, so
// each doc carries only its account type's endpoints plus the shared ones (Profiles, Geo, Media).
// `Health` and `Admin — Business Types` belong to neither app and are left out of both. Strings must
// match the @ApiTags / DocumentBuilder.addTag names exactly — bootstrap asserts this at boot.
const BUSINESS_DOC_TAGS = [
  'Auth — Business',
  'Auth — Business OTP',
  'Auth — Business Password',
  'Auth — Business Sessions',
  'Business',
  'Branches',
  'Listings',
  'Catalog',
  'Trade Centers',
  'Profiles',
  'Geo',
  'Media',
];
const STUDENT_DOC_TAGS = [
  'Auth — Student',
  'Auth — Student OTP',
  'Auth — Student Password',
  'Auth — Student Sessions',
  'Profiles',
  'Geo',
  'Media',
];

// Money is stored as BigInt (integer so'm) but the contract sends it as a JSON number.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this as unknown as bigint);
};

function validationExceptionFactory(errors: ValidationError[]): AppException {
  const fields: Record<string, string> = {};
  const walk = (errs: ValidationError[], prefix = ''): void => {
    for (const e of errs) {
      const path = prefix ? `${prefix}.${e.property}` : e.property;
      if (e.constraints) {
        fields[path] = Object.values(e.constraints)[0];
      }
      if (e.children?.length) walk(e.children, path);
    }
  };
  walk(errors);
  return new AppException(ERROR_CODE.VALIDATION_ERROR, 422, 'Ma’lumotlar noto‘g‘ri', fields);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const prefix = config.get('API_PREFIX', { infer: true });
  const port = config.get('PORT', { infer: true });
  const swaggerPath = config.get('SWAGGER_PATH', { infer: true });
  const swaggerUser = config.get('SWAGGER_USER', { infer: true });
  const swaggerPassword = config.get('SWAGGER_PASSWORD', { infer: true });
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';

  // Serve uploaded media from disk in dev (prod serves the same /uploads path via Nginx). Kept
  // OUTSIDE the global `/v1` prefix — useStaticAssets is not affected by setGlobalPrefix.
  const uploadsDir = resolve(config.get('UPLOADS_DIR', { infer: true }));
  await mkdir(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
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
    .addTag('Branches', 'Branches of a business: location, working hours, delivery')
    .addTag('Trade Centers', 'Trade centres a branch can be placed in')
    .addTag('Listings', 'Discounted and regular offers')
    .addTag('Geo', 'Regions, districts and geocoding')
    .addTag('Media', 'Image upload')
    .addTag('Admin — Business Types', 'Admin-only catalog maintenance (`X-Admin-Key`)')
    .addTag('Health', 'Liveness probe')
    .build();

  // Expose the docs only when protected (a password is set) or outside production. When a password
  // is set, gate the UI + JSON + YAML with Basic auth before SwaggerModule registers those routes;
  // keeping the JSON under `/${swaggerPath}/json` lets the browser reuse the same credentials.
  if (swaggerPassword || !isProd) {
    if (swaggerPassword) {
      // One mount on `/${swaggerPath}` covers both sub-docs and their JSON.
      app.use(`/${swaggerPath}`, swaggerBasicAuth(swaggerUser, swaggerPassword));
    }
    const fullDocument = SwaggerModule.createDocument(app, swaggerConfig);

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

    const businessDoc = withAppInfo(
      filterOpenApiByTags(fullDocument, BUSINESS_DOC_TAGS),
      'ElonUz — Business API',
      `/${swaggerPath}/business/json`,
    );
    const studentDoc = withAppInfo(
      filterOpenApiByTags(fullDocument, STUDENT_DOC_TAGS),
      'ElonUz — Student API',
      `/${swaggerPath}/student/json`,
    );

    SwaggerModule.setup(`${swaggerPath}/business`, app, businessDoc, {
      jsonDocumentUrl: `${swaggerPath}/business/json`,
      yamlDocumentUrl: `${swaggerPath}/business/yaml`,
      swaggerOptions: { persistAuthorization: true },
    });
    SwaggerModule.setup(`${swaggerPath}/student`, app, studentDoc, {
      jsonDocumentUrl: `${swaggerPath}/student/json`,
      yamlDocumentUrl: `${swaggerPath}/student/yaml`,
      swaggerOptions: { persistAuthorization: true },
    });
  } else {
    app
      .get(Logger)
      .warn('Swagger docs are disabled in production (set SWAGGER_PASSWORD to enable).');
  }

  await app.listen(port);
}

void bootstrap();
