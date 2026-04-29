import { Controller, Get } from '@nestjs/common';

@Controller()
export class RootController {
  @Get('/')
  healthCheck() {
    return { status: 'ok' };
  }
}
