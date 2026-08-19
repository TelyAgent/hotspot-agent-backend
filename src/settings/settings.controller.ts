import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get('audit')
  audit() {
    return this.service.audit();
  }

  @Get(':category')
  list(@Param('category') category: string) {
    return this.service.list(category);
  }

  @Post(':category')
  create(@Param('category') category: string, @Body() body: { name: string }) {
    return this.service.create(category, body);
  }

  @Put(':category/:id')
  update(@Param('category') category: string, @Param('id') id: string, @Body() body: object) {
    return this.service.update(category, id, body);
  }

  @Delete(':category/:id')
  remove(@Param('category') category: string, @Param('id') id: string) {
    return this.service.remove(category, id);
  }
}
