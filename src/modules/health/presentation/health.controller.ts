import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiOkEnvelope } from '../../../common/swagger/api-envelope.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness check' })
  @ApiOkEnvelope(undefined, 'Service is up.')
  check(): { status: string; service: string } {
    return { status: 'ok', service: 'elonuz-backend' };
  }
}
